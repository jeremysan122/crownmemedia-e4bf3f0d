-- 1) Revoke EXECUTE from PUBLIC on all SECURITY DEFINER functions in public schema
DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT n.nspname, p.proname,
           pg_get_function_identity_arguments(p.oid) AS args
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.prosecdef = true
  LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %I.%I(%s) FROM PUBLIC, anon, authenticated',
                   r.nspname, r.proname, r.args);
  END LOOP;
END $$;

-- 2) Re-grant EXECUTE to `authenticated` only for functions that signed-in users
--    legitimately invoke either as RPCs or as part of RLS/trigger evaluation.
GRANT EXECUTE ON FUNCTION public.bump_filter_streak(text)            TO authenticated;
GRANT EXECUTE ON FUNCTION public.send_royal_gift(text, uuid, uuid, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_royal_pass_active(uuid)          TO authenticated;
GRANT EXECUTE ON FUNCTION public.ensure_my_wallet()                  TO authenticated;
GRANT EXECUTE ON FUNCTION public.confirm_my_age(date)                TO authenticated;
GRANT EXECUTE ON FUNCTION public.purchase_boost(text, integer, numeric) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_my_profile_sensitive()          TO authenticated;

-- Functions used inside RLS policies (need EXECUTE for the calling role)
GRANT EXECUTE ON FUNCTION public.has_role(uuid, app_role)            TO authenticated;
GRANT EXECUTE ON FUNCTION public.notif_pref(uuid, text)              TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_thread_muted(uuid, uuid)         TO authenticated;

-- 3) Backfill filter_streaks from recent vote history.
-- For each (user, post.filter), compute the current consecutive-day streak ending
-- at the user's most recent vote on a post with that filter, plus the longest run.
WITH vote_days AS (
  SELECT DISTINCT
    v.user_id,
    p.filter,
    (v.created_at AT TIME ZONE 'utc')::date AS d
  FROM public.votes v
  JOIN public.posts p ON p.id = v.post_id
  WHERE p.filter IS NOT NULL
    AND p.filter IN ('sepia','noir','vivid','fade','chrome',
                     'shimmer','glitch','pulse-glow','scanlines','gold-sparkle')
),
grouped AS (
  SELECT
    user_id, filter, d,
    d - (ROW_NUMBER() OVER (PARTITION BY user_id, filter ORDER BY d))::int AS grp
  FROM vote_days
),
runs AS (
  SELECT
    user_id, filter, grp,
    COUNT(*)::int AS run_len,
    MAX(d) AS run_end,
    MIN(d) AS run_start
  FROM grouped
  GROUP BY user_id, filter, grp
),
agg AS (
  SELECT
    user_id,
    filter,
    MAX(run_len) AS longest,
    -- current streak: only the most recent run, and only if it ended yesterday or today (UTC)
    MAX(run_len) FILTER (
      WHERE run_end >= ((now() AT TIME ZONE 'utc')::date - INTERVAL '1 day')
    ) AS current_run,
    MAX(run_end) AS last_vote_date
  FROM runs
  GROUP BY user_id, filter
)
INSERT INTO public.filter_streaks
  (user_id, filter, current_streak, longest_streak, last_vote_date)
SELECT
  user_id,
  filter,
  COALESCE(current_run, 0),
  longest,
  last_vote_date
FROM agg
ON CONFLICT (user_id, filter) DO UPDATE
  SET current_streak = GREATEST(public.filter_streaks.current_streak, EXCLUDED.current_streak),
      longest_streak = GREATEST(public.filter_streaks.longest_streak, EXCLUDED.longest_streak),
      last_vote_date = GREATEST(public.filter_streaks.last_vote_date, EXCLUDED.last_vote_date),
      updated_at = now();