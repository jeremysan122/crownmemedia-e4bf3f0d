
-- Enable cron + pg_net (pg_net not strictly needed since we call SQL directly)
CREATE EXTENSION IF NOT EXISTS pg_cron;

-- ============================================================
-- System-wide orphan cleanup (callable by cron / service_role only).
-- The per-user public.cleanup_orphaned_media() RPC stays as-is for
-- on-demand user cleanup. This variant has no auth.uid() requirement
-- and is locked down to service_role so end users can't run it.
-- ============================================================
CREATE OR REPLACE FUNCTION public.cleanup_orphaned_media_global(
  p_older_than_minutes int DEFAULT 1440  -- 24h default
)
RETURNS int
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, storage
AS $$
DECLARE
  v_deleted int := 0;
  r record;
BEGIN
  FOR r IN
    SELECT o.bucket_id, o.name
      FROM storage.objects o
      WHERE o.bucket_id = 'media'
        AND o.created_at < now() - make_interval(mins => p_older_than_minutes)
        -- Skip anything attached to a post (any publish_status — pending
        -- posts still own their media).
        AND NOT EXISTS (
          SELECT 1 FROM public.posts p
          WHERE p.image_url LIKE '%' || o.name
             OR p.video_url LIKE '%' || o.name
             OR p.video_poster_url LIKE '%' || o.name
             OR EXISTS (SELECT 1 FROM unnest(coalesce(p.image_urls,'{}'::text[])) u WHERE u LIKE '%' || o.name)
        )
        -- Skip anything attached to a draft.
        AND NOT EXISTS (
          SELECT 1 FROM public.post_drafts d
          WHERE COALESCE(d.image_url,'') LIKE '%' || o.name
             OR EXISTS (SELECT 1 FROM unnest(coalesce(d.image_urls,'{}'::text[])) u WHERE u LIKE '%' || o.name)
        )
  LOOP
    DELETE FROM storage.objects WHERE bucket_id = r.bucket_id AND name = r.name;
    v_deleted := v_deleted + 1;
  END LOOP;

  -- Surface cleanup numbers in admin_audit_log for review.
  INSERT INTO public.admin_audit_log (action, target_type, target_id, metadata)
  VALUES ('media_orphan_cleanup', 'storage.objects', NULL,
          jsonb_build_object('deleted', v_deleted, 'older_than_minutes', p_older_than_minutes))
  ON CONFLICT DO NOTHING;

  RETURN v_deleted;
EXCEPTION WHEN OTHERS THEN
  -- Never let the cron job hard-fail — log and continue.
  INSERT INTO public.cron_error_log (job_name, error_message)
  VALUES ('cleanup_orphaned_media_global', SQLERRM)
  ON CONFLICT DO NOTHING;
  RETURN v_deleted;
END $$;

REVOKE ALL ON FUNCTION public.cleanup_orphaned_media_global(int) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.cleanup_orphaned_media_global(int) FROM authenticated, anon;
GRANT EXECUTE ON FUNCTION public.cleanup_orphaned_media_global(int) TO service_role;

-- ============================================================
-- Hourly schedule. Calling the SQL function directly (no HTTP) so this
-- migration carries no project-specific URLs or keys.
-- ============================================================
SELECT cron.unschedule(jobid)
  FROM cron.job
  WHERE jobname = 'cleanup-orphaned-media-hourly';

SELECT cron.schedule(
  'cleanup-orphaned-media-hourly',
  '17 * * * *',
  $cron$ SELECT public.cleanup_orphaned_media_global(1440); $cron$
);
