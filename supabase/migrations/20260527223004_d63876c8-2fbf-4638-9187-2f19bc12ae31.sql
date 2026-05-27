
-- 1. Truncate cron history logs (does not touch jobs themselves or any app data)
TRUNCATE TABLE cron.job_run_details;

-- 2. Daily pruning job
DO $$
DECLARE v_id bigint;
BEGIN
  SELECT jobid INTO v_id FROM cron.job WHERE jobname = 'prune-cron-job-run-details';
  IF v_id IS NOT NULL THEN
    PERFORM cron.unschedule(v_id);
  END IF;
END $$;

SELECT cron.schedule(
  'prune-cron-job-run-details',
  '0 3 * * *',
  $$ DELETE FROM cron.job_run_details WHERE start_time < now() - interval '3 days'; $$
);

-- 3. Re-schedule the email queue job at 30s, preserving its existing command
DO $$
DECLARE
  v_cmd text;
  v_jobid bigint;
  v_name text;
BEGIN
  SELECT jobid, jobname, command
    INTO v_jobid, v_name, v_cmd
    FROM cron.job
    WHERE jobname IN ('process-email-queue', 'process-mail-queue')
    ORDER BY jobname
    LIMIT 1;

  IF v_jobid IS NOT NULL THEN
    PERFORM cron.unschedule(v_jobid);
    PERFORM cron.schedule(v_name, '30 seconds', v_cmd);
  END IF;
END $$;
