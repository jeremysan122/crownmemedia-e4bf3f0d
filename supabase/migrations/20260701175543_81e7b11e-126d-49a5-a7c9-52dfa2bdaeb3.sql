REVOKE EXECUTE ON FUNCTION public.create_battle_challenge(uuid, uuid, integer) FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.accept_battle(uuid, uuid) FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.decline_battle(uuid) FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.is_battle_eligible_post(uuid, uuid) FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.is_challengeable_user(uuid, uuid) FROM anon, PUBLIC;

GRANT EXECUTE ON FUNCTION public.create_battle_challenge(uuid, uuid, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.accept_battle(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.decline_battle(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_battle_eligible_post(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_challengeable_user(uuid, uuid) TO authenticated;