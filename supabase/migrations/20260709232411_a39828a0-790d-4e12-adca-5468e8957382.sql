
-- =========================================================================
-- Server-side upload validation (defense-in-depth)
-- =========================================================================

-- Helper: log a monitoring event without breaking the caller.
CREATE OR REPLACE FUNCTION public.log_upload_monitoring_event(
  _event text,
  _message text,
  _user_id uuid,
  _context jsonb DEFAULT '{}'::jsonb
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  BEGIN
    INSERT INTO public.error_logs (user_id, message, source, level, metadata)
    VALUES (
      _user_id,
      left(coalesce(_message, _event), 2000),
      'monitoring',
      'warn',
      jsonb_build_object('event', _event) || coalesce(_context, '{}'::jsonb)
    );
  EXCEPTION WHEN OTHERS THEN
    -- Never let logging break the caller.
    NULL;
  END;
END;
$$;

GRANT EXECUTE ON FUNCTION public.log_upload_monitoring_event(text, text, uuid, jsonb) TO authenticated, service_role;

-- -------------------------------------------------------------------------
-- 1. post_media: images ≤ 50 MB (jpeg/png/webp), videos ≤ 200 MB (mp4/quicktime/webm)
-- -------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.validate_post_media_upload()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _mime text := lower(coalesce(NEW.mime_type, ''));
  _bytes bigint := coalesce(NEW.bytes, 0);
  _kind text := lower(coalesce(NEW.kind, ''));
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
    IF _bytes > 0 AND _bytes > 200 * 1024 * 1024 THEN
      PERFORM public.log_upload_monitoring_event(
        'video_upload_failed', 'post video too large', auth.uid(),
        jsonb_build_object('table','post_media','bytes',_bytes,'mime',_mime)
      );
      RAISE EXCEPTION 'Video is too large. Max size is 200 MB.'
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_validate_post_media_upload ON public.post_media;
CREATE TRIGGER trg_validate_post_media_upload
  BEFORE INSERT OR UPDATE OF mime_type, bytes, kind, storage_path
  ON public.post_media
  FOR EACH ROW EXECUTE FUNCTION public.validate_post_media_upload();

-- -------------------------------------------------------------------------
-- 2. messages (DM attachments): image-only ≤ 25 MB
-- -------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.validate_dm_attachment_upload()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _mime text := lower(coalesce(NEW.attachment_type, ''));
  _size bigint := coalesce(NEW.attachment_size, 0);
BEGIN
  IF NEW.attachment_path IS NULL OR NEW.attachment_path = '' THEN
    RETURN NEW;
  END IF;
  IF _mime NOT IN ('image/jpeg','image/png','image/webp') THEN
    PERFORM public.log_upload_monitoring_event(
      'dm_attachment_upload_failed', 'dm attachment rejected mime: ' || _mime, auth.uid(),
      jsonb_build_object('table','messages','mime',_mime,'size',_size)
    );
    RAISE EXCEPTION 'Only JPEG, PNG, or WebP images can be sent in messages.'
      USING ERRCODE = 'check_violation';
  END IF;
  IF _size > 0 AND _size > 25 * 1024 * 1024 THEN
    PERFORM public.log_upload_monitoring_event(
      'dm_attachment_upload_failed', 'dm attachment too large', auth.uid(),
      jsonb_build_object('table','messages','size',_size,'mime',_mime)
    );
    RAISE EXCEPTION 'Attachment is too large. Max size is 25 MB.'
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_validate_dm_attachment_upload ON public.messages;
CREATE TRIGGER trg_validate_dm_attachment_upload
  BEFORE INSERT OR UPDATE OF attachment_path, attachment_type, attachment_size
  ON public.messages
  FOR EACH ROW EXECUTE FUNCTION public.validate_dm_attachment_upload();

-- -------------------------------------------------------------------------
-- 3. verification_requests: docs ≤ 25 MB, image/pdf only (validated against Storage)
-- -------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.validate_storage_object(
  _bucket text,
  _path text,
  _allowed_mimes text[],
  _max_bytes bigint,
  _event text,
  _friendly_msg text
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, storage
AS $$
DECLARE
  _mime text;
  _size bigint;
BEGIN
  IF _path IS NULL OR _path = '' THEN
    RETURN;
  END IF;

  SELECT
    lower(coalesce(o.metadata->>'mimetype', o.metadata->>'contentType', '')),
    coalesce((o.metadata->>'size')::bigint, 0)
  INTO _mime, _size
  FROM storage.objects o
  WHERE o.bucket_id = _bucket AND o.name = _path
  LIMIT 1;

  -- If object not found yet, allow (upload may race with insert). Client-side already validated.
  IF _mime IS NULL THEN
    RETURN;
  END IF;

  IF _mime <> '' AND NOT (_mime = ANY(_allowed_mimes)) THEN
    PERFORM public.log_upload_monitoring_event(
      _event, 'rejected mime: ' || _mime, auth.uid(),
      jsonb_build_object('bucket',_bucket,'path',_path,'mime',_mime,'size',_size)
    );
    RAISE EXCEPTION '%', _friendly_msg USING ERRCODE = 'check_violation';
  END IF;

  IF _size > 0 AND _size > _max_bytes THEN
    PERFORM public.log_upload_monitoring_event(
      _event, 'file too large', auth.uid(),
      jsonb_build_object('bucket',_bucket,'path',_path,'mime',_mime,'size',_size,'max',_max_bytes)
    );
    RAISE EXCEPTION '%', _friendly_msg USING ERRCODE = 'check_violation';
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION public.validate_storage_object(text, text, text[], bigint, text, text)
  TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.validate_verification_docs()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, storage
AS $$
DECLARE
  _allowed text[] := ARRAY['image/jpeg','image/png','image/webp','application/pdf'];
  _max bigint := 25 * 1024 * 1024;
  _msg text := 'Document must be JPEG, PNG, WebP, or PDF and no larger than 25 MB.';
BEGIN
  PERFORM public.validate_storage_object(
    'verification-docs', NEW.id_document_path, _allowed, _max, 'verification_doc_upload_failed', _msg);
  PERFORM public.validate_storage_object(
    'verification-docs', NEW.business_document_path, _allowed, _max, 'verification_doc_upload_failed', _msg);
  PERFORM public.validate_storage_object(
    'verification-docs', NEW.selfie_path, _allowed, _max, 'verification_doc_upload_failed', _msg);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_validate_verification_docs ON public.verification_requests;
CREATE TRIGGER trg_validate_verification_docs
  BEFORE INSERT OR UPDATE OF id_document_path, business_document_path, selfie_path
  ON public.verification_requests
  FOR EACH ROW EXECUTE FUNCTION public.validate_verification_docs();

-- -------------------------------------------------------------------------
-- 4. profiles: avatar (profile_photo_url) & banner ≤ 5 MB, image-only
--    URLs point into 'avatars' or 'banners' buckets — parse path from URL.
-- -------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.storage_path_from_public_url(_url text, _bucket text)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE
    WHEN _url IS NULL OR _url = '' THEN NULL
    WHEN position('/storage/v1/object/public/' || _bucket || '/' IN _url) > 0
      THEN split_part(_url, '/storage/v1/object/public/' || _bucket || '/', 2)
    ELSE NULL
  END;
$$;

CREATE OR REPLACE FUNCTION public.validate_profile_media_upload()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, storage
AS $$
DECLARE
  _allowed text[] := ARRAY['image/jpeg','image/png','image/webp'];
  _max bigint := 5 * 1024 * 1024;
  _msg text := 'Image must be JPEG, PNG, or WebP and no larger than 5 MB.';
  _p text;
BEGIN
  IF NEW.profile_photo_url IS DISTINCT FROM OLD.profile_photo_url THEN
    _p := public.storage_path_from_public_url(NEW.profile_photo_url, 'avatars');
    IF _p IS NOT NULL THEN
      PERFORM public.validate_storage_object(
        'avatars', _p, _allowed, _max, 'upload_validation_failed', _msg);
    END IF;
  END IF;
  IF NEW.banner_url IS DISTINCT FROM OLD.banner_url THEN
    _p := public.storage_path_from_public_url(NEW.banner_url, 'banners');
    IF _p IS NOT NULL THEN
      PERFORM public.validate_storage_object(
        'banners', _p, _allowed, _max, 'upload_validation_failed', _msg);
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_validate_profile_media_upload ON public.profiles;
CREATE TRIGGER trg_validate_profile_media_upload
  BEFORE UPDATE OF profile_photo_url, banner_url
  ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.validate_profile_media_upload();
