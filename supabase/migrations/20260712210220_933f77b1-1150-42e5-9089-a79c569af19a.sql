
-- Stage A: centralized debit primitives ---------------------------------------

-- debit_shekels -------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.debit_shekels(
  _user_id uuid,
  _amount numeric,
  _reason_code text,
  _ref_table text DEFAULT NULL,
  _ref_id uuid DEFAULT NULL,
  _metadata jsonb DEFAULT '{}'::jsonb
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _bal numeric;
  _new_bal numeric;
  _ledger_id uuid;
BEGIN
  IF _amount IS NULL OR _amount <= 0 THEN
    RAISE EXCEPTION 'debit_shekels: amount must be positive (got %)', _amount
      USING ERRCODE = '22023';
  END IF;
  IF _reason_code IS NULL OR length(trim(_reason_code)) = 0 THEN
    RAISE EXCEPTION 'debit_shekels: reason_code is required' USING ERRCODE = '22023';
  END IF;

  SELECT shekel_balance INTO _bal
  FROM public.wallets
  WHERE user_id = _user_id
  FOR UPDATE;

  IF _bal IS NULL THEN
    RAISE EXCEPTION 'debit_shekels: wallet not found for user %', _user_id
      USING ERRCODE = 'P0002';
  END IF;

  IF _bal < _amount THEN
    RAISE EXCEPTION 'debit_shekels: insufficient balance (have %, need %)', _bal, _amount
      USING ERRCODE = 'P0001';
  END IF;

  _new_bal := _bal - _amount;

  UPDATE public.wallets
  SET shekel_balance = _new_bal,
      total_spent    = COALESCE(total_spent, 0) + _amount,
      updated_at     = now()
  WHERE user_id = _user_id;

  INSERT INTO public.shekel_ledger (
    user_id, kind, shekels_delta, label, reference_id, metadata
  ) VALUES (
    _user_id,
    'debit',
    -_amount,
    _reason_code,
    _ref_id,
    COALESCE(_metadata, '{}'::jsonb)
      || jsonb_build_object('ref_table', _ref_table, 'reason_code', _reason_code)
  )
  RETURNING id INTO _ledger_id;

  RETURN jsonb_build_object(
    'ledger_id', _ledger_id,
    'new_balance', _new_bal,
    'debited', _amount
  );
END;
$$;

REVOKE ALL ON FUNCTION public.debit_shekels(uuid, numeric, text, text, uuid, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.debit_shekels(uuid, numeric, text, text, uuid, jsonb) TO service_role;

-- debit_boost_token ---------------------------------------------------------
CREATE OR REPLACE FUNCTION public.debit_boost_token(
  _user_id uuid,
  _reason_code text,
  _ref_table text DEFAULT NULL,
  _ref_id uuid DEFAULT NULL,
  _metadata jsonb DEFAULT '{}'::jsonb
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _remaining int;
  _ledger_id uuid;
  _source text;
BEGIN
  IF _reason_code IS NULL OR length(trim(_reason_code)) = 0 THEN
    RAISE EXCEPTION 'debit_boost_token: reason_code is required' USING ERRCODE = '22023';
  END IF;

  -- Aggregate net remaining tokens under lock.
  SELECT COALESCE(SUM(delta), 0)
    INTO _remaining
  FROM public.boost_tokens_ledger
  WHERE user_id = _user_id
  FOR UPDATE;

  IF _remaining <= 0 THEN
    RAISE EXCEPTION 'debit_boost_token: no tokens remaining for user %', _user_id
      USING ERRCODE = 'P0001';
  END IF;

  -- Prefer Royal-granted tokens first (FIFO within source).
  SELECT CASE
    WHEN EXISTS (
      SELECT 1 FROM public.boost_tokens_ledger
      WHERE user_id = _user_id
        AND delta > 0
        AND reason ILIKE 'royal%'
      HAVING COALESCE(SUM(delta), 0) > (
        SELECT COALESCE(SUM(-delta), 0)
        FROM public.boost_tokens_ledger
        WHERE user_id = _user_id
          AND delta < 0
          AND metadata->>'source' = 'royal'
      )
    ) THEN 'royal'
    ELSE 'purchased'
  END INTO _source;

  INSERT INTO public.boost_tokens_ledger (
    user_id, delta, reason, reference_id, metadata
  ) VALUES (
    _user_id,
    -1,
    _reason_code,
    _ref_id,
    COALESCE(_metadata, '{}'::jsonb)
      || jsonb_build_object('ref_table', _ref_table, 'source', _source)
  )
  RETURNING id INTO _ledger_id;

  RETURN jsonb_build_object(
    'ledger_id', _ledger_id,
    'source', _source,
    'remaining', _remaining - 1
  );
END;
$$;

REVOKE ALL ON FUNCTION public.debit_boost_token(uuid, text, text, uuid, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.debit_boost_token(uuid, text, text, uuid, jsonb) TO service_role;
