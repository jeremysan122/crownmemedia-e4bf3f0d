
-- ============================================================
-- 1. PROFILES: column-level grants instead of full-table grants
-- ============================================================

-- Revoke broad SELECT
REVOKE SELECT ON public.profiles FROM anon;
REVOKE SELECT ON public.profiles FROM authenticated;

-- Public-safe columns granted to anon + authenticated
DO $$
DECLARE
  safe_cols text := 'id, username, profile_photo_url, banner_url, banner_position_y, avatar_position_y, bio, city, state, country, links, followers_count, following_count, crowns_held, crowns_total, battle_wins, votes_received, votes_given, verified, verified_at, verification_plan, is_private, is_banned, is_suspended, posts_visibility, hide_likes, hide_comments, hide_views, liked_posts_public, created_at';
BEGIN
  EXECUTE format('GRANT SELECT (%s) ON public.profiles TO anon', safe_cols);
  EXECUTE format('GRANT SELECT (%s) ON public.profiles TO authenticated', safe_cols);
END $$;

-- Service role keeps full access
GRANT SELECT ON public.profiles TO service_role;

-- Helper for signed-in user to load their full own profile (settings, prefs, auth bootstrap)
CREATE OR REPLACE FUNCTION public.get_my_profile()
RETURNS public.profiles
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT * FROM public.profiles WHERE id = auth.uid();
$$;

REVOKE EXECUTE ON FUNCTION public.get_my_profile() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_my_profile() TO authenticated;

-- ============================================================
-- 2. Revoke EXECUTE from anon on SECURITY DEFINER functions
--    that should never be callable without auth
-- ============================================================

-- Trigger-only functions: revoke from all callable roles
REVOKE EXECUTE ON FUNCTION public.send_push_on_notification() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.tg_assign_creator_referral_code() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.tg_invite_to_creator_referral() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.tg_mark_referral_battle() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.tg_mark_referral_post() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.tg_mark_referral_vote() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.trg_notify_crown_change() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.trg_notify_follow() FROM PUBLIC, anon, authenticated;

-- Trigger-secret verifier: only used by edge function with service_role
REVOKE EXECUTE ON FUNCTION public.verify_web_push_trigger_secret(text) FROM PUBLIC, anon, authenticated;

-- Internal helper, no client should call this directly
REVOKE EXECUTE ON FUNCTION public.evaluate_creator_milestones(uuid) FROM PUBLIC, anon, authenticated;

-- User-action RPCs: must be authenticated only
REVOKE EXECUTE ON FUNCTION public.save_push_subscription(text, text, text, text) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.save_push_subscription(text, text, text, text) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.submit_verification_request(verification_plan_type, text, text, text, text, jsonb, integer, text, text, text, text) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.submit_verification_request(verification_plan_type, text, text, text, text, jsonb, integer, text, text, text, text) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.apply_to_creator_program(text) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.apply_to_creator_program(text) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.get_creator_dashboard(uuid) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.get_creator_dashboard(uuid) TO authenticated;

-- Admin RPCs: authenticated only (the function bodies enforce admin role)
REVOKE EXECUTE ON FUNCTION public.admin_broadcast_notification(text, text, text, integer) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.admin_broadcast_notification(text, text, text, integer) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.admin_decide_verification(uuid, verification_status, text) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.admin_decide_verification(uuid, verification_status, text) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.admin_set_creator_reward(uuid, text) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.admin_set_creator_reward(uuid, text) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.admin_set_creator_status(uuid, text, text) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.admin_set_creator_status(uuid, text, text) TO authenticated;
