// Scheduled snapshotter — captures top 200 posts per OFFICIAL TOPIC per scope
// (global, city, state) so PostDetailDialog / RankHistoryTimeline can render
// rank-over-time using the official CrownMe Master Category + Topic system.
//
// Backward compatibility:
//   • rank_snapshots.category (crown_category enum, NOT NULL) is still
//     populated from the snapshotted post's own posts.category, so legacy
//     consumers keep working. Official slug values are NEVER written into
//     rank_snapshots.category — they go into the new nullable slug columns.
//   • New nullable columns rank_snapshots.main_category_slug /
//     subcategory_slug carry the official taxonomy.
//
// Optional query params (cron / admin only — auth is still enforced):
//   ?dryRun=true        → compute rows, log totals, do NOT insert.
//   ?topic=best-style   → restrict to one subcategory_slug.
//   ?scope=global|city|state  → restrict to one scope.
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
const ALLOWED_SCOPES = new Set(["global", "city", "state"]);

const stableSort = (a: PostRow, b: PostRow) => {
  if (b.crown_score !== a.crown_score) return b.crown_score - a.crown_score;
  const at = new Date(a.created_at).getTime();
  const bt = new Date(b.created_at).getTime();
  if (at !== bt) return at - bt;
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  // ─── Auth: cron secret OR admin JWT ─────────────────────────────────────
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
      } catch { /* fall through to 401 */ }
    }
  }

  if (!authorized) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  // ─── Query params ───────────────────────────────────────────────────────
  const url = new URL(req.url);
  const dryRun = url.searchParams.get("dryRun") === "true";
  const topicFilter = url.searchParams.get("topic");
  const scopeFilterRaw = url.searchParams.get("scope");
  const scopeFilter = scopeFilterRaw && ALLOWED_SCOPES.has(scopeFilterRaw) ? scopeFilterRaw : null;

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  const capturedAt = new Date().toISOString();
  const warnings: string[] = [];
  const errors: string[] = [];
  const rowsInsertedByScope: Record<string, number> = { global: 0, city: 0, state: 0 };
  let skippedTopics = 0;
  let skippedScopes = 0;

  console.info("[snapshot-ranks] start", { capturedAt, dryRun, topicFilter, scopeFilter });

  // ─── 1) Load official active topics ─────────────────────────────────────
  let topicQuery = supabase
    .from("subcategories")
    .select("slug, is_active, main_category_id, main_categories!inner(slug)")
    .eq("is_active", true);
  if (topicFilter) topicQuery = topicQuery.eq("slug", topicFilter);

  const { data: subcats, error: subErr } = await topicQuery;
  if (subErr) {
    console.error("[snapshot-ranks] topic-load failed", subErr.message);
    return new Response(
      JSON.stringify({ ok: false, error: `Failed to load topics: ${subErr.message}` }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }

  const topics: Topic[] = (subcats ?? [])
    .map((s: any) => ({ slug: s.slug as string, main_slug: s.main_categories?.slug as string }))
    .filter((t) => t.slug && t.main_slug);

  const masterCategories = new Set(topics.map((t) => t.main_slug));
  console.info("[snapshot-ranks] topics loaded", {
    topicsProcessed: topics.length,
    masterCategoriesProcessed: masterCategories.size,
  });

  const rows: Array<Record<string, unknown>> = [];

  const eligibleSelect =
    "id, category, city, state, country, crown_score, created_at, main_category_slug, subcategory_slug";

  const baseFilter = (q: any) =>
    q.eq("is_removed", false)
     .eq("is_archived", false)
     .eq("moderation_status", "approved");

  const wantScope = (s: string) => !scopeFilter || scopeFilter === s;
  const scopesProcessed = ["global", "city", "state"].filter(wantScope);

  // ─── 2) Per-topic snapshotting ──────────────────────────────────────────
  for (const topic of topics) {
    let topicHadAnyRow = false;

    // GLOBAL
    if (wantScope("global")) {
      const { data: globalPosts, error: gErr } = await baseFilter(
        supabase.from("posts").select(eligibleSelect),
      )
        .eq("subcategory_slug", topic.slug)
        .order("crown_score", { ascending: false })
        .order("created_at", { ascending: true })
        .order("id", { ascending: true })
        .limit(PER_SCOPE_LIMIT);

      if (gErr) {
        const msg = `global query failed for topic=${topic.slug}: ${gErr.message}`;
        console.error("[snapshot-ranks]", msg);
        errors.push(msg);
        skippedScopes++;
      } else {
        const globalList = ((globalPosts ?? []) as PostRow[]).slice().sort(stableSort);
        if (globalList.length > 0) topicHadAnyRow = true;

        globalList.forEach((p, idx) => {
          rows.push({
            post_id: p.id,
            category: p.category, // legacy enum — preserved
            main_category_slug: topic.main_slug,
            subcategory_slug: topic.slug,
            scope: "global", region: "Global",
            rank: idx + 1, total: globalList.length, crown_score: p.crown_score,
            captured_at: capturedAt,
          });
        });

        // Cities/States seed list comes from globalList just to know which
        // regions to track. Actual ranking is computed per-region below.
        const cities = new Set<string>();
        const states = new Set<string>();
        for (const p of globalList) {
          if (p.city) cities.add(p.city);
          if (p.state) states.add(p.state);
        }

        if (wantScope("city")) {
          for (const city of cities) {
            const { data: cityPosts, error: cErr } = await baseFilter(
              supabase.from("posts").select(eligibleSelect),
            )
              .eq("subcategory_slug", topic.slug)
              .eq("city", city)
              .order("crown_score", { ascending: false })
              .order("created_at", { ascending: true })
              .order("id", { ascending: true })
              .limit(PER_SCOPE_LIMIT);

            if (cErr) {
              const msg = `city query failed for topic=${topic.slug} city=${city}: ${cErr.message}`;
              console.error("[snapshot-ranks]", msg);
              errors.push(msg);
              skippedScopes++;
              continue;
            }
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
        }

        if (wantScope("state")) {
          for (const state of states) {
            const { data: statePosts, error: sErr } = await baseFilter(
              supabase.from("posts").select(eligibleSelect),
            )
              .eq("subcategory_slug", topic.slug)
              .eq("state", state)
              .order("crown_score", { ascending: false })
              .order("created_at", { ascending: true })
              .order("id", { ascending: true })
              .limit(PER_SCOPE_LIMIT);

            if (sErr) {
              const msg = `state query failed for topic=${topic.slug} state=${state}: ${sErr.message}`;
              console.error("[snapshot-ranks]", msg);
              errors.push(msg);
              skippedScopes++;
              continue;
            }
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
      }
    }

    if (!topicHadAnyRow) skippedTopics++;
  }

  // Tally per-scope
  for (const r of rows) {
    const s = String((r as any).scope);
    if (s in rowsInsertedByScope) rowsInsertedByScope[s]++;
  }

  console.info("[snapshot-ranks] prepared", {
    rowsPrepared: rows.length,
    rowsInsertedByScope,
    skippedTopics,
    skippedScopes,
  });

  // ─── 3) Insert (skipped on dryRun) ──────────────────────────────────────
  let inserted = 0;
  if (!dryRun) {
    const CHUNK = 1000;
    for (let i = 0; i < rows.length; i += CHUNK) {
      const chunk = rows.slice(i, i + CHUNK);
      const { error } = await supabase.from("rank_snapshots").insert(chunk);
      if (error) {
        console.error("[snapshot-ranks] insert failed", { inserted, message: error.message });
        return new Response(
          JSON.stringify({
            ok: false, error: error.message, inserted, capturedAt,
            topicsProcessed: topics.length,
            masterCategoriesProcessed: masterCategories.size,
            scopesProcessed, rowsPrepared: rows.length,
            rowsInsertedByScope, skippedTopics, skippedScopes,
            warnings, errors: [...errors, error.message],
          }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }
      inserted += chunk.length;
    }
  } else {
    warnings.push("dryRun=true — no rows inserted");
  }

  console.info("[snapshot-ranks] done", { inserted, dryRun, errorsCount: errors.length });

  return new Response(
    JSON.stringify({
      ok: true,
      capturedAt,
      dryRun,
      inserted,
      topicsProcessed: topics.length,
      masterCategoriesProcessed: masterCategories.size,
      scopesProcessed,
      skippedTopics,
      skippedScopes,
      rowsPrepared: rows.length,
      rowsInsertedByScope,
      warnings,
      errors,
    }),
    { headers: { ...corsHeaders, "Content-Type": "application/json" } },
  );
});
