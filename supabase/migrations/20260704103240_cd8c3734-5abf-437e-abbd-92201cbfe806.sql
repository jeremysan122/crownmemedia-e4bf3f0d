CREATE OR REPLACE FUNCTION public.create_repost(
  p_parent_post_id uuid,
  p_caption text DEFAULT '',
  p_request_id uuid DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user uuid := auth.uid();
  v_elig jsonb;
  v_code text;
  v_parent posts%ROWTYPE;
  v_main text;
  v_sub text;
  v_repost_id uuid;
  v_existing_attempt uuid;
  v_caption text := COALESCE(LEFT(btrim(p_caption), 500), '');
BEGIN
  v_elig := public.check_repost_eligibility(p_parent_post_id);
  v_code := v_elig->>'code';

  -- Idempotency: if this request_id already produced a repost, return it.
  IF p_request_id IS NOT NULL AND v_user IS NOT NULL THEN
    SELECT repost_id INTO v_existing_attempt
    FROM public.repost_attempts_log
    WHERE actor_user_id = v_user AND request_id = p_request_id AND outcome = 'created'
    LIMIT 1;
    IF v_existing_attempt IS NOT NULL THEN
      RETURN jsonb_build_object('ok', true, 'code', 'idempotent_replay',
        'repost_id', v_existing_attempt);
    END IF;
  END IF;

  IF NOT (v_elig->>'eligible')::boolean THEN
    INSERT INTO public.repost_attempts_log (request_id, actor_user_id, parent_post_id,
      eligibility_code, outcome, failure_code)
    VALUES (p_request_id, v_user, p_parent_post_id, v_code, 'blocked', v_code);
    RETURN jsonb_build_object('ok', false, 'code', v_code,
      'message', v_elig->>'reason',
      'existing_repost_id', v_elig->'existing_repost_id');
  END IF;

  SELECT * INTO v_parent FROM public.posts WHERE id = p_parent_post_id;
  v_main := v_elig->>'main_category_slug';
  v_sub  := v_elig->>'subcategory_slug';

  BEGIN
    INSERT INTO public.posts (
      user_id, parent_post_id, repost_caption,
      image_url, image_urls, media_type, video_url, video_poster_url,
      duration_ms, alt_texts, media_origin, aspect_ratio,
      caption, category, city, state, country,
      media_width, media_height,
      main_category_slug, subcategory_slug,
      photo_filter, video_filter, filter_type, filter,
      hashtags, content_type,
      is_sensitive, sensitive_reason, content_rating
    ) VALUES (
      v_user, p_parent_post_id, v_caption,
      v_parent.image_url, COALESCE(v_parent.image_urls, ARRAY[v_parent.image_url]),
      COALESCE(v_parent.media_type, 'image'),
      v_parent.video_url, v_parent.video_poster_url,
      v_parent.duration_ms, COALESCE(v_parent.alt_texts, '{}'), v_parent.media_origin, v_parent.aspect_ratio,
      '', v_parent.category,
      COALESCE(v_parent.city, ''), COALESCE(v_parent.state, ''), COALESCE(v_parent.country, ''),
      COALESCE(v_parent.media_width, 1080), COALESCE(v_parent.media_height, 1080),
      v_main, v_sub,
      v_parent.photo_filter, v_parent.video_filter, v_parent.filter_type, v_parent.filter,
      COALESCE(v_parent.hashtags, '{}'), v_parent.content_type,
      COALESCE(v_parent.is_sensitive, false), v_parent.sensitive_reason, COALESCE(v_parent.content_rating, 'safe'::content_rating)
    )
    RETURNING id INTO v_repost_id;
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO public.repost_attempts_log (request_id, actor_user_id, parent_post_id,
      parent_owner_id, raw_main_slug, raw_sub_slug, normalized_main_slug, normalized_sub_slug,
      eligibility_code, outcome, failure_code)
    VALUES (p_request_id, v_user, p_parent_post_id, v_parent.user_id,
      v_parent.main_category_slug, v_parent.subcategory_slug, v_main, v_sub,
      v_code, 'error', SQLSTATE);
    RETURN jsonb_build_object('ok', false, 'code', 'insert_failed',
      'message', 'Couldn''t create the repost. Please try again.');
  END;

  INSERT INTO public.repost_attempts_log (request_id, actor_user_id, parent_post_id,
    parent_owner_id, raw_main_slug, raw_sub_slug, normalized_main_slug, normalized_sub_slug,
    eligibility_code, outcome, repost_id)
  VALUES (p_request_id, v_user, p_parent_post_id, v_parent.user_id,
    v_parent.main_category_slug, v_parent.subcategory_slug, v_main, v_sub,
    v_code, 'created', v_repost_id);

  RETURN jsonb_build_object('ok', true, 'code', 'created', 'repost_id', v_repost_id);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.create_repost(uuid, text, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_repost(uuid, text, uuid) TO authenticated, service_role;