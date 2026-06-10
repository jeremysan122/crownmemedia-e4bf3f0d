-- ---------------------------------------------------------------------
-- 1) GRANT USAGE on `private` schema so SECURITY DEFINER helpers resolve.
--    The functions themselves are already SECURITY DEFINER, so privilege
--    scoping is unaffected — this only lets PostgREST look them up.
-- ---------------------------------------------------------------------
GRANT USAGE ON SCHEMA private TO authenticated, anon;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA private TO authenticated, anon;
ALTER DEFAULT PRIVILEGES IN SCHEMA private
  GRANT EXECUTE ON FUNCTIONS TO authenticated, anon;

-- ---------------------------------------------------------------------
-- 2) Extend analytics_event_name_valid to cover all event names the
--    client already emits (src/lib/analytics.ts EventName union).
-- ---------------------------------------------------------------------
ALTER TABLE public.analytics_events
  DROP CONSTRAINT IF EXISTS analytics_event_name_valid;

ALTER TABLE public.analytics_events
  ADD CONSTRAINT analytics_event_name_valid CHECK (event_name = ANY (ARRAY[
    'vote_cast','vote_removed','comment_posted','comment_fired','comment_fire_removed',
    'post_shared','post_viewed','post_edited','post_deleted','post_reposted',
    'post_tagged_people','post_scheduled',
    'user_blocked','user_reported',
    'age_gate_viewed','age_gate_confirmed','age_gate_blocked_underage',
    'age_gate_checkbox_toggled','age_reverify_required',
    'feed_opened','scrolls_opened','crown_map_opened','crown_map_marker_opened',
    'leaderboard_opened','profile_opened',
    'share_card_previewed','share_card_downloaded',
    'dm_opened','dm_sent','notifications_opened','post_page_opened',
    'share_dialog_opened','vote_attempted','vote_success','vote_failed',
    'verification_page_opened'
  ]));

-- ---------------------------------------------------------------------
-- 3) Lightweight structured logging for cron/ranking job failures.
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.cron_error_log (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  job_name text NOT NULL,
  sqlstate text,
  error_message text,
  context jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.cron_error_log TO authenticated;
GRANT ALL ON public.cron_error_log TO service_role;

ALTER TABLE public.cron_error_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can read cron error log"
  ON public.cron_error_log FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::public.app_role));

CREATE INDEX IF NOT EXISTS cron_error_log_job_created_idx
  ON public.cron_error_log (job_name, created_at DESC);

-- Replace snapshot_category_ranks with EXCEPTION-wrapped logging.
CREATE OR REPLACE FUNCTION public.snapshot_category_ranks()
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_now timestamptz := now();
  v_sqlstate text;
  v_msg text;
  v_ctx text;
  v_phase text := 'init';
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

  v_phase := 'compute_ranks';
  WITH periods AS (
    SELECT * FROM (VALUES
      ('day'::public.ranking_period,   v_now - interval '1 day'),
      ('week'::public.ranking_period,  v_now - interval '7 days'),
      ('month'::public.ranking_period, v_now - interval '30 days'),
      ('all'::public.ranking_period,   'epoch'::timestamptz)
    ) AS t(period, since)
  ),
  base AS (
    SELECT pe.period, po.user_id, po.main_category_slug AS main_slug, po.subcategory_slug,
           LOWER(COALESCE(po.country,'')) AS country,
           LOWER(COALESCE(po.state,''))   AS state,
           LOWER(COALESCE(po.city,''))    AS city,
           COALESCE(po.crown_score,0)::numeric AS score,
           COALESCE(po.vote_count,0)::int     AS votes
      FROM public.posts po CROSS JOIN periods pe
     WHERE po.main_category_slug IS NOT NULL
       AND po.created_at >= pe.since
       AND COALESCE(po.is_archived,false) = false
  ),
  scoped AS (
    SELECT period,'global'::public.ranking_scope AS scope_type,''::text AS scope_value,
           main_slug, subcategory_slug, user_id, score, votes FROM base
    UNION ALL SELECT period,'country',country, main_slug, subcategory_slug, user_id, score, votes FROM base WHERE country<>''
    UNION ALL SELECT period,'state',  state,   main_slug, subcategory_slug, user_id, score, votes FROM base WHERE state<>''
    UNION ALL SELECT period,'city',   city,    main_slug, subcategory_slug, user_id, score, votes FROM base WHERE city<>''
  ),
  agg AS (
    SELECT period, scope_type, scope_value, main_slug, NULL::text AS subcategory_slug, user_id,
           SUM(score) AS score, SUM(votes)::int AS votes
      FROM scoped GROUP BY period, scope_type, scope_value, main_slug, user_id
    UNION ALL
    SELECT period, scope_type, scope_value, main_slug, subcategory_slug, user_id,
           SUM(score) AS score, SUM(votes)::int AS votes
      FROM scoped WHERE subcategory_slug IS NOT NULL
     GROUP BY period, scope_type, scope_value, main_slug, subcategory_slug, user_id
  ),
  ranked AS (
    SELECT *, ROW_NUMBER() OVER (
        PARTITION BY period, scope_type, scope_value, main_slug, subcategory_slug
        ORDER BY score DESC, votes DESC, user_id ASC
      )::int AS rank FROM agg
  )
  INSERT INTO _new_ranks
  SELECT period, scope_type, scope_value, main_slug, subcategory_slug, user_id, score, votes, rank
    FROM ranked WHERE rank <= 100;

  v_phase := 'upsert';
  INSERT INTO public.category_rankings AS r
    (period, scope_type, scope_value, main_slug, subcategory_slug,
     user_id, rank, prev_rank, score, votes, snapshot_at)
  SELECT n.period, n.scope_type, n.scope_value, n.main_slug, n.subcategory_slug,
         n.user_id, n.rank, prev.rank, n.score, n.votes, v_now
    FROM _new_ranks n
    LEFT JOIN LATERAL (
      SELECT r2.rank FROM public.category_rankings r2
       WHERE r2.period = n.period AND r2.scope_type = n.scope_type
         AND r2.scope_value = n.scope_value AND r2.main_slug = n.main_slug
         AND r2.subcategory_slug IS NOT DISTINCT FROM n.subcategory_slug
         AND r2.user_id = n.user_id
       ORDER BY r2.snapshot_at DESC NULLS LAST LIMIT 1
    ) prev ON true
  ON CONFLICT (period, scope_type, scope_value, main_slug, subcategory_slug, user_id)
  DO UPDATE SET
    prev_rank   = r.rank,
    rank        = EXCLUDED.rank,
    score       = EXCLUDED.score,
    votes       = EXCLUDED.votes,
    snapshot_at = EXCLUDED.snapshot_at;

  v_phase := 'prune';
  DELETE FROM public.category_rankings r
   WHERE NOT EXISTS (
     SELECT 1 FROM _new_ranks n
      WHERE n.period = r.period AND n.scope_type = r.scope_type
        AND n.scope_value = r.scope_value AND n.main_slug = r.main_slug
        AND n.subcategory_slug IS NOT DISTINCT FROM r.subcategory_slug
        AND n.user_id = r.user_id
   );

EXCEPTION WHEN OTHERS THEN
  GET STACKED DIAGNOSTICS
    v_sqlstate = RETURNED_SQLSTATE,
    v_msg      = MESSAGE_TEXT,
    v_ctx      = PG_EXCEPTION_CONTEXT;
  BEGIN
    INSERT INTO public.cron_error_log (job_name, sqlstate, error_message, context)
    VALUES (
      'snapshot_category_ranks',
      v_sqlstate,
      v_msg,
      jsonb_build_object(
        'phase', v_phase,
        'pg_context', v_ctx,
        'captured_at', v_now,
        'new_ranks_rows', (SELECT count(*) FROM _new_ranks)
      )
    );
  EXCEPTION WHEN OTHERS THEN
    -- never let logging mask the original error
    NULL;
  END;
  RAISE;
END;
$function$;