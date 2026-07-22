-- =========================================================================
-- Wave 1 (Auth / Profiles / Feed reads) — ADDITIVE GRANTS ONLY
-- Aligns table-level GRANTs with the row-level policies that were already
-- declared. No REVOKE, no policy change, no schema mutation on base tables.
-- =========================================================================

-- ---- profiles_public view (safe subset for anon browsing) ----
CREATE OR REPLACE VIEW public.profiles_public
WITH (security_invoker = on) AS
SELECT
  id,
  username,
  first_name,
  last_name,
  profile_photo_url,
  banner_url,
  banner_position_y,
  avatar_position_y,
  bio,
  pronouns,
  city,
  state,
  country,
  links,
  followers_count,
  following_count,
  votes_received,
  votes_given,
  crowns_held,
  crowns_total,
  battle_wins,
  crown_score,
  verified,
  verification_plan,
  is_founder,
  founder_title,
  royal_frame_variant,
  equipped_frame_key,
  equipped_avatar_frame_id,
  equipped_achievement_crown_id,
  frames_hidden,
  is_private,
  hide_likes,
  hide_comments,
  hide_views,
  liked_posts_public,
  created_at
FROM public.profiles
WHERE COALESCE(is_banned, false) = false
  AND deactivated_at IS NULL
  AND deletion_requested_at IS NULL;

GRANT SELECT ON public.profiles_public TO anon, authenticated;

COMMENT ON VIEW public.profiles_public IS
  'Public, PII-scrubbed projection of profiles for anon and authenticated browsing. Excludes moderation, notification, privacy-settings, wallet, and audit columns.';

-- ---- Additive grants on base tables (do NOT revoke anything) ----

-- profiles: authenticated needs SELECT so the existing
-- "Public, own, and moderated profiles readable by authenticated" policy fires.
GRANT SELECT ON public.profiles TO authenticated;
GRANT ALL    ON public.profiles TO service_role;

-- posts: public and authenticated read policies both already exist.
GRANT SELECT ON public.posts TO anon, authenticated;
GRANT ALL    ON public.posts TO service_role;

-- comments: "Comments viewable by everyone" policy already exists.
GRANT SELECT ON public.comments TO anon, authenticated;
GRANT ALL    ON public.comments TO service_role;

-- battles: "Public active battles readable by anon" policy already exists.
GRANT SELECT ON public.battles TO anon, authenticated;
GRANT ALL    ON public.battles TO service_role;

-- votes: only owners + admins can read; keep anon out but let signed-in users
-- reach the "Users can see their own votes" and "Admins can read all votes" policies.
GRANT SELECT ON public.votes TO authenticated;
GRANT ALL    ON public.votes TO service_role;
