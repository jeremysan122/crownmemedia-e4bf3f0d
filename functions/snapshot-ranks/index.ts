// Scheduled snapshotter — captures top 200 posts per OFFICIAL TOPIC per scope
// (global, city, state) so PostDetailDialog / RankHistoryTimeline can render
// rank-over-time using the official CrownMe Master Category + Topic system.
//
// Backward compatibility:
//   • rank_snapshots.category (crown_category enum, NOT NULL) is still
//     populated from the snapshotted post's own posts.category, so legacy
//     consumers keep working.
//   • New nullable columns rank_snapshots.main_category_slug /
//     subcategory_slug carry the official taxonomy. Future readers can filter
//     by these instead of the legacy enum.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface PostRow {
  id: string;
  category: string;
  city: string | null;
  state: string | null;
  country: string | null;
  crown_score: number;
  created_at: string;
  main_category_slug: string | null;
  subcategory_slug: string | null;
}

interface Topic {
  slug: string;
  main_slug: string;
}

const PER_SCOPE_LIMIT = 200;

const stableSort = (a: PostRow, b: PostRow) => {
  if (b.crown_score !== a.crown_score) return b.crown_score - a.crown_score;
  const at = new Date(a.created_at).getTime();
  const bt = new Date(b.created_at).getTime();
  if (at !== bt) return at - bt;
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  // Auth: require either a matching cron secret OR an admin JWT.
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

  // 1) Load official active topics from DB (source of truth).
  const { data: subcats, error: subErr } = await supabase
    .from("subcategories")
    .select("slug, is_active, main_category_id, main_categories!inner(slug)")
    .eq("is_active", true);

  if (subErr) {
    return new Response(JSON.stringify({ error: `Failed to load topics: ${subErr.message}` }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const topics: Topic[] = (subcats ?? []).map((s: any) => ({
    slug: s.slug as string,
    main_slug: s.main_categories?.slug as string,
  })).filter((t) => t.slug && t.main_slug);

  const rows: Array<Record<string, unknown>> = [];

  const eligibleSelect =
    "id, category, city, state, country, crown_score, created_at, main_category_slug, subcategory_slug";

  const baseFilter = (q: any) =>
    q.eq("is_removed", false)
     .eq("is_archived", false)
     .eq("moderation_status", "approved");

  for (const topic of topics) {
    // GLOBAL — top N for this official topic.
    const { data: globalPosts, error: gErr } = await baseFilter(
      supabase.from("posts").select(eligibleSelect),
    )
      .eq("subcategory_slug", topic.slug)
      .order("crown_score", { ascending: false })
      .order("created_at", { ascending: true })
      .order("id", { ascending: true })
      .limit(PER_SCOPE_LIMIT);

    if (gErr) continue;
    const globalList = ((globalPosts ?? []) as PostRow[]).slice().sort(stableSort);

    globalList.forEach((p, idx) => {
      rows.push({
        post_id: p.id,
        category: p.category, // legacy enum — preserved from the post itself
        main_category_slug: topic.main_slug,
        subcategory_slug: topic.slug,
        scope: "global", region: "Global",
        rank: idx + 1, total: globalList.length, crown_score: p.crown_score,
        captured_at: capturedAt,
      });
    });

    // Determine which cities / states to track for this topic.
    // (Tracked regions = those present in the global top-N; ranking *within*
    // each region is computed from a fresh per-region query so a city #1 that
    // is not in the global top-N still gets ranked accurately.)
    const cities = new Set<string>();
    const states = new Set<string>();
    for (const p of globalList) {
      if (p.city) cities.add(p.city);
      if (p.state) states.add(p.state);
    }

    for (const city of cities) {
      const { data: cityPosts } = await baseFilter(
        supabase.from("posts").select(eligibleSelect),
      )
        .eq("subcategory_slug", topic.slug)
        .eq("city", city)
        .order("crown_score", { ascending: false })
        .order("created_at", { ascending: true })
        .order("id", { ascending: true })
        .limit(PER_SCOPE_LIMIT);

      const list = ((cityPosts ?? []) as PostRow[]).slice().sort(stableSort);
      list.forEach((p, idx) => {
        rows.push({
          post_id: p.id,
          category: p.category,
          main_category_slug: topic.main_slug,
          subcategory_slug: topic.slug,
          scope: "city", region: city,
          rank: idx + 1, total: list.length, crown_score: p.crown_score,
          captured_at: capturedAt,
        });
      });
    }

    for (const state of states) {
      const { data: statePosts } = await baseFilter(
        supabase.from("posts").select(eligibleSelect),
      )
        .eq("subcategory_slug", topic.slug)
        .eq("state", state)
        .order("crown_score", { ascending: false })
        .order("created_at", { ascending: true })
        .order("id", { ascending: true })
        .limit(PER_SCOPE_LIMIT);

      const list = ((statePosts ?? []) as PostRow[]).slice().sort(stableSort);
      list.forEach((p, idx) => {
        rows.push({
          post_id: p.id,
          category: p.category,
          main_category_slug: topic.main_slug,
          subcategory_slug: topic.slug,
          scope: "state", region: state,
          rank: idx + 1, total: list.length, crown_score: p.crown_score,
          captured_at: capturedAt,
        });
      });
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

  return new Response(
    JSON.stringify({ ok: true, inserted, topics: topics.length, capturedAt }),
    { headers: { ...corsHeaders, "Content-Type": "application/json" } },
  );
});
