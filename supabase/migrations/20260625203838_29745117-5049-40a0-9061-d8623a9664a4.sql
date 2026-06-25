
-- ============================================================
-- Repost hardening: server-authoritative RPC + eligibility +
-- legacy category normalization + idempotent insert + audit log
-- ============================================================

-- 1) Audit log table for repost attempts (safe metadata only)
CREATE TABLE IF NOT EXISTS public.repost_attempts_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id uuid,
  actor_user_id uuid,
  parent_post_id uuid,
  parent_owner_id uuid,
  raw_main_slug text,
  raw_sub_slug text,
  normalized_main_slug text,
  normalized_sub_slug text,
  eligibility_code text,
  outcome text NOT NULL,            -- 'created' | 'blocked' | 'error'
  failure_code text,
  repost_id uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.repost_attempts_log TO authenticated;
GRANT ALL ON public.repost_attempts_log TO service_role;

ALTER TABLE public.repost_attempts_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own repost attempts"
  ON public.repost_attempts_log FOR SELECT TO authenticated
  USING (actor_user_id = auth.uid());

CREATE POLICY "Admins can view all repost attempts"
  ON public.repost_attempts_log FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE INDEX IF NOT EXISTS idx_repost_attempts_actor ON public.repost_attempts_log (actor_user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_repost_attempts_parent ON public.repost_attempts_log (parent_post_id, created_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS uniq_repost_attempts_request
  ON public.repost_attempts_log (actor_user_id, request_id)
  WHERE request_id IS NOT NULL AND outcome = 'created';

-- 2) Pure normalization helper for legacy category pairs
CREATE OR REPLACE FUNCTION public.normalize_repost_category_pair(
  p_main text,
  p_sub  text
) RETURNS TABLE(main_slug text, sub_slug text)
LANGUAGE plpgsql
STABLE
SET search_path = public
AS $$
DECLARE
  v_main text := p_main;
  v_sub  text := p_sub;
BEGIN
  -- Known legacy mappings
  IF v_main = 'royal-crowns' AND (v_sub IS NULL OR v_sub IN ('overall','overall-crowns','royal-overall')) THEN
    v_sub := 'overall-crown';
  END IF;

  -- If pair already valid, return as-is
  IF v_main IS NOT NULL AND v_sub IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.subcategories s
    JOIN public.main_categories m ON m.id = s.main_category_id
    WHERE m.slug = v_main AND s.slug = v_sub
      AND s.is_active = true AND m.is_active = true
  ) THEN
    RETURN QUERY SELECT v_main, v_sub;
    RETURN;
  END IF;

  -- Try to recover when only the main is valid: pick any active sub under it
  IF v_main IS NOT NULL THEN
    SELECT m.slug, s.slug INTO v_main, v_sub
    FROM public.main_categories m
    JOIN public.subcategories s ON s.main_category_id = m.id
    WHERE m.slug = p_main AND m.is_active = true AND s.is_active = true
    ORDER BY (s.slug = p_sub) DESC, s.slug ASC
    LIMIT 1;

    IF v_main IS NOT NULL AND v_sub IS NOT NULL THEN
      RETURN QUERY SELECT v_main, v_sub;
      RETURN;
    END IF;
  END IF;

  -- Couldn't normalize
  RETURN QUERY SELECT NULL::text, NULL::text;
END;
$$;

GRANT EXECUTE ON FUNCTION public.normalize_repost_category_pair(text, text) TO authenticated, service_role;

-- 3) Eligibility check
CREATE OR REPLACE FUNCTION public.check_repost_eligibility(
  p_parent_post_id uuid
) RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user uuid := auth.uid();
  v_post posts%ROWTYPE;
  v_norm RECORD;
  v_existing uuid;
BEGIN
  IF v_user IS NULL THEN
    RETURN jsonb_build_object('eligible', false, 'code', 'not_authenticated',
      'reason', 'Sign in to repost.');
  END IF;

  SELECT * INTO v_post FROM public.posts WHERE id = p_parent_post_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('eligible', false, 'code', 'not_found',
      'reason', 'This post is no longer available.');
  END IF;

  IF v_post.user_id = v_user THEN
    RETURN jsonb_build_object('eligible', false, 'code', 'own_post',
      'reason', "You can\u2019t repost your own post.");
  END IF;

  IF v_post.is_removed OR v_post.is_archived
     OR v_post.moderation_status IN ('removed','flagged','pending')
     OR v_post.publish_status <> 'approved' THEN
    RETURN jsonb_build_object('eligible', false, 'code', 'post_unavailable',
      'reason', "This post can\u2019t be reposted.");
  END IF;

  IF v_post.parent_post_id IS NOT NULL THEN
    RETURN jsonb_build_object('eligible', false, 'code', 'is_repost',
      'reason', 'Reposts of reposts are not allowed.');
  END IF;

  -- Block relationship in either direction
  IF EXISTS (
    SELECT 1 FROM public.blocks
    WHERE (blocker_id = v_user AND blocked_id = v_post.user_id)
       OR (blocker_id = v_post.user_id AND blocked_id = v_user)
  ) THEN
    RETURN jsonb_build_object('eligible', false, 'code', 'blocked',
      'reason', 'This user is unavailable.');
  END IF;

  -- Category normalization
  SELECT * INTO v_norm
  FROM public.normalize_repost_category_pair(v_post.main_category_slug, v_post.subcategory_slug);

  IF v_norm.main_slug IS NULL OR v_norm.sub_slug IS NULL THEN
    RETURN jsonb_build_object('eligible', false, 'code', 'category_invalid',
      'reason', 'Category is no longer supported.');
  END IF;

  -- Duplicate repost guard
  SELECT id INTO v_existing FROM public.posts
   WHERE user_id = v_user AND parent_post_id = p_parent_post_id
   LIMIT 1;
  IF v_existing IS NOT NULL THEN
    RETURN jsonb_build_object('eligible', false, 'code', 'already_reposted',
      'reason', 'You already reposted this.',
      'existing_repost_id', v_existing);
  END IF;

  RETURN jsonb_build_object('eligible', true, 'code', 'ok',
    'main_category_slug', v_norm.main_slug,
    'subcategory_slug', v_norm.sub_slug);
END;
$$;

GRANT EXECUTE ON FUNCTION public.check_repost_eligibility(uuid) TO authenticated;

-- 4) Server-authoritative repost creation
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

  -- Idempotency: if this request_id already produced a repost, return it
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
      caption, category, city, state, country,
      media_width, media_height,
      main_category_slug, subcategory_slug,
      photo_filter, video_filter, filter_type, filter,
      hashtags, content_type
    ) VALUES (
      v_user, p_parent_post_id, v_caption,
      v_parent.image_url, COALESCE(v_parent.image_urls, ARRAY[v_parent.image_url]),
      COALESCE(v_parent.media_type, 'image'),
      v_parent.video_url, v_parent.video_poster_url,
      '', v_parent.category,
      COALESCE(v_parent.city, ''), COALESCE(v_parent.state, ''), COALESCE(v_parent.country, ''),
      COALESCE(v_parent.media_width, 1080), COALESCE(v_parent.media_height, 1080),
      v_main, v_sub,
      v_parent.photo_filter, v_parent.video_filter, v_parent.filter_type, v_parent.filter,
      v_parent.hashtags, v_parent.content_type
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
      'message', 'Couldn''t create repost. Please try again.');
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

GRANT EXECUTE ON FUNCTION public.create_repost(uuid, text, uuid) TO authenticated;
