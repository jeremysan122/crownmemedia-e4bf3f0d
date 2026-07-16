-- P0 upload audit: raise server-side video validation cap to 250 MB.
CREATE OR REPLACE FUNCTION public.validate_post_media_upload()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _mime  text   := lower(coalesce(NEW.mime_type, ''));
  _bytes bigint := coalesce(NEW.bytes, 0);
  _kind  text   := lower(coalesce(NEW.kind, ''));
  _is_image boolean := _mime LIKE 'image/%' OR _kind = 'image';
  _is_video boolean := _mime LIKE 'video/%' OR _kind = 'video';
BEGIN
  IF _is_image THEN
    IF _mime NOT IN ('image/jpeg','image/png','image/webp') THEN
      PERFORM public.log_upload_monitoring_event(
        'upload_validation_failed',
        'post_media rejected mime: ' || _mime,
        auth.uid(),
        jsonb_build_object('table','post_media','mime',_mime,'bytes',_bytes)
      );
      RAISE EXCEPTION 'Unsupported image format. Please upload JPEG, PNG, or WebP.'
        USING ERRCODE = 'check_violation';
    END IF;
    IF _bytes > 0 AND _bytes > 50 * 1024 * 1024 THEN
      PERFORM public.log_upload_monitoring_event(
        'upload_validation_failed', 'post image too large', auth.uid(),
        jsonb_build_object('table','post_media','bytes',_bytes,'mime',_mime)
      );
      RAISE EXCEPTION 'Image is too large. Max size is 50 MB.'
        USING ERRCODE = 'check_violation';
    END IF;
  ELSIF _is_video THEN
    IF _mime NOT IN ('video/mp4','video/quicktime','video/webm') THEN
      PERFORM public.log_upload_monitoring_event(
        'video_upload_failed', 'post_media rejected video mime: ' || _mime, auth.uid(),
        jsonb_build_object('table','post_media','mime',_mime,'bytes',_bytes)
      );
      RAISE EXCEPTION 'Unsupported video format. Please upload MP4, MOV, or WebM.'
        USING ERRCODE = 'check_violation';
    END IF;
    IF _bytes > 0 AND _bytes > 250 * 1024 * 1024 THEN
      PERFORM public.log_upload_monitoring_event(
        'video_upload_failed', 'post video too large', auth.uid(),
        jsonb_build_object('table','post_media','bytes',_bytes,'mime',_mime)
      );
      RAISE EXCEPTION 'Video is too large. Max size is 250 MB.'
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;