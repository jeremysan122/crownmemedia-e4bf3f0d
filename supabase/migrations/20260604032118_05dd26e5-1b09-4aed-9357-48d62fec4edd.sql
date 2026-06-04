
-- Period & scope enums
DO $$ BEGIN
  CREATE TYPE public.ranking_period AS ENUM ('day','week','month','all');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.ranking_scope AS ENUM ('global','country','state','city');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Snapshot table
CREATE TABLE IF NOT EXISTS public.category_rankings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  period public.ranking_period NOT NULL,
  scope_type public.ranking_scope NOT NULL,
  scope_value text NOT NULL DEFAULT '',
  main_slug text NOT NULL,
  subcategory_slug text,
  user_id uuid NOT NULL,
  rank integer NOT NULL,
  prev_rank integer,
  score numeric NOT NULL DEFAULT 0,
  votes integer NOT NULL DEFAULT 0,
  snapshot_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (period, scope_type, scope_value, main_slug, subcategory_slug, user_id)
);

GRANT SELECT ON public.category_rankings TO anon, authenticated;
GRANT ALL ON public.category_rankings TO service_role;

ALTER TABLE public.category_rankings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "category_rankings_public_read" ON public.category_rankings
  FOR SELECT TO anon, authenticated USING (true);

CREATE INDEX IF NOT EXISTS idx_cat_rank_lookup
  ON public.category_rankings (period, scope_type, scope_value, main_slug, subcategory_slug, rank);
CREATE INDEX IF NOT EXISTS idx_cat_rank_user
  ON public.category_rankings (user_id);

-- Read RPC: leaderboard with profile fields joined
CREATE OR REPLACE FUNCTION public.get_category_leaderboard(
  _main_slug text,
  _sub_slug text DEFAULT NULL,
  _scope_type public.ranking_scope DEFAULT 'global',
  _scope_value text DEFAULT '',
  _period public.ranking_period DEFAULT 'week',
  _limit int DEFAULT 100
) RETURNS TABLE (
  rank integer,
  prev_rank integer,
  user_id uuid,
  score numeric,
  votes integer,
  username text,
  profile_photo_url text,
  city text,
  state text,
  country text,
  crowns_held integer,
  snapshot_at timestamptz
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT r.rank, r.prev_rank, r.user_id, r.score, r.votes,
         p.username, p.profile_photo_url, p.city, p.state, p.country,
         COALESCE(p.crowns_held, 0) AS crowns_held,
         r.snapshot_at
    FROM public.category_rankings r
    JOIN public.profiles p ON p.id = r.user_id
   WHERE r.period = _period
     AND r.scope_type = _scope_type
     AND r.scope_value = COALESCE(_scope_value, '')
     AND r.main_slug = _main_slug
     AND ((_sub_slug IS NULL AND r.subcategory_slug IS NULL)
          OR r.subcategory_slug = _sub_slug)
   ORDER BY r.rank ASC
   LIMIT _limit;
$$;

GRANT EXECUTE ON FUNCTION public.get_category_leaderboard(text, text, public.ranking_scope, text, public.ranking_period, int) TO anon, authenticated;

-- Snapshot function: recomputes rankings for every (hub, topic|NULL, scope, period)
CREATE OR REPLACE FUNCTION public.snapshot_category_ranks()
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_now timestamptz := now();
BEGIN
  -- Stage new rankings in a temp table
  CREATE TEMP TABLE IF NOT EXISTS _new_ranks (
    period public.ranking_period,
    scope_type public.ranking_scope,
    scope_value text,
    main_slug text,
    subcategory_slug text,
    user_id uuid,
    score numeric,
    votes integer,
    rank integer
  ) ON COMMIT DROP;

  TRUNCATE _new_ranks;

  -- Aggregate per (period, scope, hub, topic-or-null, user)
  WITH periods AS (
    SELECT * FROM (VALUES
      ('day'::public.ranking_period,   v_now - interval '1 day'),
      ('week'::public.ranking_period,  v_now - interval '7 days'),
      ('month'::public.ranking_period, v_now - interval '30 days'),
      ('all'::public.ranking_period,   'epoch'::timestamptz)
    ) AS t(period, since)
  ),
  base AS (
    SELECT pe.period,
           po.user_id,
           po.main_category_slug AS main_slug,
           po.subcategory_slug,
           LOWER(COALESCE(po.country, '')) AS country,
           LOWER(COALESCE(po.state, ''))   AS state,
           LOWER(COALESCE(po.city, ''))    AS city,
           COALESCE(po.crown_score, 0)::numeric AS score,
           COALESCE(po.vote_count, 0)::int     AS votes
      FROM public.posts po
      CROSS JOIN periods pe
     WHERE po.main_category_slug IS NOT NULL
       AND po.created_at >= pe.since
       AND COALESCE(po.is_archived, false) = false
       AND COALESCE(po.is_hidden, false)   = false
  ),
  -- Build one row per (scope) using UNION ALL
  scoped AS (
    SELECT period, 'global'::public.ranking_scope AS scope_type, ''::text AS scope_value,
           main_slug, subcategory_slug, user_id, score, votes FROM base
    UNION ALL
    SELECT period, 'country', country, main_slug, subcategory_slug, user_id, score, votes
      FROM base WHERE country <> ''
    UNION ALL
    SELECT period, 'state', state, main_slug, subcategory_slug, user_id, score, votes
      FROM base WHERE state <> ''
    UNION ALL
    SELECT period, 'city', city, main_slug, subcategory_slug, user_id, score, votes
      FROM base WHERE city <> ''
  ),
  -- Aggregate hub-only (subcategory_slug = NULL) AND hub+topic
  agg AS (
    SELECT period, scope_type, scope_value, main_slug,
           NULL::text AS subcategory_slug, user_id,
           SUM(score) AS score, SUM(votes)::int AS votes
      FROM scoped
     GROUP BY period, scope_type, scope_value, main_slug, user_id
    UNION ALL
    SELECT period, scope_type, scope_value, main_slug, subcategory_slug, user_id,
           SUM(score) AS score, SUM(votes)::int AS votes
      FROM scoped
     WHERE subcategory_slug IS NOT NULL
     GROUP BY period, scope_type, scope_value, main_slug, subcategory_slug, user_id
  ),
  ranked AS (
    SELECT *,
      ROW_NUMBER() OVER (
        PARTITION BY period, scope_type, scope_value, main_slug, subcategory_slug
        ORDER BY score DESC, votes DESC, user_id ASC
      )::int AS rank
      FROM agg
  )
  INSERT INTO _new_ranks
  SELECT period, scope_type, scope_value, main_slug, subcategory_slug,
         user_id, score, votes, rank
    FROM ranked
   WHERE rank <= 100;

  -- Upsert into snapshot table, carrying forward prev_rank
  INSERT INTO public.category_rankings AS r
    (period, scope_type, scope_value, main_slug, subcategory_slug,
     user_id, rank, prev_rank, score, votes, snapshot_at)
  SELECT n.period, n.scope_type, n.scope_value, n.main_slug, n.subcategory_slug,
         n.user_id, n.rank,
         (SELECT rank FROM public.category_rankings r2
            WHERE r2.period = n.period AND r2.scope_type = n.scope_type
              AND r2.scope_value = n.scope_value AND r2.main_slug = n.main_slug
              AND r2.subcategory_slug IS NOT DISTINCT FROM n.subcategory_slug
              AND r2.user_id = n.user_id),
         n.score, n.votes, v_now
    FROM _new_ranks n
  ON CONFLICT (period, scope_type, scope_value, main_slug, subcategory_slug, user_id)
  DO UPDATE SET
    prev_rank = r.rank,
    rank      = EXCLUDED.rank,
    score     = EXCLUDED.score,
    votes     = EXCLUDED.votes,
    snapshot_at = EXCLUDED.snapshot_at;

  -- Drop stale rows that fell out of top 100
  DELETE FROM public.category_rankings r
   WHERE NOT EXISTS (
     SELECT 1 FROM _new_ranks n
      WHERE n.period = r.period AND n.scope_type = r.scope_type
        AND n.scope_value = r.scope_value AND n.main_slug = r.main_slug
        AND n.subcategory_slug IS NOT DISTINCT FROM r.subcategory_slug
        AND n.user_id = r.user_id
   );
END;
$$;

GRANT EXECUTE ON FUNCTION public.snapshot_category_ranks() TO service_role;
