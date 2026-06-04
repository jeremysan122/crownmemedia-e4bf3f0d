CREATE OR REPLACE FUNCTION private.send_royal_gift(_sender uuid, p_gift_id text, p_recipient_id uuid, p_post_id uuid, p_quantity integer)
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
BEGIN
  IF _sender IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF p_quantity IS NULL OR p_quantity < 1 OR p_quantity > 100 THEN RAISE EXCEPTION 'Invalid quantity'; END IF;
  IF p_recipient_id IS NULL THEN RAISE EXCEPTION 'Invalid recipient'; END IF;
  IF p_recipient_id = _sender THEN RAISE EXCEPTION 'You cannot gift yourself'; END IF;

  SELECT name, shekel_cost INTO v_gift_name, v_unit_cost
    FROM public.gifts
   WHERE id = p_gift_id
     AND active = true;
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

  INSERT INTO public.gift_transactions
    (sender_id, receiver_id, post_id, gift_id, gift_name, quantity,
     total_shekels, platform_fee_shekels, receiver_earnings_shekels)
  VALUES
    (_sender, p_recipient_id, p_post_id, p_gift_id, v_gift_name, p_quantity,
     v_total, v_fee, v_earnings)
  RETURNING id INTO v_tx_id;

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

REVOKE ALL ON FUNCTION private.send_royal_gift(uuid, text, uuid, uuid, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION private.send_royal_gift(uuid, text, uuid, uuid, integer) TO postgres, service_role;

CREATE OR REPLACE FUNCTION public.send_royal_gift(p_gift_id text, p_recipient_id uuid, p_post_id uuid, p_quantity integer)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  RETURN private.send_royal_gift(auth.uid(), p_gift_id, p_recipient_id, p_post_id, p_quantity);
END;
$$;

REVOKE ALL ON FUNCTION public.send_royal_gift(text, uuid, uuid, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.send_royal_gift(text, uuid, uuid, integer) TO authenticated;