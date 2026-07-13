
CREATE OR REPLACE FUNCTION public.debit_boost_token(
  _user_id uuid,
  _reason_code text,
  _operation_id uuid,
  _ref_table text DEFAULT NULL::text,
  _ref_id uuid DEFAULT NULL::uuid,
  _metadata jsonb DEFAULT '{}'::jsonb,
  _caller text DEFAULT NULL::text,
  _request_fingerprint text DEFAULT NULL::text
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  _existing    public.debit_operations%ROWTYPE;
  _dup_fp      public.debit_operations%ROWTYPE;
  _remaining   int;
  _ledger_id   uuid;
  _lot         record;
  _source_type text;
  _alloc_src   text;
  _grant_id    uuid;
  _result      jsonb;
BEGIN
  IF _operation_id IS NULL THEN
    RAISE EXCEPTION 'debit_boost_token: operation_id is required' USING ERRCODE = '22023';
  END IF;
  IF _reason_code IS NULL OR length(trim(_reason_code)) = 0 THEN
    RAISE EXCEPTION 'debit_boost_token: reason_code is required' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO _existing FROM public.debit_operations
    WHERE operation_id = _operation_id FOR UPDATE;
  IF FOUND THEN
    IF _existing.user_id <> _user_id OR _existing.kind <> 'boost_token' THEN
      RAISE EXCEPTION 'debit_boost_token: operation_id reused with different parameters' USING ERRCODE = '22023';
    END IF;
    RETURN _existing.result;
  END IF;

  IF _request_fingerprint IS NOT NULL THEN
    SELECT * INTO _dup_fp FROM public.debit_operations
     WHERE user_id = _user_id AND kind = 'boost_token'
       AND request_fingerprint = _request_fingerprint
     ORDER BY created_at DESC LIMIT 1;
    IF FOUND THEN RETURN _dup_fp.result; END IF;
  END IF;

  IF public.royal_debits_paused() THEN
    INSERT INTO public.debit_operations(operation_id, user_id, kind, amount, reason_code, ref_table, ref_id,
      request_fingerprint, status, error_category, error_message, failed_at, caller)
    VALUES (_operation_id, _user_id, 'boost_token', 1, _reason_code, _ref_table, _ref_id,
      _request_fingerprint, 'failed', 'KILL_SWITCH', 'royal_pass_debits_paused', now(), _caller);
    RAISE EXCEPTION 'debit_boost_token: royal_pass_debits_paused' USING ERRCODE = 'P0001';
  END IF;

  WITH locked AS (
    SELECT delta FROM public.boost_tokens_ledger WHERE user_id = _user_id FOR UPDATE
  )
  SELECT COALESCE(SUM(delta), 0) INTO _remaining FROM locked;

  IF _remaining <= 0 THEN
    INSERT INTO public.debit_operations(operation_id, user_id, kind, amount, reason_code, ref_table, ref_id,
      request_fingerprint, status, error_category, error_message, failed_at, caller)
    VALUES (_operation_id, _user_id, 'boost_token', 1, _reason_code, _ref_table, _ref_id,
      _request_fingerprint, 'failed', 'NO_TOKENS', 'no tokens remaining', now(), _caller);
    RAISE EXCEPTION 'debit_boost_token: no tokens remaining for user %', _user_id USING ERRCODE = 'P0001';
  END IF;

  SELECT * INTO _lot
    FROM public.boost_token_lots
   WHERE user_id = _user_id AND status = 'active' AND available_quantity > 0
   ORDER BY granted_at ASC
   FOR UPDATE
   LIMIT 1;

  IF NOT FOUND THEN
    INSERT INTO public.debit_operations(operation_id, user_id, kind, amount, reason_code, ref_table, ref_id,
      request_fingerprint, status, error_category, error_message, failed_at, caller)
    VALUES (_operation_id, _user_id, 'boost_token', 1, _reason_code, _ref_table, _ref_id,
      _request_fingerprint, 'failed', 'NO_LOT',
      format('ledger has %s remaining but no active lot with capacity', _remaining), now(), _caller);
    RAISE EXCEPTION 'debit_boost_token: no active lot with capacity (ledger says % remain) — reconciliation required', _remaining
      USING ERRCODE = 'P0001';
  END IF;

  _source_type := _lot.source_type;
  _grant_id    := _lot.royal_pass_grant_id;
  _alloc_src   := CASE WHEN _source_type = 'royal_promo' THEN 'royal' ELSE 'purchased' END;

  UPDATE public.boost_token_lots
     SET quantity_consumed = quantity_consumed + 1,
         status = CASE
           WHEN (quantity_granted - (quantity_consumed + 1) - quantity_reversed) <= 0
                THEN 'depleted' ELSE status END
   WHERE id = _lot.id;

  IF _grant_id IS NOT NULL THEN
    UPDATE public.royal_pass_grants
       SET promo_boost_tokens_remaining = GREATEST(COALESCE(promo_boost_tokens_remaining,0) - 1, 0)
     WHERE id = _grant_id;
  END IF;

  INSERT INTO public.boost_tokens_ledger(user_id, delta, reason, metadata)
  VALUES (_user_id, -1, _reason_code,
    COALESCE(_metadata,'{}'::jsonb) || jsonb_build_object(
      'ref_table', _ref_table, 'ref_id', _ref_id, 'operation_id', _operation_id,
      'source_type', _source_type, 'grant_id', _grant_id, 'caller', _caller))
  RETURNING id INTO _ledger_id;

  INSERT INTO public.boost_token_spend_allocations(
      user_id, lot_id, royal_pass_grant_id, ledger_id, source, operation_id, amount_consumed)
  VALUES (_user_id, _lot.id, _grant_id, _ledger_id, _alloc_src, _operation_id, 1);

  INSERT INTO public.admin_audit_log(actor_id, action, target_kind, target_id, metadata)
  VALUES (_user_id, 'debit_boost_token', 'boost_tokens_ledger', _ledger_id,
    jsonb_build_object('reason_code', _reason_code, 'operation_id', _operation_id,
      'lot_id', _lot.id, 'grant_id', _grant_id, 'source_type', _source_type));

  _result := jsonb_build_object(
    'ok', true, 'ledger_id', _ledger_id, 'lot_id', _lot.id,
    'grant_id', _grant_id, 'source_type', _source_type,
    'remaining', _remaining - 1, 'operation_id', _operation_id
  );

  INSERT INTO public.debit_operations(operation_id, user_id, kind, amount, reason_code, ref_table, ref_id,
    request_fingerprint, ledger_id, result, status, completed_at, caller, asset_type)
  VALUES (_operation_id, _user_id, 'boost_token', 1, _reason_code, _ref_table, _ref_id,
    _request_fingerprint, _ledger_id, _result, 'completed', now(), _caller, 'boost_token');

  RETURN _result;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.debit_boost_token(uuid, text, uuid, text, uuid, jsonb, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.debit_boost_token(uuid, text, uuid, text, uuid, jsonb, text, text) TO service_role;
