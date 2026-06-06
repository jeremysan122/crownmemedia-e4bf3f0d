REVOKE ALL ON FUNCTION public.refresh_crowns_for_post(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.refresh_crowns_for_post(uuid) TO postgres, service_role;