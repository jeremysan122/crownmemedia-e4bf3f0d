-- Authorization hardening: profiles column-level allowlists
-- Fixes:
-- 1) profiles_public view returned 401 to anon because anon lacked SELECT on the underlying
--    profiles table. Grant a narrow column allowlist (matches profiles_public projection).
-- 2) Authenticated users could read every column on any active profile (including private
--    preferences: push_*, quiet_hours_*, timezone, locale, watermark_enabled,
--    autoplay_cellular, who_can_*, tag_review_required, sensitive_content_mode,
--    vote_privacy, default_*, auto_accept_battles_from_follows, boost_tokens_balance).
--    Revoke table-wide SELECT and re-grant a column allowlist covering only
--    public-safe + peer-visible moderation fields. Owner reads full row via
--    the existing get_my_profile RPC.

REVOKE SELECT ON public.profiles FROM authenticated;
REVOKE SELECT ON public.profiles FROM anon;

-- anon: matches profiles_public view projection exactly
GRANT SELECT (
  id, username, first_name, last_name, profile_photo_url,
  banner_url, banner_position_y, avatar_position_y, bio, pronouns,
  city, state, country, links,
  followers_count, following_count, votes_received, votes_given,
  crowns_held, crowns_total, battle_wins, crown_score,
  verified, verification_plan, is_founder, founder_title,
  royal_frame_variant, equipped_frame_key, equipped_avatar_frame_id,
  equipped_achievement_crown_id, frames_hidden,
  is_private, hide_likes, hide_comments, hide_views, liked_posts_public,
  created_at
) ON public.profiles TO anon;

-- authenticated: anon set + peer-visible identity/moderation state + verified_at + gender
GRANT SELECT (
  id, username, first_name, last_name, profile_photo_url,
  banner_url, banner_position_y, avatar_position_y, bio, pronouns,
  city, state, country, links, gender,
  followers_count, following_count, votes_received, votes_given,
  crowns_held, crowns_total, battle_wins, crown_score,
  verified, verified_at, verification_plan,
  is_founder, founder_title, founder_granted_at,
  royal_frame_variant, equipped_frame_key, equipped_avatar_frame_id,
  equipped_achievement_crown_id, frames_hidden, hide_recent_unlocks,
  is_private, hide_likes, hide_comments, hide_views, posts_visibility,
  liked_posts_public,
  is_banned, is_suspended, banned_at, banned_reason,
  deactivated_at, deletion_requested_at,
  created_at, updated_at
) ON public.profiles TO authenticated;

-- Preserve service_role blanket access (bypasses RLS anyway).
GRANT ALL ON public.profiles TO service_role;

NOTIFY pgrst, 'reload schema';