-- Re-grant SELECT on all safe profile columns to authenticated.
-- The previous REVOKE SELECT at table level cascaded and removed all
-- column-level SELECT grants, breaking normal reads. This restores them
-- while keeping the four sensitive moderation columns inaccessible.
GRANT SELECT (
  id, username, profile_photo_url, bio, city, state, country,
  followers_count, following_count, votes_received, votes_given,
  crowns_held, crowns_total, battle_wins, is_suspended, created_at,
  updated_at, banner_url, is_banned, banner_position_y, avatar_position_y,
  liked_posts_public, first_name, last_name, gender, is_private,
  hide_likes, hide_comments, hide_views, posts_visibility, deactivated_at,
  links, locale, default_post_visibility, default_category,
  default_comments_enabled, watermark_enabled, autosave_to_camera_roll,
  who_can_tag, who_can_mention, who_can_dm, tag_review_required,
  reduce_motion, larger_text, high_contrast, captions_default_on,
  autoplay_cellular, quiet_hours_start, quiet_hours_end, timezone,
  push_likes, push_follows, push_comments, push_battles,
  default_battle_stake, auto_accept_battles_from_follows,
  default_race_scope, verified, verified_at, verification_plan, pronouns,
  sensitive_content_mode, vote_privacy
) ON public.profiles TO authenticated;

-- Note: banned_reason, banned_by, banned_at, deletion_requested_at are
-- intentionally omitted. Self-reads of deletion/deactivation state go
-- through the get_my_profile SECURITY DEFINER RPC; admin reads of ban
-- metadata go through backend service-role paths.
