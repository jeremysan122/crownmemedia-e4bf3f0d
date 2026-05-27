REVOKE EXECUTE ON FUNCTION public.dm_typing_topic_allowed(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.dm_typing_topic_allowed(text) TO authenticated, service_role;