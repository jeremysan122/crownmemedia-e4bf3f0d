-- Restrict anon column-level SELECT on public.profiles to the public-display subset.
-- RLS policy "Profiles readable by anon" remains, but anon can now only read safe columns.
REVOKE SELECT ON public.profiles FROM anon;
GRANT SELECT (
  id, username, profile_photo_url, banner_url, banner_position_y, avatar_position_y,
  bio, city, state, country, verified, verified_at, created_at,
  crowns_held, crowns_total, followers_count, following_count, battle_wins,
  votes_received, votes_given, pronouns, links,
  is_private, is_banned, is_suspended, deactivated_at,
  posts_visibility, liked_posts_public, verification_plan
) ON public.profiles TO anon;

-- Hide internal moderation/dedup columns on public.posts from anon visitors.
-- Authenticated users (incl. admin UI) still need access for moderation tooling.
REVOKE SELECT (
  moderation_notes, moderated_by, moderated_at, sensitive_reason,
  submission_key, client_request_id
) ON public.posts FROM anon;