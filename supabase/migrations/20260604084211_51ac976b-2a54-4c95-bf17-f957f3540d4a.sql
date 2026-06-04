DROP FUNCTION IF EXISTS public.send_royal_gift(text, uuid, uuid, integer);
DROP FUNCTION IF EXISTS private.send_royal_gift(uuid, text, uuid, uuid, integer);

REVOKE ALL ON FUNCTION public.send_royal_gift(text, uuid, uuid, integer, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.send_royal_gift(text, uuid, uuid, integer, uuid) TO authenticated, service_role;

REVOKE ALL ON FUNCTION private.send_royal_gift(uuid, text, uuid, uuid, integer, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION private.send_royal_gift(uuid, text, uuid, uuid, integer, uuid) TO postgres, service_role;