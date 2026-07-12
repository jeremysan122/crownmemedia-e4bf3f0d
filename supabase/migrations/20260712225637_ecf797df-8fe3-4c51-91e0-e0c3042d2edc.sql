-- Stage A v3 M2: primitives are the single source of truth
-- 1) Remove legacy AFTER-INSERT triggers that double-consume promo balances

DROP TRIGGER IF EXISTS shekel_ledger_consume_royal_promo ON public.shekel_ledger;
DROP TRIGGER IF EXISTS boost_tokens_ledger_consume_royal_promo ON public.boost_tokens_ledger;
-- keep the functions for a beat (referenced by other tooling could exist); drop after M3.

-- 2) Add fingerprint uniqueness index (soft dedup within a short window is enforced in-fn)
CREATE INDEX IF NOT EXISTS debit_operations_user_fp_idx
  ON public.debit_operations (user_id, request_fingerprint, created_at DESC)
  WHERE request_fingerprint IS NOT NULL;

-- 3) Rewritten debit_shekels — writes canonical shekel_spend_allocations + audit + fingerprint,
--    integer-only, kill-switch aware, idempotent by operation_id.
CREATE OR REPLACE FUNCTION public.debit_shekels(
  _user_id uuid,
  _amount numeric,
  _reason_code text,
  _operation_id uuid,
  _ref_table text DEFAULT NULL,
  _ref_id uuid DEFAULT NULL,
  _metadata jsonb DEFAULT '{}'::jsonb,
  _caller text DEFAULT NULL,
  _request_fingerprint text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  _existing        public.debit_operations%ROWTYPE;
  _dup_fp          public.debit_operations%ROWTYPE;
  _bal             numeric;
  _spendable       numeric;
  _new_bal         numeric;
  _ledger_id       uuid;
  _promo_left      numeric := _amount;
  _grant           record;
  _take            numeric;
  _promo_consumed  numeric := 0;
  _purchased_used  numeric;
  _result          jsonb;
BEGIN
  -- Argument validation
  IF _operation_id IS NULL THEN
    RAISE EXCEPTION 'debit_shekels: operation_id is required' USING ERRCODE = '22023';
  END IF;
  IF _amount IS NULL OR _amount <= 0 THEN
    RAISE EXCEPTION 'debit_shekels: amount must be positive (got %)', _amount USING ERRCODE = '22023';
  END IF;
  IF _amount <> floor(_amount) THEN
    RAISE EXCEPTION 'debit_shekels: amount must be an integer (got %)', _amount USING ERRCODE = '22023';
  END IF;
  IF _reason_code IS NULL OR length(trim(_reason_code)) = 0 THEN
    RAISE EXCEPTION 'debit_shekels: reason_code is required' USING ERRCODE = '22023';
  END IF;

  -- Idempotency by operation_id
  SELECT * INTO _existing FROM public.debit_operations
    WHERE operation_id = _operation_id FOR UPDATE;
  IF FOUND THEN
    IF _existing.user_id <> _user_id OR _existing.kind <> 'shekels' OR _existing.amount <> _amount THEN
      RAISE EXCEPTION 'debit_shekels: operation_id reused with different parameters' USING ERRCODE = '22023';
    END IF;
    RETURN _existing.result;
  END IF;

  -- Fingerprint replay guard (60s window, different operation_id, completed only)
  IF _request_fingerprint IS NOT NULL THEN
    SELECT * INTO _dup_fp FROM public.debit_operations
      WHERE user_id = _user_id
        AND request_fingerprint = _request_fingerprint
        AND status = 'completed'
        AND created_at > now() - interval '60 seconds'
      ORDER BY created_at DESC
      LIMIT 1;
    IF FOUND THEN
      RAISE EXCEPTION 'debit_shekels: duplicate request fingerprint within replay window (previous operation %)', _dup_fp.operation_id
        USING ERRCODE = '23505';
    END IF;
  END IF;

  -- Kill switch
  IF public.royal_debits_paused() THEN
    RAISE EXCEPTION 'debit_shekels: royal_pass_debits_paused — spending temporarily unavailable'
      USING ERRCODE = 'P0001';
  END IF;

  -- Record pending row so failures leave a breadcrumb
  INSERT INTO public.debit_operations (
    operation_id, user_id, kind, amount, reason_code, ref_table, ref_id,
    result, status, request_fingerprint, caller, asset_type
  ) VALUES (
    _operation_id, _user_id, 'shekels', _amount, _reason_code, _ref_table, _ref_id,
    '{}'::jsonb, 'pending', _request_fingerprint, _caller, 'shekels'
  );

  -- Lock wallet + compute spendable balance
  SELECT shekel_balance INTO _bal
    FROM public.wallets WHERE user_id = _user_id FOR UPDATE;
  IF _bal IS NULL THEN
    UPDATE public.debit_operations
       SET status='failed', failed_at=now(), error_category='wallet_missing',
           error_message=format('wallet not found for user %s', _user_id)
     WHERE operation_id = _operation_id;
    RAISE EXCEPTION 'debit_shekels: wallet not found for user %', _user_id USING ERRCODE = 'P0002';
  END IF;

  _spendable := GREATEST(_bal - public.royal_locked_promo_shekels(_user_id), 0);
  IF _spendable < _amount THEN
    UPDATE public.debit_operations
       SET status='failed', failed_at=now(), error_category='insufficient_funds',
           error_message=format('spendable=%s need=%s', _spendable, _amount)
     WHERE operation_id = _operation_id;
    RAISE EXCEPTION 'debit_shekels: insufficient spendable balance (have %, need %)', _spendable, _amount
      USING ERRCODE = 'P0001';
  END IF;

  _new_bal := _bal - _amount;

  UPDATE public.wallets
     SET shekel_balance = _new_bal,
         total_spent    = COALESCE(total_spent, 0) + _amount,
         updated_at     = now()
   WHERE user_id = _user_id;

  INSERT INTO public.shekel_ledger (user_id, kind, shekels_delta, label, reference_id, metadata)
  VALUES (
    _user_id, 'debit', -_amount, _reason_code, _ref_id,
    COALESCE(_metadata, '{}'::jsonb) ||
      jsonb_build_object(
        'ref_table', _ref_table,
        'reason_code', _reason_code,
        'operation_id', _operation_id,
        'caller', _caller
      )
  )
  RETURNING id INTO _ledger_id;

  -- Consume royal promo shekels FIFO from spendable (non-locked) grants
  FOR _grant IN
    SELECT id, promo_shekels_remaining
      FROM public.royal_pass_grants
     WHERE user_id = _user_id
       AND COALESCE(promo_shekels_remaining, 0) > 0
       AND COALESCE(needs_reconciliation, false) = false
       AND (status IS NULL OR status NOT IN ('disputed','suspended','needs_reconciliation','reversed'))
       AND (dispute_status IS NULL OR dispute_status NOT IN ('warning_needs_response','needs_response','under_review'))
     ORDER BY created_at ASC
     FOR UPDATE
  LOOP
    EXIT WHEN _promo_left <= 0;
    _take := LEAST(_grant.promo_shekels_remaining, _promo_left);
    IF _take > 0 THEN
      UPDATE public.royal_pass_grants
         SET promo_shekels_remaining = promo_shekels_remaining - _take
       WHERE id = _grant.id;

      INSERT INTO public.shekel_spend_allocations (
        operation_id, debit_ledger_id, user_id, source_type,
        royal_pass_grant_id, amount_consumed, metadata
      ) VALUES (
        _operation_id, _ledger_id, _user_id, 'royal_promo',
        _grant.id, _take::int,
        jsonb_build_object('reason_code', _reason_code, 'ref_table', _ref_table, 'ref_id', _ref_id)
      );

      _promo_left     := _promo_left - _take;
      _promo_consumed := _promo_consumed + _take;
    END IF;
  END LOOP;

  _purchased_used := _amount - _promo_consumed;
  IF _purchased_used > 0 THEN
    INSERT INTO public.shekel_spend_allocations (
      operation_id, debit_ledger_id, user_id, source_type,
      royal_pass_grant_id, amount_consumed, metadata
    ) VALUES (
      _operation_id, _ledger_id, _user_id, 'purchased',
      NULL, _purchased_used::int,
      jsonb_build_object('reason_code', _reason_code, 'ref_table', _ref_table, 'ref_id', _ref_id)
    );
  END IF;

  _result := jsonb_build_object(
    'ledger_id',   _ledger_id,
    'new_balance', _new_bal,
    'debited',     _amount,
    'promo_consumed',     _promo_consumed,
    'purchased_consumed', _purchased_used,
    'operation_id', _operation_id
  );

  UPDATE public.debit_operations
     SET status='completed', completed_at=now(), ledger_id=_ledger_id, result=_result
   WHERE operation_id = _operation_id;

  INSERT INTO public.admin_audit_log (actor_id, action, target_type, target_id, details)
  VALUES (
    NULL, 'debit_shekels', 'user', _user_id::text,
    jsonb_build_object(
      'operation_id', _operation_id,
      'amount', _amount,
      'reason_code', _reason_code,
      'ledger_id', _ledger_id,
      'ref_table', _ref_table,
      'ref_id', _ref_id,
      'caller', _caller,
      'promo_consumed', _promo_consumed,
      'purchased_consumed', _purchased_used
    )
  );

  RETURN _result;
END;
$function$;

-- 4) Rewritten debit_boost_token — canonical lot-based FIFO, integer-only,
--    keeps promo_boost_tokens_remaining in sync for backwards-compatible views.
CREATE OR REPLACE FUNCTION public.debit_boost_token(
  _user_id uuid,
  _reason_code text,
  _operation_id uuid,
  _ref_table text DEFAULT NULL,
  _ref_id uuid DEFAULT NULL,
  _metadata jsonb DEFAULT '{}'::jsonb,
  _caller text DEFAULT NULL,
  _request_fingerprint text DEFAULT NULL
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
        AND request_fingerprint = _request_fingerprint
        AND status = 'completed'
        AND created_at > now() - interval '60 seconds'
      ORDER BY created_at DESC
      LIMIT 1;
    IF FOUND THEN
      RAISE EXCEPTION 'debit_boost_token: duplicate request fingerprint within replay window (previous operation %)', _dup_fp.operation_id
        USING ERRCODE = '23505';
    END IF;
  END IF;

  IF public.royal_debits_paused() THEN
    RAISE EXCEPTION 'debit_boost_token: royal_pass_debits_paused — spending temporarily unavailable'
      USING ERRCODE = 'P0001';
  END IF;

  INSERT INTO public.debit_operations (
    operation_id, user_id, kind, amount, reason_code, ref_table, ref_id,
    result, status, request_fingerprint, caller, asset_type
  ) VALUES (
    _operation_id, _user_id, 'boost_token', 1, _reason_code, _ref_table, _ref_id,
    '{}'::jsonb, 'pending', _request_fingerprint, _caller, 'boost_token'
  );

  SELECT COALESCE(SUM(delta), 0) INTO _remaining
    FROM public.boost_tokens_ledger WHERE user_id = _user_id FOR UPDATE;
  IF _remaining <= 0 THEN
    UPDATE public.debit_operations
       SET status='failed', failed_at=now(), error_category='insufficient_funds',
           error_message='no tokens remaining'
     WHERE operation_id = _operation_id;
    RAISE EXCEPTION 'debit_boost_token: no tokens remaining for user %', _user_id USING ERRCODE = 'P0001';
  END IF;

  -- FIFO by oldest active lot with available_quantity > 0
  SELECT id, source_type, royal_pass_grant_id
    INTO _lot
    FROM public.boost_token_lots
   WHERE user_id = _user_id
     AND status = 'active'
     AND available_quantity > 0
   ORDER BY granted_at ASC
   FOR UPDATE
   LIMIT 1;

  IF _lot.id IS NULL THEN
    -- No lot found: this indicates lot/ledger drift. Refuse to debit.
    UPDATE public.debit_operations
       SET status='failed', failed_at=now(), error_category='lot_drift',
           error_message=format('ledger has %s remaining but no active lot with capacity', _remaining)
     WHERE operation_id = _operation_id;
    RAISE EXCEPTION 'debit_boost_token: no active lot with capacity (ledger says % remain) — reconciliation required', _remaining
      USING ERRCODE = 'P0001';
  END IF;

  UPDATE public.boost_token_lots
     SET quantity_consumed = quantity_consumed + 1,
         status = CASE
           WHEN (quantity_granted - (quantity_consumed + 1) - quantity_reversed) = 0 THEN 'depleted'
           ELSE status
         END
   WHERE id = _lot.id;

  IF _lot.source_type = 'royal_promo' THEN
    _source := 'royal';
    _grant_id := _lot.royal_pass_grant_id;
    -- Keep legacy grant counter in sync for existing views/invariants
    UPDATE public.royal_pass_grants
       SET promo_boost_tokens_remaining = GREATEST(COALESCE(promo_boost_tokens_remaining,0) - 1, 0)
     WHERE id = _grant_id;
  ELSE
    _source := 'purchased';
    _grant_id := NULL;
  END IF;

  INSERT INTO public.boost_tokens_ledger (user_id, delta, reason, reference_id, metadata)
  VALUES (
    _user_id, -1, _reason_code, _ref_id,
    COALESCE(_metadata, '{}'::jsonb) || jsonb_build_object(
      'ref_table', _ref_table, 'source', _source,
      'lot_id', _lot.id, 'royal_pass_grant_id', _grant_id,
      'operation_id', _operation_id, 'caller', _caller
    )
  )
  RETURNING id INTO _ledger_id;

  INSERT INTO public.boost_token_spend_allocations (
    user_id, ledger_id, royal_pass_grant_id, source, operation_id, lot_id, amount_consumed
  ) VALUES (_user_id, _ledger_id, _grant_id, _source, _operation_id, _lot.id, 1);

  _result := jsonb_build_object(
    'ledger_id', _ledger_id,
    'lot_id', _lot.id,
    'source', _source,
    'royal_pass_grant_id', _grant_id,
    'remaining', _remaining - 1,
    'operation_id', _operation_id
  );

  UPDATE public.debit_operations
     SET status='completed', completed_at=now(), ledger_id=_ledger_id, result=_result
   WHERE operation_id = _operation_id;

  INSERT INTO public.admin_audit_log (actor_id, action, target_type, target_id, details)
  VALUES (
    NULL, 'debit_boost_token', 'user', _user_id::text,
    jsonb_build_object(
      'operation_id', _operation_id,
      'reason_code', _reason_code,
      'ledger_id', _ledger_id,
      'ref_table', _ref_table,
      'ref_id', _ref_id,
      'source', _source,
      'lot_id', _lot.id,
      'royal_pass_grant_id', _grant_id,
      'caller', _caller
    )
  );

  RETURN _result;
END;
$function$;

-- 5) Restrict execute permissions to service_role only (owner is postgres)
REVOKE ALL ON FUNCTION public.debit_shekels(uuid,numeric,text,uuid,text,uuid,jsonb,text,text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.debit_shekels(uuid,numeric,text,uuid,text,uuid,jsonb,text,text) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.debit_shekels(uuid,numeric,text,uuid,text,uuid,jsonb,text,text) TO service_role;

REVOKE ALL ON FUNCTION public.debit_boost_token(uuid,text,uuid,text,uuid,jsonb,text,text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.debit_boost_token(uuid,text,uuid,text,uuid,jsonb,text,text) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.debit_boost_token(uuid,text,uuid,text,uuid,jsonb,text,text) TO service_role;