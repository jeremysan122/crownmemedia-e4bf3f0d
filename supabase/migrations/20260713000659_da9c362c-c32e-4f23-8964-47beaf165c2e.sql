
-- 1) Fix debit_boost_token: replace illegal SUM+FOR UPDATE with CTE lock
CREATE OR REPLACE FUNCTION public.debit_boost_token(
  _user_id uuid,
  _reason_code text,
  _operation_id uuid,
  _ref_table text DEFAULT NULL::text,
  _ref_id uuid DEFAULT NULL::uuid,
  _metadata jsonb DEFAULT '{}'::jsonb,
  _caller text DEFAULT NULL::text,
  _request_fingerprint text DEFAULT NULL::text
)
RETURNS jsonb
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
  _source      text;
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
      WHERE user_id = _user_id
        AND kind = 'boost_token'
        AND request_fingerprint = _request_fingerprint
      ORDER BY created_at DESC LIMIT 1;
    IF FOUND THEN
      RETURN _dup_fp.result;
    END IF;
  END IF;

  IF public.royal_debits_paused() THEN
    INSERT INTO public.debit_operations(operation_id, user_id, kind, reason_code, ref_table, ref_id,
                                        request_fingerprint, error_code, error_message, metadata)
    VALUES (_operation_id, _user_id, 'boost_token', _reason_code, _ref_table, _ref_id,
            _request_fingerprint, 'KILL_SWITCH', 'royal_pass_debits_paused', COALESCE(_metadata,'{}'::jsonb));
    RAISE EXCEPTION 'debit_boost_token: royal_pass_debits_paused' USING ERRCODE = 'P0001';
  END IF;

  -- FIX: aggregate against a CTE that locks the rows (SUM + FOR UPDATE in one statement is invalid).
  WITH locked AS (
    SELECT delta
      FROM public.boost_tokens_ledger
     WHERE user_id = _user_id
     FOR UPDATE
  )
  SELECT COALESCE(SUM(delta), 0) INTO _remaining FROM locked;

  IF _remaining <= 0 THEN
    INSERT INTO public.debit_operations(operation_id, user_id, kind, reason_code, ref_table, ref_id,
                                        request_fingerprint, error_code, error_message, metadata)
    VALUES (_operation_id, _user_id, 'boost_token', _reason_code, _ref_table, _ref_id,
            _request_fingerprint, 'NO_TOKENS', 'no tokens remaining', COALESCE(_metadata,'{}'::jsonb));
    RAISE EXCEPTION 'debit_boost_token: no tokens remaining for user %', _user_id USING ERRCODE = 'P0001';
  END IF;

  SELECT * INTO _lot
    FROM public.boost_token_lots
   WHERE user_id = _user_id AND remaining > 0
   ORDER BY created_at ASC
   FOR UPDATE
   LIMIT 1;

  IF NOT FOUND THEN
    INSERT INTO public.debit_operations(operation_id, user_id, kind, reason_code, ref_table, ref_id,
                                        request_fingerprint, error_code, error_message, metadata)
    VALUES (_operation_id, _user_id, 'boost_token', _reason_code, _ref_table, _ref_id,
            _request_fingerprint, 'NO_LOT', format('ledger has %s remaining but no active lot with capacity', _remaining),
            COALESCE(_metadata,'{}'::jsonb));
    RAISE EXCEPTION 'debit_boost_token: no active lot with capacity (ledger says % remain) — reconciliation required', _remaining
      USING ERRCODE = 'P0001';
  END IF;

  _source := _lot.source;
  _grant_id := _lot.royal_pass_grant_id;

  UPDATE public.boost_token_lots
     SET remaining = remaining - 1
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
            'source', _source, 'grant_id', _grant_id, 'caller', _caller))
  RETURNING id INTO _ledger_id;

  INSERT INTO public.boost_token_spend_allocations(user_id, lot_id, royal_pass_grant_id, ledger_id, source, metadata)
  VALUES (_user_id, _lot.id, _grant_id, _ledger_id, _source, COALESCE(_metadata,'{}'::jsonb));

  INSERT INTO public.admin_audit_log(actor_id, action, target_kind, target_id, metadata)
  VALUES (_user_id, 'debit_boost_token', 'boost_tokens_ledger', _ledger_id,
          jsonb_build_object('reason_code', _reason_code, 'operation_id', _operation_id,
                             'lot_id', _lot.id, 'grant_id', _grant_id, 'source', _source));

  _result := jsonb_build_object(
    'ok', true,
    'ledger_id', _ledger_id,
    'lot_id', _lot.id,
    'grant_id', _grant_id,
    'source', _source,
    'remaining', _remaining - 1,
    'operation_id', _operation_id
  );

  INSERT INTO public.debit_operations(operation_id, user_id, kind, reason_code, ref_table, ref_id,
                                      request_fingerprint, result, metadata)
  VALUES (_operation_id, _user_id, 'boost_token', _reason_code, _ref_table, _ref_id,
          _request_fingerprint, _result, COALESCE(_metadata,'{}'::jsonb));

  RETURN _result;
END;
$function$;

-- 2) Drop the dead-code double-debit trigger on gift_transactions
DROP TRIGGER IF EXISTS trg_gift_tx_to_shekel_ledger ON public.gift_transactions;

-- 3) Allow service_role to run invariant checks (still gated for anon/authenticated non-admins)
CREATE OR REPLACE FUNCTION public.assert_royal_shield_invariants(_user_id uuid DEFAULT NULL::uuid)
RETURNS TABLE(user_id uuid, allowance_id uuid, net_spent_credits integer, active_shield_sessions integer, drift integer)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF auth.role() <> 'service_role' AND NOT public.has_role(auth.uid(), 'admin'::app_role) THEN
    RAISE EXCEPTION 'not_authorized' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  SELECT
    v.user_id,
    v.allowance_id,
    v.net_spent_credits,
    v.active_shield_sessions,
    (v.active_shield_sessions - v.net_spent_credits) AS drift
  FROM public.royal_shield_accounting v
  WHERE (_user_id IS NULL OR v.user_id = _user_id)
    AND v.active_shield_sessions > v.net_spent_credits;
END;
$function$;

-- 4) Grant EXECUTE on the public purchase_boost wrapper to authenticated users
GRANT EXECUTE ON FUNCTION public.purchase_boost(text, integer, numeric, uuid) TO authenticated;

-- 5) Extend royal_shield_audit_log event_type check to accept audit summary rows
ALTER TABLE public.royal_shield_audit_log
  DROP CONSTRAINT IF EXISTS royal_shield_audit_log_event_type_check;
ALTER TABLE public.royal_shield_audit_log
  ADD CONSTRAINT royal_shield_audit_log_event_type_check
  CHECK (event_type = ANY (ARRAY[
    'credit','debit','reversal','restoration',
    'invariant_ok','invariant_drift','manual_check',
    'runtime_audit_pass','runtime_audit_fail'
  ]));
