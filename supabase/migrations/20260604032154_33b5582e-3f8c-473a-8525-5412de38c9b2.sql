
CREATE OR REPLACE FUNCTION public.snapshot_category_ranks()
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_now timestamptz := now();
BEGIN
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
  ),
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
