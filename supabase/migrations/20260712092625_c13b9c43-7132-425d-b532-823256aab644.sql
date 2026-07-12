
-- 1. Drop the regressed 4-arg reinstatement overload; keep canonical 5-arg.
DROP FUNCTION IF EXISTS public.handle_royal_dispute_reinstated(text, text, text, text);

-- 2. Exception-safe shield recalculation (always reset controlled GUC).
CREATE OR REPLACE FUNCTION public.recalculate_post_crown_shield_until(_post_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  new_until timestamptz;
BEGIN
  IF _post_id IS NULL THEN RETURN; END IF;

  SELECT MAX(expires_at)
    INTO new_until
    FROM public.boosts
   WHERE post_id = _post_id
     AND boost_type = 'crown_shield'
     AND active = true
     AND (expires_at IS NULL OR expires_at > now());

  PERFORM set_config('lovable.boost_sync', '1', true);
  BEGIN
    UPDATE public.posts
       SET crown_shield_until = new_until
     WHERE id = _post_id
       AND crown_shield_until IS DISTINCT FROM new_until;
    PERFORM set_config('lovable.boost_sync', '0', true);
  EXCEPTION WHEN OTHERS THEN
    PERFORM set_config('lovable.boost_sync', '0', true);
    RAISE;
  END;
END;
$function$;

REVOKE ALL ON FUNCTION public.recalculate_post_crown_shield_until(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.recalculate_post_crown_shield_until(uuid) TO service_role;

-- 3. Lock down internal financial helpers to service_role only.
REVOKE ALL ON FUNCTION public.spendable_shekels(uuid)            FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.spendable_boost_tokens(uuid)       FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.suspended_royal_shekels(uuid)      FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.suspended_royal_boost_tokens(uuid) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.spendable_shekels(uuid)            TO service_role;
GRANT EXECUTE ON FUNCTION public.spendable_boost_tokens(uuid)       TO service_role;
GRANT EXECUTE ON FUNCTION public.suspended_royal_shekels(uuid)      TO service_role;
GRANT EXECUTE ON FUNCTION public.suspended_royal_boost_tokens(uuid) TO service_role;

-- 4. Owner-safe wrappers for UI reads.
CREATE OR REPLACE FUNCTION public.my_spendable_shekels()
RETURNS integer
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE _uid uuid := auth.uid(); v integer;
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;
  SELECT public.spendable_shekels(_uid) INTO v;
  RETURN COALESCE(v, 0);
END;
$function$;

CREATE OR REPLACE FUNCTION public.my_spendable_boost_tokens()
RETURNS integer
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE _uid uuid := auth.uid(); v integer;
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;
  SELECT public.spendable_boost_tokens(_uid) INTO v;
  RETURN COALESCE(v, 0);
END;
$function$;

REVOKE ALL ON FUNCTION public.my_spendable_shekels()      FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.my_spendable_boost_tokens() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.my_spendable_shekels()      TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.my_spendable_boost_tokens() TO authenticated, service_role;

-- 5. Belt-and-suspenders: ensure raw gift_spend_allocations is not authenticated-readable.
REVOKE ALL ON TABLE public.gift_spend_allocations FROM anon, authenticated;
GRANT ALL ON TABLE public.gift_spend_allocations TO service_role;
