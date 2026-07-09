CREATE OR REPLACE FUNCTION public.check_repost_eligibility(p_parent_post_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
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
      'reason', 'You can''t repost your own post.');
  END IF;

  IF v_post.is_removed OR v_post.is_archived
     OR v_post.moderation_status IN ('removed','flagged','pending')
     OR v_post.publish_status <> 'approved' THEN
    RETURN jsonb_build_object('eligible', false, 'code', 'post_unavailable',
      'reason', 'This post can''t be reposted.');
  END IF;

  IF v_post.parent_post_id IS NOT NULL THEN
    RETURN jsonb_build_object('eligible', false, 'code', 'is_repost',
      'reason', 'Reposts of reposts are not allowed.');
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.blocks
    WHERE (blocker_id = v_user AND blocked_id = v_post.user_id)
       OR (blocker_id = v_post.user_id AND blocked_id = v_user)
  ) THEN
    RETURN jsonb_build_object('eligible', false, 'code', 'blocked',
      'reason', 'This user is unavailable.');
  END IF;

  SELECT * INTO v_norm
  FROM public.normalize_repost_category_pair(v_post.main_category_slug, v_post.subcategory_slug);

  IF v_norm.main_slug IS NULL OR v_norm.sub_slug IS NULL THEN
    RETURN jsonb_build_object('eligible', false, 'code', 'category_invalid',
      'reason', 'Category is no longer supported.');
  END IF;

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
$function$;