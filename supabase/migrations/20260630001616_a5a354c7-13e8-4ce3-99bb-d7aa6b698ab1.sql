
-- =====================================================================
-- DB load reduction: dedupe cron jobs, slow non-critical schedules,
-- add count RPCs to replace 1000-row unread scans.
-- =====================================================================

-- 1) CRON CLEANUP
-- Drop the 5-second email-queue ping (~380k DB calls). Keep the 1-minute
-- HTTP version (jobid 19) which is sufficient for transactional email SLAs.
DO $$ BEGIN
  PERFORM cron.unschedule('process-email-queue');
EXCEPTION WHEN OTHERS THEN NULL; END $$;

-- Drop the hourly streak-reminder duplicate. The daily 18:00 job covers product needs.
DO $$ BEGIN
  PERFORM cron.unschedule('streak-reminder-hourly');
EXCEPTION WHEN OTHERS THEN NULL; END $$;

-- Drop the hourly HTTP snapshot-ranks job. The SQL-only
-- `snapshot-category-ranks-hourly` (jobid 10) already does the same work
-- without an Edge Function round-trip.
DO $$ BEGIN
  PERFORM cron.unschedule('snapshot-ranks-hourly');
EXCEPTION WHEN OTHERS THEN NULL; END $$;

-- Slow orphaned-media cleanup from hourly to daily (testing-phase load).
DO $$ BEGIN
  PERFORM cron.unschedule('cleanup-orphaned-media-hourly');
EXCEPTION WHEN OTHERS THEN NULL; END $$;
SELECT cron.schedule(
  'cleanup-orphaned-media-daily',
  '17 4 * * *',
  $cron$ SELECT public.cleanup_orphaned_media_global(1440); $cron$
);

-- 2) UNREAD COUNT RPCs — replace .limit(1000) row scans with grouped counts.
CREATE OR REPLACE FUNCTION public.get_my_unread_notification_counts()
RETURNS jsonb
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(jsonb_object_agg(bucket, c), '{}'::jsonb) FROM (
    SELECT
      CASE
        WHEN type = 'comment' AND COALESCE((payload->>'reply')::boolean, false) THEN 'reply'
        WHEN type = 'comment' AND COALESCE((payload->>'mention')::boolean, false) THEN 'mention'
        WHEN type = 'dm' THEN 'dm'
        WHEN type = 'vote' THEN 'vote'
        WHEN type = 'follow' THEN 'follow'
        ELSE 'other'
      END AS bucket,
      COUNT(*) AS c
    FROM public.notifications
    WHERE user_id = auth.uid() AND read = false
    GROUP BY 1
  ) t;
$$;
GRANT EXECUTE ON FUNCTION public.get_my_unread_notification_counts() TO authenticated;

CREATE OR REPLACE FUNCTION public.get_my_unread_dm_counts()
RETURNS jsonb
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(jsonb_object_agg(sender_id::text, c), '{}'::jsonb) FROM (
    SELECT sender_id, COUNT(*) AS c
    FROM public.messages
    WHERE receiver_id = auth.uid() AND read = false
    GROUP BY sender_id
  ) t;
$$;
GRANT EXECUTE ON FUNCTION public.get_my_unread_dm_counts() TO authenticated;
