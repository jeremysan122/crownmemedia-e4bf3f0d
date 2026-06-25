
REVOKE EXECUTE ON FUNCTION public.check_repost_eligibility(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.create_repost(uuid, text, uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.normalize_repost_category_pair(text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.check_repost_eligibility(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.create_repost(uuid, text, uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.normalize_repost_category_pair(text, text) TO authenticated, service_role;
