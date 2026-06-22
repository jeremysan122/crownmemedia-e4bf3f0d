CREATE OR REPLACE FUNCTION public.cleanup_orphaned_media_global(p_older_than_minutes integer DEFAULT 1440)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'storage'
AS $function$
DECLARE
  v_deleted int := 0;
  r record;
BEGIN
  FOR r IN
    SELECT o.bucket_id, o.name
      FROM storage.objects o
      WHERE o.bucket_id = 'media'
        AND o.created_at < now() - make_interval(mins => p_older_than_minutes)
        AND NOT EXISTS (
          SELECT 1 FROM public.posts p
          WHERE p.image_url LIKE '%' || o.name
             OR p.video_url LIKE '%' || o.name
             OR p.video_poster_url LIKE '%' || o.name
             OR EXISTS (SELECT 1 FROM unnest(coalesce(p.image_urls,'{}'::text[])) u WHERE u LIKE '%' || o.name)
        )
        AND NOT EXISTS (
          SELECT 1 FROM public.post_drafts d
          WHERE COALESCE(d.cover_url,'') LIKE '%' || o.name
             OR EXISTS (SELECT 1 FROM unnest(coalesce(d.image_urls,'{}'::text[])) u WHERE u LIKE '%' || o.name)
        )
  LOOP
    DELETE FROM storage.objects WHERE bucket_id = r.bucket_id AND name = r.name;
    v_deleted := v_deleted + 1;
  END LOOP;

  INSERT INTO public.admin_audit_log (action, target_type, target_id, metadata)
  VALUES ('media_orphan_cleanup', 'storage.objects', NULL,
          jsonb_build_object('deleted', v_deleted, 'older_than_minutes', p_older_than_minutes))
  ON CONFLICT DO NOTHING;

  RETURN v_deleted;
EXCEPTION WHEN OTHERS THEN
  INSERT INTO public.cron_error_log (job_name, error_message)
  VALUES ('cleanup_orphaned_media_global', SQLERRM)
  ON CONFLICT DO NOTHING;
  RETURN v_deleted;
END $function$;

-- Clear stale errors from the resolved bug so the log reflects current health
DELETE FROM public.cron_error_log
WHERE job_name = 'cleanup_orphaned_media_global'
  AND error_message = 'column d.image_url does not exist';