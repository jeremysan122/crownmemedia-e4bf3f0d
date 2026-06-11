
-- ============================================================
-- Instant-publish: default new posts to 'approved'
-- ============================================================
CREATE OR REPLACE FUNCTION public.publish_post_idempotent(
  p_client_request_id text,
  p_payload jsonb
)
RETURNS public.posts
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_row public.posts;
  v_initial_status text;
  v_requested_status text;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;
  IF p_client_request_id IS NULL OR length(p_client_request_id) < 8 THEN
    RAISE EXCEPTION 'client_request_id required';
  END IF;

  -- Idempotency: return existing row if this client_request_id was already used
  SELECT * INTO v_row
    FROM public.posts
    WHERE user_id = v_uid AND client_request_id = p_client_request_id
    LIMIT 1;
  IF FOUND THEN
    RETURN v_row;
  END IF;

  -- Default: instant-publish. The moderation pipeline (moderate-media edge
  -- function, reports, admin actions) is the ONLY thing that can later move a
  -- post to pending_review / rejected / sensitive.
  v_requested_status := p_payload->>'publish_status';
  v_initial_status := COALESCE(v_requested_status, 'approved');
  -- High-risk hint from the client: allow opting *into* pending_review (e.g.
  -- when client-side NSFW scoring is uncertain) but never anything stricter.
  IF v_initial_status NOT IN ('approved','pending_review') THEN
    v_initial_status := 'approved';
  END IF;

  INSERT INTO public.posts (
    user_id, client_request_id, publish_status,
    image_url, image_urls, caption, category,
    city, state, country,
    media_type, video_url, video_poster_url, duration_ms,
    filter, photo_filter, video_filter, filter_type,
    alt_texts, media_width, media_height,
    hashtags, tagged_user_ids, main_category_slug, subcategory_slug,
    is_sensitive, sensitive_reason, content_rating, media_origin
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
    p_payload->>'media_origin'
  )
  ON CONFLICT (user_id, client_request_id) WHERE client_request_id IS NOT NULL
  DO UPDATE SET caption = public.posts.caption
  RETURNING * INTO v_row;

  RETURN v_row;
END $$;

-- ============================================================
-- Owner edits no longer auto-demote to pending_review.
-- Audit log still records every change. Moderation pipeline (service_role)
-- can still flip publish_status when a re-check finds an issue.
-- ============================================================
CREATE OR REPLACE FUNCTION public.posts_write_edit_audit()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_changed text[] := '{}';
  v_prev jsonb := '{}'::jsonb;
  v_new  jsonb := '{}'::jsonb;
  v_mod_impact boolean := false;
BEGIN
  IF NEW.caption IS DISTINCT FROM OLD.caption THEN
    v_changed := v_changed || 'caption';
    v_prev := v_prev || jsonb_build_object('caption', OLD.caption);
    v_new  := v_new  || jsonb_build_object('caption', NEW.caption);
    v_mod_impact := true;
  END IF;
  IF NEW.image_url IS DISTINCT FROM OLD.image_url THEN
    v_changed := v_changed || 'image_url';
    v_prev := v_prev || jsonb_build_object('image_url', OLD.image_url);
    v_new  := v_new  || jsonb_build_object('image_url', NEW.image_url);
    v_mod_impact := true;
  END IF;
  IF NEW.image_urls IS DISTINCT FROM OLD.image_urls THEN
    v_changed := v_changed || 'image_urls';
    v_mod_impact := true;
  END IF;
  IF NEW.category IS DISTINCT FROM OLD.category THEN
    v_changed := v_changed || 'category';
    v_prev := v_prev || jsonb_build_object('category', OLD.category);
    v_new  := v_new  || jsonb_build_object('category', NEW.category);
    v_mod_impact := true;
  END IF;
  IF NEW.main_category_slug IS DISTINCT FROM OLD.main_category_slug
     OR NEW.subcategory_slug IS DISTINCT FROM OLD.subcategory_slug THEN
    v_changed := v_changed || 'taxonomy';
    v_mod_impact := true;
  END IF;
  IF NEW.is_sensitive IS DISTINCT FROM OLD.is_sensitive
     OR NEW.content_rating IS DISTINCT FROM OLD.content_rating THEN
    v_changed := v_changed || 'sensitive';
    v_mod_impact := true;
  END IF;
  IF NEW.filter IS DISTINCT FROM OLD.filter THEN
    v_changed := v_changed || 'filter';
  END IF;
  IF NEW.alt_texts IS DISTINCT FROM OLD.alt_texts THEN
    v_changed := v_changed || 'alt_texts';
  END IF;
  IF NEW.city IS DISTINCT FROM OLD.city
     OR NEW.state IS DISTINCT FROM OLD.state
     OR NEW.country IS DISTINCT FROM OLD.country THEN
    v_changed := v_changed || 'location';
  END IF;

  IF array_length(v_changed,1) IS NULL THEN
    RETURN NEW;
  END IF;

  INSERT INTO public.post_edits_audit (
    post_id, editor_user_id, changed_fields, previous_values, new_values,
    source, moderation_impact
  ) VALUES (
    NEW.id,
    COALESCE(auth.uid(), NEW.user_id),
    v_changed, v_prev, v_new,
    'posts_update_trigger',
    v_mod_impact
  );

  -- IMPORTANT: Instant-publish model. Do NOT auto-demote the post back to
  -- pending_review on owner edits. The moderate-media edge function (invoked
  -- by the client after safety-affecting edits) is the only path that can
  -- flip publish_status when it detects an actual issue.
  RETURN NEW;
END $$;
