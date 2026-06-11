
REVOKE EXECUTE ON FUNCTION public.grant_pass_invite_bonus(uuid) FROM authenticated, anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.evaluate_creator_milestones(uuid) FROM authenticated, anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.recalc_post_score(uuid) FROM authenticated, anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.refresh_crowns_for_post(uuid) FROM authenticated, anon, PUBLIC;

GRANT EXECUTE ON FUNCTION public.grant_pass_invite_bonus(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.evaluate_creator_milestones(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.recalc_post_score(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.refresh_crowns_for_post(uuid) TO service_role;
