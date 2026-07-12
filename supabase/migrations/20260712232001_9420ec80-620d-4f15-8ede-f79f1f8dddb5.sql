
-- =====================================================================
-- Stage A v3 M3: ACL lockdown on centralized debit primitives
-- =====================================================================
REVOKE ALL ON FUNCTION public.debit_shekels(uuid, numeric, text, uuid, text, uuid, jsonb, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.debit_shekels(uuid, numeric, text, uuid, text, uuid, jsonb, text, text) FROM anon;
REVOKE ALL ON FUNCTION public.debit_shekels(uuid, numeric, text, uuid, text, uuid, jsonb, text, text) FROM authenticated;
GRANT  EXECUTE ON FUNCTION public.debit_shekels(uuid, numeric, text, uuid, text, uuid, jsonb, text, text) TO service_role;

REVOKE ALL ON FUNCTION public.debit_boost_token(uuid, text, uuid, text, uuid, jsonb, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.debit_boost_token(uuid, text, uuid, text, uuid, jsonb, text, text) FROM anon;
REVOKE ALL ON FUNCTION public.debit_boost_token(uuid, text, uuid, text, uuid, jsonb, text, text) FROM authenticated;
GRANT  EXECUTE ON FUNCTION public.debit_boost_token(uuid, text, uuid, text, uuid, jsonb, text, text) TO service_role;

-- =====================================================================
-- Stage B: Route boost purchases through public.debit_shekels
-- =====================================================================
CREATE OR REPLACE FUNCTION private.purchase_boost(
  _uid uuid,
  p_boost_type text,
  p_duration_hours integer,
  p_cost_shekels numeric,
  p_post_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_id          uuid;
  v_cost        int;
  v_label       text;
  v_post_owner  uuid;
  v_op_id       uuid := gen_random_uuid();
  v_debit_res   jsonb;
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF p_duration_hours IS NULL OR p_duration_hours <= 0 OR p_duration_hours > 24*30 THEN
    RAISE EXCEPTION 'Invalid duration';
  END IF;

  v_cost := CASE p_boost_type
    WHEN 'royal_boost'     THEN 500
    WHEN 'vote_boost'      THEN 300
    WHEN 'crown_spotlight' THEN 1000
    WHEN 'profile_glow'    THEN 200
    WHEN 'crown_shield'    THEN 800
    ELSE NULL
  END;
  IF v_cost IS NULL THEN RAISE EXCEPTION 'Invalid boost type'; END IF;

  IF p_boost_type IN ('royal_boost','vote_boost','crown_spotlight','crown_shield') THEN
    IF p_post_id IS NULL THEN RAISE EXCEPTION 'post_id required for %', p_boost_type; END IF;
    SELECT user_id INTO v_post_owner
      FROM public.posts WHERE id = p_post_id AND is_removed = false;
    IF v_post_owner IS NULL THEN RAISE EXCEPTION 'Post not found'; END IF;
    IF v_post_owner <> _uid THEN RAISE EXCEPTION 'You can only boost your own posts'; END IF;
  ELSE
    p_post_id := NULL;
  END IF;

  v_label := initcap(replace(p_boost_type, '_', ' '));

  -- Ensure wallet row exists (debit_shekels expects it)
  PERFORM private.ensure_my_wallet(_uid);

  INSERT INTO public.boosts (user_id, post_id, boost_type, active, expires_at)
  VALUES (_uid, p_post_id, p_boost_type::boost_type, true, now() + make_interval(hours => p_duration_hours))
  RETURNING id INTO v_id;

  v_debit_res := public.debit_shekels(
    _user_id            => _uid,
    _amount             => v_cost::numeric,
    _reason_code        => 'boost_purchase.' || p_boost_type,
    _operation_id       => v_op_id,
    _ref_table          => 'boosts',
    _ref_id             => v_id,
    _metadata           => jsonb_build_object(
                             'boost_type', p_boost_type,
                             'duration_hours', p_duration_hours,
                             'post_id', p_post_id,
                             'label', v_label
                           ),
    _caller             => 'private.purchase_boost',
    _request_fingerprint => NULL
  );

  RETURN jsonb_build_object(
    'success', true,
    'boost_id', v_id,
    'cost', v_cost,
    'debit', v_debit_res
  );
END
$fn$;

-- Legacy 4-arg overload: delegate to 5-arg (no post_id)
CREATE OR REPLACE FUNCTION private.purchase_boost(
  _uid uuid,
  p_boost_type text,
  p_duration_hours integer,
  p_cost_shekels numeric
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
BEGIN
  RETURN private.purchase_boost(_uid, p_boost_type, p_duration_hours, p_cost_shekels, NULL::uuid);
END
$fn$;

-- =====================================================================
-- Stage B: Route Royal Gift sender debit through public.debit_shekels
-- =====================================================================

-- Drop legacy AFTER INSERT trigger that duplicated the sender-side ledger row.
DROP TRIGGER IF EXISTS trg_gift_transactions_to_shekel_ledger ON public.gift_transactions;

CREATE OR REPLACE FUNCTION private.send_royal_gift(
  _sender       uuid,
  p_gift_id     text,
  p_recipient_id uuid,
  p_post_id     uuid,
  p_quantity    integer,
  p_dedupe_key  uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_unit_cost           numeric;
  v_gift_name           text;
  v_total               numeric;
  v_fee                 numeric;
  v_earnings            numeric;
  v_tx_id               uuid := gen_random_uuid();
  v_existing_id         uuid;
  v_existing_total      numeric;
  v_recipient_banned    boolean;
  v_recipient_suspended boolean;
  v_blocked             boolean;
  v_op_id               uuid := gen_random_uuid();
  v_debit_res           jsonb;
BEGIN
  IF _sender IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF p_quantity IS NULL OR p_quantity < 1 OR p_quantity > 100 THEN RAISE EXCEPTION 'Invalid quantity'; END IF;
  IF p_recipient_id IS NULL THEN RAISE EXCEPTION 'Invalid recipient'; END IF;
  IF p_recipient_id = _sender THEN RAISE EXCEPTION 'You cannot gift yourself'; END IF;

  SELECT is_banned, is_suspended INTO v_recipient_banned, v_recipient_suspended
    FROM public.profiles WHERE id = p_recipient_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Recipient not found'; END IF;
  IF COALESCE(v_recipient_banned, false) THEN RAISE EXCEPTION 'Recipient is unavailable'; END IF;
  IF COALESCE(v_recipient_suspended, false) THEN RAISE EXCEPTION 'Recipient is unavailable'; END IF;

  SELECT EXISTS (
    SELECT 1 FROM public.blocks
     WHERE (blocker_id = _sender AND blocked_id = p_recipient_id)
        OR (blocker_id = p_recipient_id AND blocked_id = _sender)
  ) INTO v_blocked;
  IF v_blocked THEN RAISE EXCEPTION 'Cannot send to this recipient'; END IF;

  IF p_dedupe_key IS NOT NULL THEN
    SELECT id, total_shekels INTO v_existing_id, v_existing_total
      FROM public.gift_transactions
     WHERE sender_id = _sender AND client_dedupe_key = p_dedupe_key
     LIMIT 1;
    IF v_existing_id IS NOT NULL THEN
      RETURN jsonb_build_object('success', true, 'transaction_id', v_existing_id, 'total', v_existing_total, 'deduped', true);
    END IF;
  END IF;

  SELECT name, shekel_cost INTO v_gift_name, v_unit_cost
    FROM public.gifts WHERE id = p_gift_id AND active = true;
  IF NOT FOUND THEN RAISE EXCEPTION 'Invalid gift'; END IF;

  v_total    := v_unit_cost * p_quantity;
  v_earnings := floor(v_total * 0.5);
  v_fee      := v_total - v_earnings;

  -- Ensure sender wallet exists so debit_shekels can lock it
  PERFORM private.ensure_my_wallet(_sender);

  -- Insert gift transaction FIRST so debit_shekels can reference it.
  -- If the sender lacks funds, debit_shekels raises and the whole tx rolls back.
  BEGIN
    INSERT INTO public.gift_transactions
      (id, sender_id, receiver_id, post_id, gift_id, gift_name, quantity,
       total_shekels, platform_fee_shekels, receiver_earnings_shekels, client_dedupe_key)
    VALUES
      (v_tx_id, _sender, p_recipient_id, p_post_id, p_gift_id, v_gift_name, p_quantity,
       v_total, v_fee, v_earnings, p_dedupe_key);
  EXCEPTION WHEN unique_violation THEN
    SELECT id, total_shekels INTO v_existing_id, v_existing_total
      FROM public.gift_transactions
     WHERE sender_id = _sender AND client_dedupe_key = p_dedupe_key
     LIMIT 1;
    RETURN jsonb_build_object('success', true, 'transaction_id', v_existing_id, 'total', v_existing_total, 'deduped', true);
  END;

  -- Centralized sender debit (writes shekel_ledger + spend allocations + audit)
  v_debit_res := public.debit_shekels(
    _user_id            => _sender,
    _amount             => v_total::numeric,
    _reason_code        => 'gift_send',
    _operation_id       => v_op_id,
    _ref_table          => 'gift_transactions',
    _ref_id             => v_tx_id,
    _metadata           => jsonb_build_object(
                             'gift_id', p_gift_id,
                             'gift_name', v_gift_name,
                             'quantity', p_quantity,
                             'receiver_id', p_recipient_id,
                             'post_id', p_post_id,
                             'receiver_earnings_shekels', v_earnings
                           ),
    _caller             => 'private.send_royal_gift',
    _request_fingerprint => NULL
  );

  -- Credit recipient wallet (credits are not centralized)
  BEGIN
    INSERT INTO public.wallets (user_id, shekel_balance, total_earned)
    VALUES (p_recipient_id, v_earnings, v_earnings);
  EXCEPTION WHEN unique_violation THEN
    UPDATE public.wallets
       SET shekel_balance = shekel_balance + v_earnings,
           total_earned   = total_earned + v_earnings,
           updated_at     = now()
     WHERE user_id = p_recipient_id;
  END;

  INSERT INTO public.notifications (user_id, type, title, body, payload)
  VALUES (p_recipient_id, 'vote', 'Royal Gift received',
          'You received ' || p_quantity || 'x ' || v_gift_name,
          jsonb_build_object('gift_id', p_gift_id, 'sender_id', _sender, 'post_id', p_post_id, 'shekels', v_earnings));

  IF p_post_id IS NOT NULL THEN
    UPDATE public.posts
       SET crown_score = crown_score + (v_total * 0.01)
     WHERE id = p_post_id;
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'transaction_id', v_tx_id,
    'total', v_total,
    'debit', v_debit_res
  );
END
$fn$;
