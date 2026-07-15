CREATE OR REPLACE FUNCTION public.tg_evaluate_crowns_for_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  _uid uuid;
  _row jsonb;
BEGIN
  _row := to_jsonb(NEW);
  _uid := COALESCE(
    NULLIF(_row->>'user_id','')::uuid,
    NULLIF(_row->>'follower_id','')::uuid,
    NULLIF(_row->>'winner_id','')::uuid,
    NULLIF(current_setting('request.jwt.claim.sub', true), '')::uuid
  );
  IF _uid IS NULL THEN RETURN NEW; END IF;
  BEGIN
    PERFORM public.evaluate_user_crowns(_uid);
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'evaluate_user_crowns failed for %: %', _uid, SQLERRM;
  END;
  RETURN NEW;
END;
$function$;