-- Restore the column-level anon SELECT allowlist that was collapsed by the
-- prior blanket REVOKE. The safe public views (posts_public, profiles_public)
-- use security_invoker=on and therefore require the caller (anon) to hold
-- SELECT on the underlying columns.

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
  city, state, country, created_at
) ON public.posts TO anon;

GRANT SELECT (
  id, username, first_name, last_name, profile_photo_url, banner_url,
  banner_position_y, avatar_position_y, bio, pronouns, city, state,
  country, links, followers_count, following_count, votes_received,
  votes_given, crowns_held, crowns_total, battle_wins, crown_score,
  verified, verification_plan, is_founder, founder_title,
  royal_frame_variant, equipped_frame_key, equipped_avatar_frame_id,
  equipped_achievement_crown_id, frames_hidden, is_private,
  hide_likes, hide_comments, hide_views, liked_posts_public,
  created_at
) ON public.profiles TO anon;

NOTIFY pgrst, 'reload schema';