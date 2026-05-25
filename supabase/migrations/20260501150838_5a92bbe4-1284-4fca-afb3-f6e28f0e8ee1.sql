
-- 1) PROFILES: restrict email + dob to owner-only via column-revoke + view
-- Simplest approach: replace permissive SELECT with a policy that allows public read,
-- but add a separate policy guard via column privileges.
-- Postgres RLS is row-level only. Use column privileges to hide email/dob from anon/authenticated.
REVOKE SELECT (email, dob) ON public.profiles FROM anon, authenticated;
GRANT SELECT (email, dob) ON public.profiles TO authenticated;

-- Replace SELECT policy: public sees row, but column privs above prevent reading email/dob unless owner
DROP POLICY IF EXISTS "Profiles are viewable by everyone" ON public.profiles;
CREATE POLICY "Public profile fields viewable by everyone"
  ON public.profiles FOR SELECT
  USING (true);

-- Owner-only policy for sensitive columns is enforced through a second restrictive policy
-- using a per-row check that prevents reading email/dob when not owner. Since RLS is row-level,
-- we instead create a SECURITY DEFINER helper view for owner access, and rely on column GRANTs.
-- Revoke email/dob from authenticated and grant via a function gate:
REVOKE SELECT (email, dob) ON public.profiles FROM authenticated;

-- Provide a function the owner can call to fetch their own sensitive fields
CREATE OR REPLACE FUNCTION public.get_my_profile_sensitive()
RETURNS TABLE(email text, dob date)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT email, dob FROM public.profiles WHERE id = auth.uid();
$$;
REVOKE ALL ON FUNCTION public.get_my_profile_sensitive() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_my_profile_sensitive() TO authenticated;

-- 2) WALLETS: drop permissive UPDATE, replace with restrictive owner-only UPDATE that
-- forbids changing balance fields. Add SECURITY DEFINER RPC for mock shekel purchases.
DROP POLICY IF EXISTS "Users update own wallet" ON public.wallets;
-- No direct UPDATE policy for users on wallets — only SECURITY DEFINER functions can update.

CREATE OR REPLACE FUNCTION public.purchase_shekels(p_amount numeric)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user uuid := auth.uid();
  v_new_balance numeric;
BEGIN
  IF v_user IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF p_amount IS NULL OR p_amount <= 0 OR p_amount > 1000000 THEN
    RAISE EXCEPTION 'Invalid amount';
  END IF;
  INSERT INTO public.wallets (user_id, shekel_balance)
  VALUES (v_user, 12450 + p_amount)
  ON CONFLICT (user_id) DO UPDATE
    SET shekel_balance = public.wallets.shekel_balance + p_amount,
        updated_at = now()
  RETURNING shekel_balance INTO v_new_balance;
  RETURN jsonb_build_object('success', true, 'shekel_balance', v_new_balance);
END;
$$;
REVOKE ALL ON FUNCTION public.purchase_shekels(numeric) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.purchase_shekels(numeric) TO authenticated;

-- 3) BOOSTS: drop client INSERT policy, add SECURITY DEFINER RPC that debits shekels
DROP POLICY IF EXISTS "Users buy boosts as themselves" ON public.boosts;

CREATE OR REPLACE FUNCTION public.purchase_boost(p_boost_type text, p_duration_hours integer DEFAULT 24, p_cost_shekels numeric DEFAULT 500)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user uuid := auth.uid();
  v_balance numeric;
  v_id uuid;
  v_cost numeric;
BEGIN
  IF v_user IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF p_duration_hours IS NULL OR p_duration_hours <= 0 OR p_duration_hours > 24*30 THEN
    RAISE EXCEPTION 'Invalid duration';
  END IF;
  -- Server-side authoritative cost mapping
  v_cost := CASE p_boost_type
    WHEN 'royal_boost' THEN 500
    WHEN 'vote_boost' THEN 300
    WHEN 'crown_spotlight' THEN 1000
    WHEN 'profile_glow' THEN 200
    WHEN 'crown_shield' THEN 800
    ELSE NULL
  END;
  IF v_cost IS NULL THEN RAISE EXCEPTION 'Invalid boost type'; END IF;

  SELECT shekel_balance INTO v_balance FROM public.wallets WHERE user_id = v_user FOR UPDATE;
  IF v_balance IS NULL THEN
    INSERT INTO public.wallets (user_id) VALUES (v_user);
    v_balance := 12450;
  END IF;
  IF v_balance < v_cost THEN RAISE EXCEPTION 'Insufficient Shekels'; END IF;

  UPDATE public.wallets
    SET shekel_balance = shekel_balance - v_cost,
        total_spent = total_spent + v_cost,
        updated_at = now()
    WHERE user_id = v_user;

  INSERT INTO public.boosts (user_id, boost_type, active, expires_at)
  VALUES (v_user, p_boost_type::boost_type, true, now() + make_interval(hours => p_duration_hours))
  RETURNING id INTO v_id;

  RETURN jsonb_build_object('success', true, 'boost_id', v_id, 'cost', v_cost);
END;
$$;
REVOKE ALL ON FUNCTION public.purchase_boost(text, integer, numeric) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.purchase_boost(text, integer, numeric) TO authenticated;

-- 4) NOTIFICATIONS: lock down INSERT to SECURITY DEFINER triggers/functions only.
DROP POLICY IF EXISTS "System inserts notifications" ON public.notifications;
-- No INSERT policy: only SECURITY DEFINER functions (which bypass RLS) can insert.

-- 5) GIFT RPC: rewrite to ignore client-supplied price/name; look up authoritatively.
DROP FUNCTION IF EXISTS public.send_royal_gift(text, text, numeric, uuid, uuid, integer);

CREATE OR REPLACE FUNCTION public.send_royal_gift(
  p_gift_id text,
  p_recipient_id uuid,
  p_post_id uuid,
  p_quantity integer
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_sender uuid := auth.uid();
  v_unit_cost numeric;
  v_gift_name text;
  v_total numeric;
  v_fee numeric;
  v_earnings numeric;
  v_balance numeric;
  v_tx_id uuid;
BEGIN
  IF v_sender IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF p_quantity IS NULL OR p_quantity < 1 OR p_quantity > 100 THEN RAISE EXCEPTION 'Invalid quantity'; END IF;
  IF p_recipient_id IS NULL THEN RAISE EXCEPTION 'Invalid recipient'; END IF;

  SELECT name, shekel_cost INTO v_gift_name, v_unit_cost
    FROM public.gifts WHERE id = p_gift_id AND active = true;
  IF NOT FOUND THEN RAISE EXCEPTION 'Invalid gift'; END IF;

  v_total := v_unit_cost * p_quantity;
  v_earnings := v_total * 0.5;
  v_fee := v_total - v_earnings;

  SELECT shekel_balance INTO v_balance FROM public.wallets WHERE user_id = v_sender FOR UPDATE;
  IF v_balance IS NULL THEN
    INSERT INTO public.wallets (user_id) VALUES (v_sender);
    v_balance := 12450;
  END IF;
  IF v_balance < v_total THEN RAISE EXCEPTION 'Insufficient Shekels'; END IF;

  UPDATE public.wallets
    SET shekel_balance = shekel_balance - v_total,
        total_spent = total_spent + v_total,
        updated_at = now()
    WHERE user_id = v_sender;

  INSERT INTO public.wallets (user_id, shekel_balance, total_earned)
  VALUES (p_recipient_id, v_earnings, v_earnings)
  ON CONFLICT (user_id) DO UPDATE
    SET shekel_balance = public.wallets.shekel_balance + v_earnings,
        total_earned = public.wallets.total_earned + v_earnings,
        updated_at = now();

  INSERT INTO public.gift_transactions
    (sender_id, receiver_id, post_id, gift_id, gift_name, quantity,
     total_shekels, platform_fee_shekels, receiver_earnings_shekels)
  VALUES
    (v_sender, p_recipient_id, p_post_id, p_gift_id, v_gift_name, p_quantity,
     v_total, v_fee, v_earnings)
  RETURNING id INTO v_tx_id;

  INSERT INTO public.notifications (user_id, type, title, body, payload)
  VALUES (p_recipient_id, 'vote', 'Royal Gift received',
          'You received ' || p_quantity || 'x ' || v_gift_name,
          jsonb_build_object('gift_id', p_gift_id, 'sender_id', v_sender, 'post_id', p_post_id, 'shekels', v_earnings));

  IF p_post_id IS NOT NULL THEN
    UPDATE public.posts
      SET crown_score = crown_score + (v_total * 0.01)
      WHERE id = p_post_id;
  END IF;

  RETURN jsonb_build_object('success', true, 'transaction_id', v_tx_id, 'total', v_total);
END;
$$;
REVOKE ALL ON FUNCTION public.send_royal_gift(text, uuid, uuid, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.send_royal_gift(text, uuid, uuid, integer) TO authenticated;
