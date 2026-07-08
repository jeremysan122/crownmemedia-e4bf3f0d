
-- ============================================================
-- 1) Tighten posts UPDATE grants: owner-safe columns ONLY.
--    Admin/moderator writes go through the RPCs below (SECURITY DEFINER).
-- ============================================================
REVOKE UPDATE ON public.posts FROM authenticated;
GRANT UPDATE (
  caption, hashtags, alt_texts,
  filter, photo_filter, video_filter, filter_type,
  location_enabled, location_source, location_label,
  city, state, country, region_name, region_type,
  post_lat, post_lng, post_location_precision, location_captured_at,
  edited_at, is_archived, archived_at, pinned_at, repost_caption
) ON public.posts TO authenticated;

-- ============================================================
-- 2) Tighten comments UPDATE grants: owner-safe columns ONLY.
-- ============================================================
REVOKE UPDATE ON public.comments FROM authenticated;
GRANT UPDATE (body, edited_at) ON public.comments TO authenticated;

-- ============================================================
-- 3) admin_set_post_removed: flip a post's is_removed flag
-- ============================================================
CREATE OR REPLACE FUNCTION public.admin_set_post_removed(
  _post_id uuid,
  _removed boolean
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '42501';
  END IF;
  IF NOT (public.has_role(auth.uid(), 'admin'::app_role)
          OR public.has_role(auth.uid(), 'moderator'::app_role)) THEN
    RAISE EXCEPTION 'Moderator or admin role required' USING ERRCODE = '42501';
  END IF;

  UPDATE public.posts
     SET is_removed  = _removed,
         moderated_by = auth.uid(),
         moderated_at = now()
   WHERE id = _post_id;
END
$$;
REVOKE ALL ON FUNCTION public.admin_set_post_removed(uuid, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_set_post_removed(uuid, boolean) TO authenticated, service_role;

-- ============================================================
-- 4) admin_moderate_comment: flip is_removed on a comment
-- ============================================================
CREATE OR REPLACE FUNCTION public.admin_moderate_comment(
  _comment_id uuid,
  _removed boolean
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '42501';
  END IF;
  IF NOT (public.has_role(auth.uid(), 'admin'::app_role)
          OR public.has_role(auth.uid(), 'moderator'::app_role)) THEN
    RAISE EXCEPTION 'Moderator or admin role required' USING ERRCODE = '42501';
  END IF;

  UPDATE public.comments SET is_removed = _removed WHERE id = _comment_id;
END
$$;
REVOKE ALL ON FUNCTION public.admin_moderate_comment(uuid, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_moderate_comment(uuid, boolean) TO authenticated, service_role;

-- ============================================================
-- 5) admin_update_post / admin_update_posts_bulk: whitelisted patch
-- ============================================================
CREATE OR REPLACE FUNCTION public.admin_update_post(
  _post_id uuid,
  _patch jsonb
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  k text;
  allowed text[] := ARRAY[
    'is_removed','is_sensitive','sensitive_reason','content_rating',
    'moderation_status','moderation_notes',
    'main_category_slug','subcategory_slug',
    'publish_status'
  ];
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '42501';
  END IF;
  IF NOT (public.has_role(auth.uid(), 'admin'::app_role)
          OR public.has_role(auth.uid(), 'moderator'::app_role)) THEN
    RAISE EXCEPTION 'Moderator or admin role required' USING ERRCODE = '42501';
  END IF;
  IF _patch IS NULL OR jsonb_typeof(_patch) <> 'object' THEN
    RAISE EXCEPTION 'Patch must be a JSON object' USING ERRCODE = '22023';
  END IF;

  FOR k IN SELECT jsonb_object_keys(_patch) LOOP
    IF NOT (k = ANY (allowed)) THEN
      RAISE EXCEPTION 'Field % not allowed in admin_update_post', k USING ERRCODE = '42501';
    END IF;
  END LOOP;

  UPDATE public.posts p SET
    is_removed        = COALESCE((_patch->>'is_removed')::boolean, p.is_removed),
    is_sensitive      = COALESCE((_patch->>'is_sensitive')::boolean, p.is_sensitive),
    sensitive_reason  = COALESCE(_patch->>'sensitive_reason', p.sensitive_reason),
    content_rating    = COALESCE((_patch->>'content_rating')::content_rating, p.content_rating),
    moderation_status = COALESCE((_patch->>'moderation_status')::moderation_status, p.moderation_status),
    moderation_notes  = COALESCE(_patch->>'moderation_notes', p.moderation_notes),
    main_category_slug= COALESCE(_patch->>'main_category_slug', p.main_category_slug),
    subcategory_slug  = COALESCE(_patch->>'subcategory_slug', p.subcategory_slug),
    publish_status    = COALESCE(_patch->>'publish_status', p.publish_status),
    moderated_by      = auth.uid(),
    moderated_at      = now()
  WHERE p.id = _post_id;
END
$$;
REVOKE ALL ON FUNCTION public.admin_update_post(uuid, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_update_post(uuid, jsonb) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.admin_update_posts_bulk(
  _post_ids uuid[],
  _patch jsonb
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id uuid;
  v_done integer := 0;
BEGIN
  IF _post_ids IS NULL OR array_length(_post_ids, 1) IS NULL THEN
    RETURN 0;
  END IF;
  FOREACH v_id IN ARRAY _post_ids LOOP
    PERFORM public.admin_update_post(v_id, _patch);
    v_done := v_done + 1;
  END LOOP;
  RETURN v_done;
END
$$;
REVOKE ALL ON FUNCTION public.admin_update_posts_bulk(uuid[], jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_update_posts_bulk(uuid[], jsonb) TO authenticated, service_role;
