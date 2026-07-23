-- Fix CRITICAL posts exposure. See earlier attempt; dropped non-existent
-- `updated_at` column from the allowlist.
REVOKE SELECT ON public.posts FROM authenticated;

GRANT SELECT (
  id, user_id, parent_post_id, caption, hashtags, alt_texts,
  media_type, content_type, image_url, image_urls, video_url,
  video_poster_url, media_width, media_height, aspect_ratio,
  duration_ms, media_origin, filter, filter_type, photo_filter,
  video_filter, category, main_category_slug, subcategory_slug,
  tagged_user_ids, content_rating, is_sensitive, publish_status,
  is_archived, is_removed, archived_at, edited_at, pinned_at,
  scheduled_for, vote_count, comment_count, share_count,
  repost_count, repost_caption, battle_wins, crown_score,
  crown_shield_until, royal_boost_until, vote_boost_until,
  spotlight_until, location_enabled, location_label, location_source,
  post_location_precision, region_name, region_type,
  city, state, country, created_at,
  moderation_status
) ON public.posts TO authenticated;

REVOKE SELECT ON public.posts FROM anon;

GRANT ALL ON public.posts TO service_role;

NOTIFY pgrst, 'reload schema';