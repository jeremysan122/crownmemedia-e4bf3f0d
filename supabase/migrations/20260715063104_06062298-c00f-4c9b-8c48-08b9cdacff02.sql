-- Turn 5: harden anon SECURITY DEFINER surface
-- These functions all perform admin/auth checks internally, but anon has no
-- reason to call them. Revoke anon (and PUBLIC) EXECUTE to shrink attack surface.

REVOKE EXECUTE ON FUNCTION public.admin_claim_reserved_username(text, uuid, text) FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.admin_crown_asset_review() FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.admin_set_crown_quality(uuid, boolean) FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.admin_set_crown_render_config(uuid, jsonb) FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.equip_achievement_crown(uuid) FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.evaluate_user_crowns(uuid) FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.my_achievement_crowns() FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.tg_evaluate_crowns_for_user() FROM anon, PUBLIC;
