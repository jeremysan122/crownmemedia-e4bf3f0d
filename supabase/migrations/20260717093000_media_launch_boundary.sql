-- Enforce media limits at Storage and the publish RPC trust boundaries.

-- The publish function below creates a queue job in the same transaction as
-- the post, so establish the queue table before compiling/reloading the RPC.
CREATE TABLE IF NOT EXISTS public.post_media_analysis_jobs (
  post_id uuid PRIMARY KEY REFERENCES public.posts(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','processing','complete','failed')),
  attempts integer NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  next_attempt_at timestamptz NOT NULL DEFAULT now(),
  started_at timestamptz,
  completed_at timestamptz,
  last_error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.post_media_analysis_jobs ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.post_media_analysis_jobs FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.post_media_analysis_jobs TO service_role;

UPDATE storage.buckets
   SET file_size_limit = 262144000,
       allowed_mime_types = ARRAY[
         'image/jpeg','image/png','image/webp',
         'video/mp4','video/quicktime','video/webm'
       ]::text[]
 WHERE id = 'media';

-- Tighten the shared public-bucket extension policy specifically for media.
DROP POLICY IF EXISTS "Media strict extension allowlist insert" ON storage.objects;
CREATE POLICY "Media strict extension allowlist insert"
ON storage.objects AS RESTRICTIVE FOR INSERT TO authenticated
WITH CHECK (
  bucket_id <> 'media'
  OR (
    (storage.foldername(name))[1] = auth.uid()::text
    AND lower(storage.extension(name)) IN ('jpg','jpeg','png','webp','mp4','webm','mov')
  )
);

DROP POLICY IF EXISTS "Media strict extension allowlist update" ON storage.objects;
CREATE POLICY "Media strict extension allowlist update"
ON storage.objects AS RESTRICTIVE FOR UPDATE TO authenticated
USING (bucket_id <> 'media' OR (storage.foldername(name))[1] = auth.uid()::text)
WITH CHECK (
  bucket_id <> 'media'
  OR (
    (storage.foldername(name))[1] = auth.uid()::text
    AND lower(storage.extension(name)) IN ('jpg','jpeg','png','webp','mp4','webm','mov')
  )
);

CREATE OR REPLACE FUNCTION public.publish_post_idempotent(p_client_request_id text, p_payload jsonb)
RETURNS posts
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_row public.posts;
  v_content_type text;
  v_media_type text;
  v_loc_source text;
  v_loc_precision text;
  v_loc_enabled boolean;
  v_image_url text;
  v_image_urls text[];
  v_video_url text;
  v_poster_url text;
  v_duration integer;
  v_width integer;
  v_height integer;
  v_media_prefix text := 'https://bailrqskqpmzvsgivhvm.supabase.co/storage/v1/object/public/media/';
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF p_client_request_id IS NULL OR length(p_client_request_id) < 8 THEN
    RAISE EXCEPTION 'client_request_id required';
  END IF;

  SELECT * INTO v_row
    FROM public.posts
   WHERE user_id = v_uid AND client_request_id = p_client_request_id
   LIMIT 1;
  IF FOUND THEN
    IF v_row.publish_status <> 'approved' THEN
      INSERT INTO public.post_media_analysis_jobs(post_id, user_id)
      VALUES (v_row.id, v_uid)
      ON CONFLICT (post_id) DO NOTHING;
    END IF;
    RETURN v_row;
  END IF;

  v_media_type := lower(COALESCE(p_payload->>'media_type', 'image'));
  IF v_media_type NOT IN ('image','video') THEN RAISE EXCEPTION 'invalid media_type'; END IF;

  v_image_url := NULLIF(p_payload->>'image_url', '');
  v_image_urls := COALESCE(
    (SELECT array_agg(x) FROM jsonb_array_elements_text(COALESCE(p_payload->'image_urls', '[]'::jsonb)) x),
    '{}'::text[]
  );
  v_video_url := NULLIF(p_payload->>'video_url', '');
  v_poster_url := NULLIF(p_payload->>'video_poster_url', '');
  v_duration := NULLIF(p_payload->>'duration_ms','')::int;
  v_width := NULLIF(p_payload->>'media_width','')::int;
  v_height := NULLIF(p_payload->>'media_height','')::int;

  IF cardinality(v_image_urls) < 1 OR cardinality(v_image_urls) > 10 THEN
    RAISE EXCEPTION 'between 1 and 10 image URLs are required';
  END IF;
  IF EXISTS (
    SELECT 1 FROM unnest(v_image_urls) u
     WHERE u NOT LIKE v_media_prefix || v_uid::text || '/%'
        OR lower(split_part(u, '?', 1)) !~ '\.(jpg|jpeg|png|webp)$'
  ) THEN
    RAISE EXCEPTION 'image URLs must be owned CrownMe media images';
  END IF;

  IF v_media_type = 'video' THEN
    IF v_video_url IS NULL OR v_poster_url IS NULL OR v_image_url IS DISTINCT FROM v_poster_url THEN
      RAISE EXCEPTION 'video URL and matching poster image are required';
    END IF;
    IF v_video_url NOT LIKE v_media_prefix || v_uid::text || '/%'
       OR lower(split_part(v_video_url, '?', 1)) !~ '\.(mp4|webm|mov)$' THEN
      RAISE EXCEPTION 'video URL must be an owned CrownMe media video';
    END IF;
    IF v_poster_url NOT LIKE v_media_prefix || v_uid::text || '/%'
       OR lower(split_part(v_poster_url, '?', 1)) !~ '\.(jpg|jpeg|png|webp)$' THEN
      RAISE EXCEPTION 'video poster must be an owned CrownMe media image';
    END IF;
    IF v_duration IS NULL OR v_duration <= 0 OR v_duration > 30000 THEN
      RAISE EXCEPTION 'video duration must be between 1ms and 30000ms';
    END IF;
  ELSE
    IF v_video_url IS NOT NULL OR v_poster_url IS NOT NULL THEN
      RAISE EXCEPTION 'image posts cannot contain video fields';
    END IF;
    IF v_image_url IS DISTINCT FROM v_image_urls[1] THEN
      RAISE EXCEPTION 'image_url must match the first image';
    END IF;
  END IF;

  IF v_width IS NULL OR v_height IS NULL OR v_width < 1 OR v_height < 1
     OR v_width > 6000 OR v_height > 6000 THEN
    RAISE EXCEPTION 'invalid media dimensions';
  END IF;

  v_content_type := lower(COALESCE(p_payload->>'content_type',''));
  IF v_content_type NOT IN ('post','scroll') THEN v_content_type := 'post'; END IF;
  IF v_content_type = 'scroll' AND v_media_type <> 'video' THEN
    RAISE EXCEPTION 'scrolls require video';
  END IF;

  v_loc_source := lower(NULLIF(p_payload->>'location_source',''));
  IF v_loc_source IS NULL OR v_loc_source NOT IN ('current_location','manual','none') THEN
    v_loc_source := 'none';
  END IF;
  v_loc_enabled := COALESCE((p_payload->>'location_enabled')::boolean, false)
                   AND v_loc_source <> 'none';
  v_loc_precision := lower(NULLIF(p_payload->>'post_location_precision',''));
  IF v_loc_precision IS NULL OR v_loc_precision NOT IN ('exact','city','state','country','none') THEN
    v_loc_precision := 'none';
  END IF;

  INSERT INTO public.posts (
    user_id, client_request_id, publish_status,
    image_url, image_urls, caption, category,
    city, state, country,
    media_type, video_url, video_poster_url, duration_ms,
    filter, photo_filter, video_filter, filter_type,
    alt_texts, media_width, media_height,
    hashtags, tagged_user_ids, main_category_slug, subcategory_slug,
    is_sensitive, sensitive_reason, content_rating, media_origin,
    content_type,
    location_enabled, location_source, location_label,
    region_name, region_type,
    post_lat, post_lng, post_location_precision, location_captured_at
  )
  VALUES (
    v_uid, p_client_request_id, 'processing',
    v_image_url, v_image_urls,
    COALESCE(p_payload->>'caption',''),
    COALESCE((p_payload->>'category')::crown_category, 'overall'::crown_category),
    p_payload->>'city', p_payload->>'state', p_payload->>'country',
    v_media_type, v_video_url, v_poster_url, v_duration,
    p_payload->>'filter', p_payload->>'photo_filter', p_payload->>'video_filter', p_payload->>'filter_type',
    COALESCE((SELECT array_agg(x) FROM jsonb_array_elements_text(COALESCE(p_payload->'alt_texts', '[]'::jsonb)) x), '{}'::text[]),
    v_width, v_height,
    COALESCE((SELECT array_agg(x) FROM jsonb_array_elements_text(COALESCE(p_payload->'hashtags', '[]'::jsonb)) x), '{}'::text[]),
    COALESCE((SELECT array_agg(x::uuid) FROM jsonb_array_elements_text(COALESCE(p_payload->'tagged_user_ids', '[]'::jsonb)) x), '{}'::uuid[]),
    p_payload->>'main_category_slug', p_payload->>'subcategory_slug',
    COALESCE((p_payload->>'is_sensitive')::boolean, false),
    p_payload->>'sensitive_reason',
    COALESCE((p_payload->>'content_rating')::content_rating, 'safe'::content_rating),
    p_payload->>'media_origin',
    v_content_type,
    v_loc_enabled,
    v_loc_source,
    NULLIF(p_payload->>'location_label',''),
    NULLIF(p_payload->>'region_name',''),
    NULLIF(p_payload->>'region_type',''),
    NULLIF(p_payload->>'post_lat','')::double precision,
    NULLIF(p_payload->>'post_lng','')::double precision,
    v_loc_precision,
    NULLIF(p_payload->>'location_captured_at','')::timestamptz
  )
  ON CONFLICT (user_id, client_request_id) WHERE client_request_id IS NOT NULL
  DO UPDATE SET caption = public.posts.caption
  RETURNING * INTO v_row;

  INSERT INTO public.post_media_analysis_jobs(post_id, user_id)
  VALUES (v_row.id, v_uid)
  ON CONFLICT (post_id) DO NOTHING;

  RETURN v_row;
END;
$function$;

REVOKE ALL ON FUNCTION public.publish_post_idempotent(text, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.publish_post_idempotent(text, jsonb) TO authenticated;

NOTIFY pgrst, 'reload schema';
