BEGIN;

DROP VIEW IF EXISTS public.posts_public CASCADE;

CREATE VIEW public.posts_public
WITH (security_invoker = on, security_barrier = true) AS
SELECT
  p.id, p.user_id, p.parent_post_id, p.caption, p.hashtags, p.alt_texts,
  p.media_type, p.content_type, p.image_url, p.image_urls, p.video_url,
  p.video_poster_url, p.media_width, p.media_height, p.aspect_ratio,
  p.duration_ms, p.media_origin, p.filter, p.filter_type, p.photo_filter,
  p.video_filter, p.category, p.main_category_slug, p.subcategory_slug,
  p.tagged_user_ids, p.content_rating, p.is_sensitive, p.publish_status,
  p.is_archived, p.is_removed, p.archived_at, p.edited_at, p.pinned_at,
  p.scheduled_for, p.vote_count, p.comment_count, p.share_count,
  p.repost_count, p.repost_caption, p.battle_wins, p.crown_score,
  p.crown_shield_until, p.royal_boost_until, p.vote_boost_until,
  p.spotlight_until,
  -- Coarse location only. post_lat, post_lng, and location_captured_at
  -- are intentionally excluded and never reachable through this view.
  p.location_enabled, p.location_label, p.location_source,
  p.post_location_precision, p.region_name, p.region_type,
  p.city, p.state, p.country, p.created_at
FROM public.posts p
WHERE p.is_removed = false
  AND p.is_archived = false
  AND p.publish_status = 'approved'
  AND (p.scheduled_for IS NULL OR p.scheduled_for <= now())
  AND public.can_view_posts_of(p.user_id);

COMMENT ON VIEW public.posts_public IS
  'Safe public projection of posts for anon + authenticated. Excludes exact geo (post_lat, post_lng, location_captured_at), submission_key, client_request_id, moderation_notes/status/moderated_by, and AI metadata. security_invoker=on so caller RLS applies.';

REVOKE ALL ON public.posts_public FROM PUBLIC;
GRANT SELECT ON public.posts_public TO anon, authenticated;

-- Reaffirm base-table lockdown (idempotent).
REVOKE SELECT ON public.posts FROM anon;
REVOKE SELECT (post_lat, post_lng, location_captured_at, submission_key,
               client_request_id, moderation_notes, moderation_status,
               moderated_by)
  ON public.posts FROM anon;

REVOKE SELECT ON public.profiles FROM anon;

REVOKE ALL ON public.crown_map_points FROM anon;

NOTIFY pgrst, 'reload schema';

COMMIT;