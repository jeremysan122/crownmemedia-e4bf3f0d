CREATE OR REPLACE FUNCTION public.ensure_my_wallet()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  PERFORM private.ensure_my_wallet(auth.uid());
END
$function$;

REVOKE ALL ON FUNCTION public.ensure_my_wallet() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.ensure_my_wallet() TO authenticated;