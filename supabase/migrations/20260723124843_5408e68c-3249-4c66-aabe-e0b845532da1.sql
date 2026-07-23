REVOKE SELECT ON public.posts FROM anon, authenticated;

GRANT SELECT (
  id, user_id, image_url, image_urls,
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
  publish_status,
  crown_shield_until, royal_boost_until, spotlight_until, vote_boost_until,
  location_enabled, location_source, location_label,
  region_name, region_type,
  post_location_precision
) ON public.posts TO anon;

GRANT SELECT (
  id, user_id, image_url, image_urls,
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
  crown_shield_until, royal_boost_until, spotlight_until, vote_boost_until,
  location_enabled, location_source, location_label,
  region_name, region_type,
  post_location_precision
) ON public.posts TO authenticated;

REVOKE UPDATE ON public.posts FROM anon, authenticated;
GRANT UPDATE (
  caption, hashtags, alt_texts,
  filter, photo_filter, video_filter, filter_type,
  location_enabled, location_source, location_label,
  city, state, country, region_name, region_type,
  post_lat, post_lng, post_location_precision, location_captured_at,
  edited_at, is_archived, archived_at, pinned_at, repost_caption
) ON public.posts TO authenticated;

GRANT INSERT, DELETE ON public.posts TO authenticated;
GRANT ALL ON public.posts TO service_role;

DO $$
BEGIN
  IF has_column_privilege('anon',          'public.posts', 'post_lat',                          'SELECT')
  OR has_column_privilege('anon',          'public.posts', 'post_lng',                          'SELECT')
  OR has_column_privilege('anon',          'public.posts', 'location_captured_at',              'SELECT')
  OR has_column_privilege('anon',          'public.posts', 'ai_searchable_text',                'SELECT')
  OR has_column_privilege('anon',          'public.posts', 'ai_suggested_main_category_slug',   'SELECT')
  OR has_column_privilege('anon',          'public.posts', 'moderation_status',                 'SELECT')
  OR has_column_privilege('anon',          'public.posts', 'submission_key',                    'SELECT')
  OR has_column_privilege('anon',          'public.posts', 'client_request_id',                 'SELECT')
  OR has_column_privilege('anon',          'public.posts', 'moderation_notes',                  'SELECT')
  OR has_column_privilege('authenticated', 'public.posts', 'post_lat',                          'SELECT')
  OR has_column_privilege('authenticated', 'public.posts', 'post_lng',                          'SELECT')
  OR has_column_privilege('authenticated', 'public.posts', 'ai_searchable_text',                'SELECT')
  OR has_column_privilege('authenticated', 'public.posts', 'ai_suggested_main_category_slug',   'SELECT')
  OR has_column_privilege('authenticated', 'public.posts', 'submission_key',                    'SELECT')
  OR has_column_privilege('authenticated', 'public.posts', 'client_request_id',                 'SELECT')
  OR has_column_privilege('authenticated', 'public.posts', 'moderation_notes',                  'SELECT')
  OR has_column_privilege('authenticated', 'public.posts', 'moderated_by',                      'SELECT')
  OR has_column_privilege('authenticated', 'public.posts', 'moderated_at',                      'SELECT')
  OR has_column_privilege('authenticated', 'public.posts', 'sensitive_reason',                  'SELECT')
  THEN
    RAISE EXCEPTION 'posts: sensitive columns still reachable by public roles';
  END IF;
END $$;

REVOKE SELECT ON public.profiles FROM anon, authenticated;

GRANT SELECT (
  id, username, first_name, last_name,
  profile_photo_url, banner_url, banner_position_y, avatar_position_y,
  bio, pronouns, city, state, country, links,
  followers_count, following_count,
  votes_received, votes_given,
  crowns_held, crowns_total, battle_wins, crown_score,
  verified, verified_at, verification_plan,
  is_founder, founder_title,
  royal_frame_variant, equipped_frame_key,
  equipped_avatar_frame_id, equipped_achievement_crown_id,
  frames_hidden,
  is_private, hide_likes, hide_comments, hide_views, liked_posts_public,
  posts_visibility,
  is_banned, deactivated_at, deletion_requested_at,
  created_at
) ON public.profiles TO anon;

GRANT SELECT (
  id, username, first_name, last_name,
  profile_photo_url, banner_url, banner_position_y, avatar_position_y,
  bio, pronouns, gender, city, state, country, links,
  followers_count, following_count,
  votes_received, votes_given,
  crowns_held, crowns_total, battle_wins, crown_score,
  verified, verified_at, verification_plan,
  is_founder, founder_title,
  royal_frame_variant, equipped_frame_key,
  equipped_avatar_frame_id, equipped_achievement_crown_id,
  frames_hidden,
  is_private, hide_likes, hide_comments, hide_views,
  hide_recent_unlocks, liked_posts_public, posts_visibility,
  is_banned, is_suspended, deactivated_at, deletion_requested_at,
  updated_at, created_at
) ON public.profiles TO authenticated;

GRANT SELECT ON public.profiles TO service_role;

DO $$
BEGIN
  IF has_column_privilege('anon', 'public.profiles', 'is_suspended', 'SELECT')
  OR has_column_privilege('anon', 'public.profiles', 'gender',       'SELECT')
  THEN
    RAISE EXCEPTION 'profiles: sensitive columns still reachable by anon';
  END IF;
END $$;

NOTIFY pgrst, 'reload schema';
