
-- Patch grant_royal_monthly_benefits to create a corresponding boost_token_lots row
DO $$
DECLARE
  fn_body text;
  new_body text;
BEGIN
  SELECT pg_get_functiondef(oid) INTO fn_body FROM pg_proc
   WHERE proname='grant_royal_monthly_benefits' AND pronamespace='public'::regnamespace;
  -- No-op check
  IF fn_body IS NULL THEN RAISE EXCEPTION 'grant_royal_monthly_benefits not found'; END IF;
END $$;

CREATE OR REPLACE FUNCTION public.__grant_royal_create_lot(_user_id uuid, _grant_id uuid, _qty int, _ledger_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  IF _qty <= 0 THEN RETURN; END IF;
  INSERT INTO public.boost_token_lots (user_id, source_type, royal_pass_grant_id,
    source_credit_ledger_id, quantity_granted, status)
  VALUES (_user_id, 'royal_promo', _grant_id, _ledger_id, _qty, 'active');
END; $$;

REVOKE EXECUTE ON FUNCTION public.__grant_royal_create_lot(uuid,uuid,int,uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.__grant_royal_create_lot(uuid,uuid,int,uuid) TO service_role;

-- Redefine the grant function to also create the lot row.
-- We fetch original body and inject the lot-creation call.
DO $mig$
DECLARE
  src text;
  patched text;
BEGIN
  SELECT pg_get_functiondef(oid) INTO src FROM pg_proc
   WHERE proname='grant_royal_monthly_benefits' AND pronamespace='public'::regnamespace;

  -- Replace the boost tokens ledger insert with a version that captures ledger_id and creates a lot
  patched := replace(
    src,
    E'INSERT INTO public.boost_tokens_ledger (user_id, delta, reason, metadata)\n  VALUES (_user_id, 3, ''royal_monthly'',\n          jsonb_build_object(''invoice_id'', _stripe_invoice_id, ''event_id'', _stripe_event_id, ''grant_id'', new_grant_id));',
    E'WITH ins AS (\n    INSERT INTO public.boost_tokens_ledger (user_id, delta, reason, metadata)\n    VALUES (_user_id, 3, ''royal_monthly'',\n            jsonb_build_object(''invoice_id'', _stripe_invoice_id, ''event_id'', _stripe_event_id, ''grant_id'', new_grant_id))\n    RETURNING id\n  )\n  SELECT public.__grant_royal_create_lot(_user_id, new_grant_id, 3, id) FROM ins;'
  );

  IF patched = src THEN
    RAISE EXCEPTION 'grant_royal_monthly_benefits patch: ledger insert not found in source';
  END IF;

  EXECUTE patched;
END $mig$;

-- Backfill: create lots for any recent grants that credited the ledger without a matching lot.
INSERT INTO public.boost_token_lots (user_id, source_type, royal_pass_grant_id, source_credit_ledger_id, quantity_granted, status)
SELECT l.user_id, 'royal_promo', (l.metadata->>'grant_id')::uuid, l.id, l.delta, 'active'
  FROM public.boost_tokens_ledger l
 WHERE l.reason = 'royal_monthly'
   AND l.delta > 0
   AND (l.metadata->>'grant_id') IS NOT NULL
   AND NOT EXISTS (
     SELECT 1 FROM public.boost_token_lots x
      WHERE x.source_credit_ledger_id = l.id
   )
   AND EXISTS (
     SELECT 1 FROM public.royal_pass_grants g
      WHERE g.id = (l.metadata->>'grant_id')::uuid
   );
