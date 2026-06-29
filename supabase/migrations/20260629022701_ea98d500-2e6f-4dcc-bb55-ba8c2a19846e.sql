CREATE OR REPLACE FUNCTION public.is_royal_pass_active(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'private'
AS $function$
  SELECT private.is_royal_pass_active(_user_id);
$function$;

REVOKE ALL ON FUNCTION public.is_royal_pass_active(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_royal_pass_active(uuid) TO anon, authenticated, service_role;