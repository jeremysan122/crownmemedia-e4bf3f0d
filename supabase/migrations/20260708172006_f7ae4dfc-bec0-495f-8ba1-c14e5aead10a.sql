-- Schedule crown_map_points refresh via pg_cron.
-- The function is SECURITY DEFINER and refresh_crown_map_points() allows service_role
-- (auth.uid() IS NULL bypasses the admin gate), so pg_cron (superuser context) can call it.

CREATE EXTENSION IF NOT EXISTS pg_cron;

-- Immediate seed run after deploy (runs once ~1 minute from now, then we unschedule).
DO $$
DECLARE
  existing_id bigint;
BEGIN
  -- Unschedule any prior version to keep this idempotent.
  SELECT jobid INTO existing_id FROM cron.job WHERE jobname = 'crown_map_points_refresh_hourly';
  IF existing_id IS NOT NULL THEN
    PERFORM cron.unschedule(existing_id);
  END IF;

  SELECT jobid INTO existing_id FROM cron.job WHERE jobname = 'crown_map_points_refresh_bootstrap';
  IF existing_id IS NOT NULL THEN
    PERFORM cron.unschedule(existing_id);
  END IF;
END $$;

-- Hourly refresh at minute 7 (staggered off the hour).
SELECT cron.schedule(
  'crown_map_points_refresh_hourly',
  '7 * * * *',
  $$SELECT public.refresh_crown_map_points();$$
);

-- One-shot bootstrap: run in the next minute so the cache is seeded right after deploy.
-- We schedule it, and the function itself will unschedule the bootstrap job after first run.
SELECT cron.schedule(
  'crown_map_points_refresh_bootstrap',
  '* * * * *',
  $$
    SELECT public.refresh_crown_map_points();
    SELECT cron.unschedule('crown_map_points_refresh_bootstrap');
  $$
);
