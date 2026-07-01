
-- 1) Add aspect_ratio metadata to posts (nullable, no default so legacy rows fall back to media_type heuristic in postMediaFrame)
ALTER TABLE public.posts
  ADD COLUMN IF NOT EXISTS aspect_ratio text;

COMMENT ON COLUMN public.posts.aspect_ratio IS
  'Canonical media aspect ratio label (e.g. 1:1, 4:5, 9:16, 1.91:1). NULL falls back to media_type heuristic in postMediaFrame.ts.';

-- 2) Formalize process-email-queue cadence at every 2 minutes and drop any duplicates.
DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN
    SELECT jobid, jobname
    FROM cron.job
    WHERE jobname IN ('process-email-queue', 'process-email-queue-1m', 'process-email-queue-2m')
  LOOP
    PERFORM cron.unschedule(r.jobid);
  END LOOP;
END $$;

SELECT cron.schedule(
  'process-email-queue-2m',
  '*/2 * * * *',
  $cron$
  SELECT net.http_post(
    url := 'https://bailrqskqpmzvsgivhvm.supabase.co/functions/v1/process-email-queue',
    headers := '{"Content-Type": "application/json", "apikey": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJhaWxycXNrcXBtenZzZ2l2aHZtIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzc0NDY2MTEsImV4cCI6MjA5MzAyMjYxMX0.Hb3smntxOqMfIPZ19mlQyjuy8HHVZQFVIzBhk85HRl0"}'::jsonb,
    body := jsonb_build_object('trigger', 'cron', 'ts', now())
  );
  $cron$
);
