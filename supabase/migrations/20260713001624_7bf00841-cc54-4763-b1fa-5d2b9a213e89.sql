
DO $mig$
DECLARE
  src text;
  patched text;
BEGIN
  SELECT pg_get_functiondef(oid) INTO src FROM pg_proc
   WHERE proname='grant_royal_monthly_benefits' AND pronamespace='public'::regnamespace;

  patched := replace(
    src,
    E'WITH ins AS (\n    INSERT INTO public.boost_tokens_ledger (user_id, delta, reason, metadata)\n    VALUES (_user_id, 3, ''royal_monthly'',\n            jsonb_build_object(''invoice_id'', _stripe_invoice_id, ''event_id'', _stripe_event_id, ''grant_id'', new_grant_id))\n    RETURNING id\n  )\n  SELECT public.__grant_royal_create_lot(_user_id, new_grant_id, 3, id) FROM ins;',
    E'DECLARE _btl_id uuid; BEGIN\n    INSERT INTO public.boost_tokens_ledger (user_id, delta, reason, metadata)\n    VALUES (_user_id, 3, ''royal_monthly'',\n            jsonb_build_object(''invoice_id'', _stripe_invoice_id, ''event_id'', _stripe_event_id, ''grant_id'', new_grant_id))\n    RETURNING id INTO _btl_id;\n    PERFORM public.__grant_royal_create_lot(_user_id, new_grant_id, 3, _btl_id);\n  END;'
  );

  IF patched = src THEN
    RAISE EXCEPTION 'grant_royal_monthly_benefits patch: prior CTE fragment not found';
  END IF;

  EXECUTE patched;
END $mig$;
