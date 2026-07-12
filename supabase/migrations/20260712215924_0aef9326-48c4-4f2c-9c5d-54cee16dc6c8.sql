
-- ============================================================================
-- Stage A Hardening — Centralized debit primitives v2
-- ============================================================================

-- 1) Idempotency ledger --------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.debit_operations (
  operation_id    uuid PRIMARY KEY,
  user_id         uuid NOT NULL,
  kind            text NOT NULL CHECK (kind IN ('shekels','boost_token')),
  amount          numeric NOT NULL DEFAULT 0,
  reason_code     text NOT NULL,
  ref_table       text,
  ref_id          uuid,
  ledger_id       uuid,
  result          jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at      timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.debit_operations TO authenticated;
GRANT ALL    ON public.debit_operations TO service_role;

ALTER TABLE public.debit_operations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "debit_ops_owner_read" ON public.debit_operations;
CREATE POLICY "debit_ops_owner_read"
  ON public.debit_operations FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.has_role(auth.uid(), 'admin'));

CREATE INDEX IF NOT EXISTS debit_operations_user_idx
  ON public.debit_operations (user_id, created_at DESC);

-- 2) Boost-token allocations mirroring gift_spend_allocations ------------------
CREATE TABLE IF NOT EXISTS public.boost_token_spend_allocations (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id              uuid NOT NULL,
  ledger_id            uuid NOT NULL REFERENCES public.boost_tokens_ledger(id) ON DELETE CASCADE,
  royal_pass_grant_id  uuid REFERENCES public.royal_pass_grants(id) ON DELETE SET NULL,
  source               text NOT NULL CHECK (source IN ('royal','purchased')),
  operation_id         uuid,
  created_at           timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.boost_token_spend_allocations TO authenticated;
GRANT ALL    ON public.boost_token_spend_allocations TO service_role;

ALTER TABLE public.boost_token_spend_allocations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "boost_alloc_owner_read" ON public.boost_token_spend_allocations;
CREATE POLICY "boost_alloc_owner_read"
  ON public.boost_token_spend_allocations FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.has_role(auth.uid(), 'admin'));

CREATE INDEX IF NOT EXISTS boost_alloc_user_idx
  ON public.boost_token_spend_allocations (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS boost_alloc_grant_idx
  ON public.boost_token_spend_allocations (royal_pass_grant_id);

-- 3) Spendable-balance helper --------------------------------------------------
CREATE OR REPLACE FUNCTION public.royal_locked_promo_shekels(_user_id uuid)
RETURNS numeric
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(SUM(GREATEST(promo_shekels_remaining, 0)), 0)::numeric
  FROM public.royal_pass_grants
  WHERE user_id = _user_id
    AND (
      COALESCE(needs_reconciliation, false) = true
      OR status IN ('disputed','suspended','needs_reconciliation','reversed')
      OR dispute_status IN ('warning_needs_response','needs_response','under_review')
    )
$$;

REVOKE ALL ON FUNCTION public.royal_locked_promo_shekels(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.royal_locked_promo_shekels(uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.royal_spendable_shekels(_user_id uuid)
RETURNS numeric
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT GREATEST(
    COALESCE((SELECT shekel_balance FROM public.wallets WHERE user_id = _user_id), 0)
      - public.royal_locked_promo_shekels(_user_id),
    0
  )::numeric
$$;

REVOKE ALL ON FUNCTION public.royal_spendable_shekels(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.royal_spendable_shekels(uuid) TO service_role, authenticated;

-- 4) Kill-switch helper --------------------------------------------------------
CREATE OR REPLACE FUNCTION public.royal_debits_paused()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    (SELECT enabled FROM public.feature_flags WHERE key = 'royal_pass_debits_paused'),
    false
  )
$$;

REVOKE ALL ON FUNCTION public.royal_debits_paused() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.royal_debits_paused() TO service_role, authenticated;

-- 5) debit_shekels v2 ----------------------------------------------------------
CREATE OR REPLACE FUNCTION public.debit_shekels(
  _user_id       uuid,
  _amount        numeric,
  _reason_code   text,
  _operation_id  uuid,
  _ref_table     text  DEFAULT NULL,
  _ref_id        uuid  DEFAULT NULL,
  _metadata      jsonb DEFAULT '{}'::jsonb
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _existing        public.debit_operations%ROWTYPE;
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
  IF _operation_id IS NULL THEN
    RAISE EXCEPTION 'debit_shekels: operation_id is required' USING ERRCODE = '22023';
  END IF;
  IF _amount IS NULL OR _amount <= 0 THEN
    RAISE EXCEPTION 'debit_shekels: amount must be positive (got %)', _amount USING ERRCODE = '22023';
  END IF;
  IF _reason_code IS NULL OR length(trim(_reason_code)) = 0 THEN
    RAISE EXCEPTION 'debit_shekels: reason_code is required' USING ERRCODE = '22023';
  END IF;

  -- Idempotency short-circuit.
  SELECT * INTO _existing FROM public.debit_operations
    WHERE operation_id = _operation_id FOR UPDATE;
  IF FOUND THEN
    IF _existing.user_id <> _user_id OR _existing.kind <> 'shekels' OR _existing.amount <> _amount THEN
      RAISE EXCEPTION 'debit_shekels: operation_id reused with different parameters' USING ERRCODE = '22023';
    END IF;
    RETURN _existing.result;
  END IF;

  -- Kill switch.
  IF public.royal_debits_paused() THEN
    RAISE EXCEPTION 'debit_shekels: royal_pass_debits_paused — spending temporarily unavailable'
      USING ERRCODE = 'P0001';
  END IF;

  -- Lock wallet + compute spendable balance.
  SELECT shekel_balance INTO _bal
    FROM public.wallets WHERE user_id = _user_id FOR UPDATE;
  IF _bal IS NULL THEN
    RAISE EXCEPTION 'debit_shekels: wallet not found for user %', _user_id USING ERRCODE = 'P0002';
  END IF;

  _spendable := GREATEST(_bal - public.royal_locked_promo_shekels(_user_id), 0);
  IF _spendable < _amount THEN
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
      jsonb_build_object('ref_table', _ref_table, 'reason_code', _reason_code, 'operation_id', _operation_id)
  )
  RETURNING id INTO _ledger_id;

  -- Consume royal promo shekels FIFO from spendable (non-locked) grants.
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

      INSERT INTO public.gift_spend_allocations (
        gift_transaction_id, user_id, royal_pass_grant_id,
        promo_shekels_consumed, purchased_shekels_consumed
      ) VALUES (
        _ref_id, _user_id, _grant.id, _take::int, 0
      );

      _promo_left     := _promo_left - _take;
      _promo_consumed := _promo_consumed + _take;
    END IF;
  END LOOP;

  _purchased_used := _amount - _promo_consumed;
  IF _purchased_used > 0 THEN
    INSERT INTO public.gift_spend_allocations (
      gift_transaction_id, user_id, royal_pass_grant_id,
      promo_shekels_consumed, purchased_shekels_consumed
    ) VALUES (
      _ref_id, _user_id, NULL, 0, _purchased_used::int
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

  INSERT INTO public.debit_operations (
    operation_id, user_id, kind, amount, reason_code, ref_table, ref_id, ledger_id, result
  ) VALUES (
    _operation_id, _user_id, 'shekels', _amount, _reason_code, _ref_table, _ref_id, _ledger_id, _result
  );

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
      'promo_consumed', _promo_consumed,
      'purchased_consumed', _purchased_used
    )
  );

  RETURN _result;
END;
$$;

REVOKE ALL ON FUNCTION public.debit_shekels(uuid, numeric, text, uuid, text, uuid, jsonb)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.debit_shekels(uuid, numeric, text, uuid, text, uuid, jsonb)
  TO service_role;

-- Drop the old 6-arg signature so callers must adopt the idempotent one.
DROP FUNCTION IF EXISTS public.debit_shekels(uuid, numeric, text, text, uuid, jsonb);

-- 6) debit_boost_token v2 ------------------------------------------------------
CREATE OR REPLACE FUNCTION public.debit_boost_token(
  _user_id      uuid,
  _reason_code  text,
  _operation_id uuid,
  _ref_table    text  DEFAULT NULL,
  _ref_id       uuid  DEFAULT NULL,
  _metadata     jsonb DEFAULT '{}'::jsonb
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _existing    public.debit_operations%ROWTYPE;
  _remaining   int;
  _ledger_id   uuid;
  _grant_id    uuid;
  _source      text;
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

  IF public.royal_debits_paused() THEN
    RAISE EXCEPTION 'debit_boost_token: royal_pass_debits_paused — spending temporarily unavailable'
      USING ERRCODE = 'P0001';
  END IF;

  SELECT COALESCE(SUM(delta), 0) INTO _remaining
    FROM public.boost_tokens_ledger WHERE user_id = _user_id FOR UPDATE;
  IF _remaining <= 0 THEN
    RAISE EXCEPTION 'debit_boost_token: no tokens remaining for user %', _user_id USING ERRCODE = 'P0001';
  END IF;

  -- True FIFO: oldest active royal grant with remaining boost tokens.
  SELECT id INTO _grant_id
    FROM public.royal_pass_grants
   WHERE user_id = _user_id
     AND COALESCE(promo_boost_tokens_remaining, 0) > 0
     AND COALESCE(needs_reconciliation, false) = false
     AND (status IS NULL OR status NOT IN ('disputed','suspended','needs_reconciliation','reversed'))
     AND (dispute_status IS NULL OR dispute_status NOT IN ('warning_needs_response','needs_response','under_review'))
   ORDER BY created_at ASC
   FOR UPDATE
   LIMIT 1;

  IF _grant_id IS NOT NULL THEN
    _source := 'royal';
    UPDATE public.royal_pass_grants
       SET promo_boost_tokens_remaining = promo_boost_tokens_remaining - 1
     WHERE id = _grant_id;
  ELSE
    _source := 'purchased';
  END IF;

  INSERT INTO public.boost_tokens_ledger (user_id, delta, reason, reference_id, metadata)
  VALUES (
    _user_id, -1, _reason_code, _ref_id,
    COALESCE(_metadata, '{}'::jsonb) || jsonb_build_object(
      'ref_table', _ref_table, 'source', _source,
      'royal_pass_grant_id', _grant_id, 'operation_id', _operation_id
    )
  )
  RETURNING id INTO _ledger_id;

  INSERT INTO public.boost_token_spend_allocations (
    user_id, ledger_id, royal_pass_grant_id, source, operation_id
  ) VALUES (_user_id, _ledger_id, _grant_id, _source, _operation_id);

  _result := jsonb_build_object(
    'ledger_id', _ledger_id,
    'source', _source,
    'royal_pass_grant_id', _grant_id,
    'remaining', _remaining - 1,
    'operation_id', _operation_id
  );

  INSERT INTO public.debit_operations (
    operation_id, user_id, kind, amount, reason_code, ref_table, ref_id, ledger_id, result
  ) VALUES (
    _operation_id, _user_id, 'boost_token', 1, _reason_code, _ref_table, _ref_id, _ledger_id, _result
  );

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
      'royal_pass_grant_id', _grant_id
    )
  );

  RETURN _result;
END;
$$;

REVOKE ALL ON FUNCTION public.debit_boost_token(uuid, text, uuid, text, uuid, jsonb)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.debit_boost_token(uuid, text, uuid, text, uuid, jsonb)
  TO service_role;

-- Drop old signature.
DROP FUNCTION IF EXISTS public.debit_boost_token(uuid, text, text, uuid, jsonb);
