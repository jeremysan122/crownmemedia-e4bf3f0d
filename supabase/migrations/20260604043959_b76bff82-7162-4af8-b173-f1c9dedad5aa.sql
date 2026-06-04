-- Add idempotency key for gift sends to prevent double-charging on retry
ALTER TABLE public.gift_transactions
  ADD COLUMN IF NOT EXISTS client_dedupe_key uuid;

CREATE UNIQUE INDEX IF NOT EXISTS gift_transactions_sender_dedupe_uniq
  ON public.gift_transactions (sender_id, client_dedupe_key)
  WHERE client_dedupe_key IS NOT NULL;

-- Update private RPC to accept dedupe key and short-circuit on duplicates
CREATE OR REPLACE FUNCTION private.send_royal_gift(_sender uuid, p_gift_id text, p_recipient_id uuid, p_post_id uuid, p_quantity integer, p_dedupe_key uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_unit_cost numeric;
  v_gift_name text;
  v_total numeric;
  v_fee numeric;
  v_earnings numeric;
  v_balance numeric;
  v_tx_id uuid;
  v_existing_id uuid;
  v_existing_total numeric;
BEGIN
  IF _sender IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF p_quantity IS NULL OR p_quantity < 1 OR p_quantity > 100 THEN RAISE EXCEPTION 'Invalid quantity'; END IF;
  IF p_recipient_id IS NULL THEN RAISE EXCEPTION 'Invalid recipient'; END IF;
  IF p_recipient_id = _sender THEN RAISE EXCEPTION 'You cannot gift yourself'; END IF;

  -- Idempotency: if a transaction with this dedupe key already exists for this sender, return it
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
    FROM public.gifts
   WHERE id = p_gift_id AND active = true;
  IF NOT FOUND THEN RAISE EXCEPTION 'Invalid gift'; END IF;

  v_total := v_unit_cost * p_quantity;
  v_earnings := floor(v_total * 0.5);
  v_fee := v_total - v_earnings;

  SELECT shekel_balance INTO v_balance
    FROM public.wallets
   WHERE user_id = _sender
   FOR UPDATE;

  IF v_balance IS NULL THEN
    INSERT INTO public.wallets (user_id) VALUES (_sender);
    SELECT shekel_balance INTO v_balance
      FROM public.wallets
     WHERE user_id = _sender
     FOR UPDATE;
  END IF;

  IF v_balance < v_total THEN RAISE EXCEPTION 'Insufficient Shekels'; END IF;

  UPDATE public.wallets
     SET shekel_balance = shekel_balance - v_total,
         total_spent = total_spent + v_total,
         updated_at = now()
   WHERE user_id = _sender;

  BEGIN
    INSERT INTO public.wallets (user_id, shekel_balance, total_earned)
    VALUES (p_recipient_id, v_earnings, v_earnings);
  EXCEPTION WHEN unique_violation THEN
    UPDATE public.wallets
       SET shekel_balance = shekel_balance + v_earnings,
           total_earned = total_earned + v_earnings,
           updated_at = now()
     WHERE user_id = p_recipient_id;
  END;

  BEGIN
    INSERT INTO public.gift_transactions
      (sender_id, receiver_id, post_id, gift_id, gift_name, quantity,
       total_shekels, platform_fee_shekels, receiver_earnings_shekels, client_dedupe_key)
    VALUES
      (_sender, p_recipient_id, p_post_id, p_gift_id, v_gift_name, p_quantity,
       v_total, v_fee, v_earnings, p_dedupe_key)
    RETURNING id INTO v_tx_id;
  EXCEPTION WHEN unique_violation THEN
    -- Concurrent retry inserted first; roll back the wallet changes by reverting
    UPDATE public.wallets
       SET shekel_balance = shekel_balance + v_total,
           total_spent = total_spent - v_total,
           updated_at = now()
     WHERE user_id = _sender;
    UPDATE public.wallets
       SET shekel_balance = shekel_balance - v_earnings,
           total_earned = total_earned - v_earnings,
           updated_at = now()
     WHERE user_id = p_recipient_id;
    SELECT id, total_shekels INTO v_existing_id, v_existing_total
      FROM public.gift_transactions
     WHERE sender_id = _sender AND client_dedupe_key = p_dedupe_key
     LIMIT 1;
    RETURN jsonb_build_object('success', true, 'transaction_id', v_existing_id, 'total', v_existing_total, 'deduped', true);
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

  RETURN jsonb_build_object('success', true, 'transaction_id', v_tx_id, 'total', v_total);
END;
$$;

REVOKE ALL ON FUNCTION private.send_royal_gift(uuid, text, uuid, uuid, integer, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION private.send_royal_gift(uuid, text, uuid, uuid, integer, uuid) TO postgres, service_role;

-- Public wrapper with optional dedupe key
CREATE OR REPLACE FUNCTION public.send_royal_gift(p_gift_id text, p_recipient_id uuid, p_post_id uuid, p_quantity integer, p_dedupe_key uuid DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  RETURN private.send_royal_gift(auth.uid(), p_gift_id, p_recipient_id, p_post_id, p_quantity, p_dedupe_key);
END;
$$;

REVOKE ALL ON FUNCTION public.send_royal_gift(text, uuid, uuid, integer, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.send_royal_gift(text, uuid, uuid, integer, uuid) TO authenticated, service_role;