-- Retention: delete rank snapshots older than 14 days
CREATE OR REPLACE FUNCTION public.prune_rank_snapshots()
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  DELETE FROM public.rank_snapshots WHERE captured_at < now() - INTERVAL '14 days';
$$;
REVOKE ALL ON FUNCTION public.prune_rank_snapshots() FROM PUBLIC, anon, authenticated;

-- Restrictive lockdown on filter_streaks: only the SECURITY DEFINER
-- bump_filter_streak() function may write. Direct INSERT/UPDATE/DELETE
-- from any client (anon or authenticated) is denied.
CREATE POLICY "Deny direct writes to filter_streaks"
  ON public.filter_streaks AS RESTRICTIVE
  FOR ALL TO anon, authenticated
  USING (false)
  WITH CHECK (false);

-- Schedule daily pruning at 03:17 UTC
SELECT cron.unschedule('prune-rank-snapshots-daily') WHERE EXISTS (
  SELECT 1 FROM cron.job WHERE jobname = 'prune-rank-snapshots-daily'
);
SELECT cron.schedule(
  'prune-rank-snapshots-daily',
  '17 3 * * *',
  $$ SELECT public.prune_rank_snapshots(); $$
);