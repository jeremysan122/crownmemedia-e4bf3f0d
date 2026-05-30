CREATE OR REPLACE FUNCTION public.send_royal_gift(p_gift_id text, p_recipient_id uuid, p_post_id uuid, p_quantity integer)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  RETURN private.send_royal_gift(auth.uid(), p_gift_id, p_recipient_id, p_post_id, p_quantity);
END $function$;

REVOKE ALL ON FUNCTION public.send_royal_gift(text, uuid, uuid, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.send_royal_gift(text, uuid, uuid, integer) TO authenticated;