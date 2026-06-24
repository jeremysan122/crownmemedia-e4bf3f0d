-- Schedule the three critical background jobs via pg_cron + pg_net.
-- These call the edge functions over HTTP using the project anon key.

CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

-- Helper: unschedule by name if it exists (avoid duplicate-job errors on re-run)
DO $$
DECLARE
  j text;
BEGIN
  FOR j IN SELECT jobname FROM cron.job
           WHERE jobname IN ('snapshot-ranks-hourly','process-email-queue-1m','streak-reminder-hourly')
  LOOP
    PERFORM cron.unschedule(j);
  END LOOP;
END$$;

-- snapshot-ranks: every hour at :05
SELECT cron.schedule(
  'snapshot-ranks-hourly',
  '5 * * * *',
  $$
  SELECT net.http_post(
    url := 'https://bailrqskqpmzvsgivhvm.supabase.co/functions/v1/snapshot-ranks',
    headers := jsonb_build_object(
      'Content-Type','application/json',
      'Authorization','Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJhaWxycXNrcXBtenZzZ2l2aHZtIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzc0NDY2MTEsImV4cCI6MjA5MzAyMjYxMX0.Hb3smntxOqMfIPZ19mlQyjuy8HHVZQFVIzBhk85HRl0'
    ),
    body := '{}'::jsonb
  );
  $$
);

-- process-email-queue: every minute
SELECT cron.schedule(
  'process-email-queue-1m',
  '* * * * *',
  $$
  SELECT net.http_post(
    url := 'https://bailrqskqpmzvsgivhvm.supabase.co/functions/v1/process-email-queue',
    headers := jsonb_build_object(
      'Content-Type','application/json',
      'Authorization','Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJhaWxycXNrcXBtenZzZ2l2aHZtIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzc0NDY2MTEsImV4cCI6MjA5MzAyMjYxMX0.Hb3smntxOqMfIPZ19mlQyjuy8HHVZQFVIzBhk85HRl0'
    ),
    body := '{}'::jsonb
  );
  $$
);

-- streak-reminder: hourly at :15
SELECT cron.schedule(
  'streak-reminder-hourly',
  '15 * * * *',
  $$
  SELECT net.http_post(
    url := 'https://bailrqskqpmzvsgivhvm.supabase.co/functions/v1/streak-reminder',
    headers := jsonb_build_object(
      'Content-Type','application/json',
      'Authorization','Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJhaWxycXNrcXBtenZzZ2l2aHZtIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzc0NDY2MTEsImV4cCI6MjA5MzAyMjYxMX0.Hb3smntxOqMfIPZ19mlQyjuy8HHVZQFVIzBhk85HRl0'
    ),
    body := '{}'::jsonb
  );
  $$
);
