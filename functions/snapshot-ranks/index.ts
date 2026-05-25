// Scheduled snapshotter — captures top 200 posts per category per scope so
// PostDetailDialog can render a real rank-over-time timeline.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const CATEGORIES = [
  "overall", "beauty", "style", "talent", "fitness", "food", "pets", "art",
  "music", "comedy", "travel", "luxury",
] as const;

interface PostRow {
  id: string;
  category: string;
  city: string | null;
  state: string | null;
  country: string | null;
  crown_score: number;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  // Auth: require either a matching cron secret OR an admin JWT.
  // This prevents anonymous abuse of an expensive bulk SELECT+INSERT job.
  const cronSecret = Deno.env.get("SNAPSHOT_RANKS_CRON_SECRET");
  const providedSecret = req.headers.get("x-cron-secret");
  let authorized = !!(cronSecret && providedSecret && providedSecret === cronSecret);

  if (!authorized) {
    const authHeader = req.headers.get("Authorization");
    if (authHeader?.startsWith("Bearer ")) {
      try {
        const userClient = createClient(
          Deno.env.get("SUPABASE_URL")!,
          Deno.env.get("SUPABASE_ANON_KEY")!,
          { global: { headers: { Authorization: authHeader } } },
        );
        const { data: userData } = await userClient.auth.getUser();
        if (userData?.user) {
          const { data: roleRow } = await userClient
            .from("user_roles")
            .select("role")
            .eq("user_id", userData.user.id)
            .eq("role", "admin")
            .maybeSingle();
          if (roleRow) authorized = true;
        }
      } catch {
        /* fall through to 401 */
      }
    }
  }

  if (!authorized) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  const capturedAt = new Date().toISOString();
  const rows: Array<Record<string, unknown>> = [];

  for (const category of CATEGORIES) {
    // Global ranking
    const { data: globalPosts } = await supabase
      .from("posts")
      .select("id, category, city, state, country, crown_score")
      .eq("is_removed", false)
      .eq("category", category)
      .order("crown_score", { ascending: false })
      .limit(200);

    const globalList = (globalPosts ?? []) as PostRow[];
    globalList.forEach((p, idx) => {
      rows.push({
        post_id: p.id, category, scope: "global", region: "Global",
        rank: idx + 1, total: globalList.length, crown_score: p.crown_score,
        captured_at: capturedAt,
      });
    });

    // City + state rankings — only for top regions present in this category
    const buckets: Record<"city" | "state", Map<string, PostRow[]>> = {
      city: new Map(), state: new Map(),
    };
    for (const p of globalList) {
      if (p.city)  (buckets.city.get(p.city)  ?? buckets.city.set(p.city, []).get(p.city)!).push(p);
      if (p.state) (buckets.state.get(p.state) ?? buckets.state.set(p.state, []).get(p.state)!).push(p);
    }
    for (const scope of ["city", "state"] as const) {
      for (const [region, list] of buckets[scope]) {
        list.sort((a, b) => b.crown_score - a.crown_score);
        list.forEach((p, idx) => {
          rows.push({
            post_id: p.id, category, scope, region,
            rank: idx + 1, total: list.length, crown_score: p.crown_score,
            captured_at: capturedAt,
          });
        });
      }
    }
  }

  // Insert in chunks
  const CHUNK = 1000;
  let inserted = 0;
  for (let i = 0; i < rows.length; i += CHUNK) {
    const chunk = rows.slice(i, i + CHUNK);
    const { error } = await supabase.from("rank_snapshots").insert(chunk);
    if (error) {
      return new Response(JSON.stringify({ error: error.message, inserted }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    inserted += chunk.length;
  }

  return new Response(JSON.stringify({ ok: true, inserted, capturedAt }), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
