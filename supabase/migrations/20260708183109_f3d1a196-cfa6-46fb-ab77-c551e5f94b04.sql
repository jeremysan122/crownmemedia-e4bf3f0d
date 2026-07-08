
CREATE OR REPLACE FUNCTION public.publish_post_idempotent(p_client_request_id text, p_payload jsonb)
RETURNS posts
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_row public.posts;
  v_initial_status text;
  v_requested_status text;
  v_content_type text;
  v_loc_source text;
  v_loc_precision text;
  v_loc_enabled boolean;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;
  IF p_client_request_id IS NULL OR length(p_client_request_id) < 8 THEN
    RAISE EXCEPTION 'client_request_id required';
  END IF;

  SELECT * INTO v_row
    FROM public.posts
    WHERE user_id = v_uid AND client_request_id = p_client_request_id
    LIMIT 1;
  IF FOUND THEN
    RETURN v_row;
  END IF;

  v_requested_status := p_payload->>'publish_status';
  v_initial_status := COALESCE(v_requested_status, 'approved');
  IF v_initial_status NOT IN ('approved','pending_review') THEN
    v_initial_status := 'approved';
  END IF;

  v_content_type := lower(COALESCE(p_payload->>'content_type',''));
  IF v_content_type NOT IN ('post','scroll') THEN
    v_content_type := 'post';
  END IF;

  -- Whitelist location metadata. The BEFORE trigger nulls coords when the
  -- source isn't 'current_location', but we sanitise here too so bad inputs
  -- don't confuse readers of the row.
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
    v_uid, p_client_request_id, v_initial_status,
    COALESCE(p_payload->>'image_url',''),
    COALESCE((SELECT array_agg(x) FROM jsonb_array_elements_text(p_payload->'image_urls') x), '{}'::text[]),
    COALESCE(p_payload->>'caption',''),
    COALESCE((p_payload->>'category')::crown_category, 'overall'::crown_category),
    p_payload->>'city', p_payload->>'state', p_payload->>'country',
    COALESCE(p_payload->>'media_type','image'),
    p_payload->>'video_url', p_payload->>'video_poster_url',
    NULLIF(p_payload->>'duration_ms','')::int,
    p_payload->>'filter', p_payload->>'photo_filter', p_payload->>'video_filter', p_payload->>'filter_type',
    COALESCE((SELECT array_agg(x) FROM jsonb_array_elements_text(p_payload->'alt_texts') x), '{}'::text[]),
    NULLIF(p_payload->>'media_width','')::int,
    NULLIF(p_payload->>'media_height','')::int,
    COALESCE((SELECT array_agg(x) FROM jsonb_array_elements_text(p_payload->'hashtags') x), '{}'::text[]),
    COALESCE((SELECT array_agg(x::uuid) FROM jsonb_array_elements_text(p_payload->'tagged_user_ids') x), '{}'::uuid[]),
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

  RETURN v_row;
END $function$;
