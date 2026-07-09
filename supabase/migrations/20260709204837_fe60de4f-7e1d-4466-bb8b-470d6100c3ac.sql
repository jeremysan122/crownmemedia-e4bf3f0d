
-- Lock down internal / operational columns on public.posts.
-- Public app (anon, authenticated) must not be able to read moderation
-- notes, ingest-time keys, moderator identity/timestamps, or free-text
-- sensitive reason.

-- 1. Revoke broad SELECT and any lingering column-level SELECT grants
--    for internal columns.
REVOKE SELECT ON public.posts FROM anon, authenticated;

REVOKE SELECT (
  submission_key,
  client_request_id,
  moderation_notes,
  moderated_by,
  moderated_at,
  sensitive_reason,
  ai_searchable_text,
  ai_suggested_main_category_slug
) ON public.posts FROM anon, authenticated;

-- 2. Re-grant SELECT ONLY on the public-safe column allowlist. Anything
--    not in this list is invisible to anon / authenticated regardless of
--    RLS. Admin / moderator paths must use approved SECURITY DEFINER RPCs.
GRANT SELECT (
  id, user_id,
  image_url, image_urls,
  caption, category, main_category_slug, subcategory_slug, hashtags,
  city, state, country,
  crown_score, vote_count, comment_count, share_count, repost_count, battle_wins,
  created_at, edited_at, pinned_at, scheduled_for,
  parent_post_id, repost_caption, tagged_user_ids,
  media_type, video_url, video_poster_url, video_filter, photo_filter,
  filter, filter_type, duration_ms, alt_texts, aspect_ratio,
  media_width, media_height, media_origin,
  is_sensitive, content_type, content_rating,
  is_removed, is_archived, archived_at,
  moderation_status, publish_status,
  crown_shield_until, royal_boost_until, spotlight_until, vote_boost_until
) ON public.posts TO anon, authenticated;

-- service_role keeps full access (edge functions, admin RPCs).
GRANT SELECT ON public.posts TO service_role;

-- 3. Admin/moderator-only RPC exposing internal moderation columns for the
--    Command Center content queue. Replaces the direct table SELECT that
--    previously leaked sensitive_reason to the client.
CREATE OR REPLACE FUNCTION public.admin_list_moderation_posts(
  _kind text,
  _limit int DEFAULT 60
)
RETURNS TABLE (
  id uuid,
  user_id uuid,
  caption text,
  is_sensitive boolean,
  sensitive_reason text,
  content_rating text,
  moderation_status text,
  moderation_notes text,
  moderated_by uuid,
  moderated_at timestamptz,
  created_at timestamptz
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT (
    public.has_role(auth.uid(), 'admin'::app_role)
    OR public.has_role(auth.uid(), 'moderator'::app_role)
  ) THEN
    RAISE EXCEPTION 'not_authorized' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  SELECT p.id, p.user_id, p.caption, p.is_sensitive, p.sensitive_reason,
         p.content_rating::text, p.moderation_status::text, p.moderation_notes,
         p.moderated_by, p.moderated_at, p.created_at
  FROM public.posts p
  WHERE p.is_removed = false
    AND (
      (_kind = 'sensitive'
        AND (p.is_sensitive = true
             OR p.moderation_status::text <> 'approved'
             OR p.content_rating::text <> 'safe'))
      OR
      (_kind = 'review'
        AND (p.moderation_status::text IN ('flagged','pending')
             OR p.content_rating::text = 'explicit'))
    )
  ORDER BY p.created_at DESC
  LIMIT LEAST(GREATEST(_limit, 1), 200);
END;
$$;

REVOKE ALL ON FUNCTION public.admin_list_moderation_posts(text, int) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_list_moderation_posts(text, int) TO authenticated, service_role;
