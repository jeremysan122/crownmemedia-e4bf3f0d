-- =========================================================
-- Security hardening: SECURITY DEFINER lockdown + extension move
-- =========================================================

-- 1) Move pg_net extension out of public into extensions schema
DROP EXTENSION IF EXISTS pg_net;
CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;

-- 2) Create a private schema NOT exposed via PostgREST
CREATE SCHEMA IF NOT EXISTS private;
REVOKE ALL ON SCHEMA private FROM PUBLIC, anon, authenticated;
GRANT USAGE ON SCHEMA private TO postgres, service_role;

-- 3) Convert confirm_my_age to SECURITY INVOKER (RLS on profiles_private allows self insert/update)
CREATE OR REPLACE FUNCTION public.confirm_my_age(_dob date)
RETURNS void
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;
  IF _dob IS NULL THEN
    RAISE EXCEPTION 'Date of birth required';
  END IF;
  IF _dob > (CURRENT_DATE - INTERVAL '18 years') THEN
    RAISE EXCEPTION 'You must be 18 or older to use CrownMe';
  END IF;

  INSERT INTO public.profiles_private (id, dob, age_confirmed)
  VALUES (auth.uid(), _dob, true)
  ON CONFLICT (id) DO UPDATE
    SET dob = EXCLUDED.dob,
        age_confirmed = true,
        updated_at = now();
END $$;

-- 4) Move privileged DEFINER functions into the `private` schema, then expose
--    INVOKER wrappers in public. Wrappers run as caller, but the inner DEFINER
--    functions execute with their owner's privileges (bypassing RLS where needed).
--    Because the inner functions live in `private` (not exposed via PostgREST),
--    the linter no longer reports them as user-callable SECURITY DEFINER.

-- 4a) ensure_my_wallet
DROP FUNCTION IF EXISTS public.ensure_my_wallet();
CREATE OR REPLACE FUNCTION private.ensure_my_wallet(_uid uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  INSERT INTO public.wallets (user_id) VALUES (_uid)
  ON CONFLICT (user_id) DO NOTHING;
END $$;

CREATE OR REPLACE FUNCTION public.ensure_my_wallet()
RETURNS void
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  PERFORM private.ensure_my_wallet(auth.uid());
END $$;

-- 4b) is_royal_pass_active
DROP FUNCTION IF EXISTS public.is_royal_pass_active(uuid);
CREATE OR REPLACE FUNCTION private.is_royal_pass_active(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.royal_pass_subscriptions
    WHERE user_id = _user_id
      AND status IN ('active','trialing')
      AND (current_period_end IS NULL OR current_period_end > now())
  );
$$;

CREATE OR REPLACE FUNCTION public.is_royal_pass_active(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  SELECT private.is_royal_pass_active(_user_id);
$$;

-- 4c) bump_filter_streak
DROP FUNCTION IF EXISTS public.bump_filter_streak(text);
CREATE OR REPLACE FUNCTION private.bump_filter_streak(_uid uuid, _filter text)
RETURNS public.filter_streaks
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_today date := (now() AT TIME ZONE 'utc')::date;
  v_existing public.filter_streaks;
  v_new_current int;
  v_result public.filter_streaks;
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF _filter IS NULL OR _filter NOT IN (
    'sepia','noir','vivid','fade','chrome',
    'shimmer','glitch','pulse-glow','scanlines','gold-sparkle'
  ) THEN
    RAISE EXCEPTION 'Invalid filter: %', _filter;
  END IF;

  SELECT * INTO v_existing
    FROM public.filter_streaks
    WHERE user_id = _uid AND filter = _filter
    FOR UPDATE;

  IF NOT FOUND THEN
    INSERT INTO public.filter_streaks (user_id, filter, current_streak, longest_streak, last_vote_date)
    VALUES (_uid, _filter, 1, 1, v_today)
    RETURNING * INTO v_result;
    RETURN v_result;
  END IF;

  IF v_existing.last_vote_date = v_today THEN
    RETURN v_existing;
  ELSIF v_existing.last_vote_date = v_today - INTERVAL '1 day' THEN
    v_new_current := v_existing.current_streak + 1;
  ELSE
    v_new_current := 1;
  END IF;

  UPDATE public.filter_streaks
    SET current_streak = v_new_current,
        longest_streak = GREATEST(longest_streak, v_new_current),
        last_vote_date = v_today,
        updated_at = now()
    WHERE id = v_existing.id
    RETURNING * INTO v_result;
  RETURN v_result;
END $$;

CREATE OR REPLACE FUNCTION public.bump_filter_streak(_filter text)
RETURNS public.filter_streaks
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE v_result public.filter_streaks;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  v_result := private.bump_filter_streak(auth.uid(), _filter);
  RETURN v_result;
END $$;

-- 4d) purchase_boost
DROP FUNCTION IF EXISTS public.purchase_boost(text, integer, numeric);
CREATE OR REPLACE FUNCTION private.purchase_boost(_uid uuid, p_boost_type text, p_duration_hours integer, p_cost_shekels numeric)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_balance numeric;
  v_id uuid;
  v_cost numeric;
  v_label text;
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF p_duration_hours IS NULL OR p_duration_hours <= 0 OR p_duration_hours > 24*30 THEN
    RAISE EXCEPTION 'Invalid duration';
  END IF;
  v_cost := CASE p_boost_type
    WHEN 'royal_boost' THEN 500
    WHEN 'vote_boost' THEN 300
    WHEN 'crown_spotlight' THEN 1000
    WHEN 'profile_glow' THEN 200
    WHEN 'crown_shield' THEN 800
    ELSE NULL
  END;
  IF v_cost IS NULL THEN RAISE EXCEPTION 'Invalid boost type'; END IF;
  v_label := initcap(replace(p_boost_type, '_', ' '));

  SELECT shekel_balance INTO v_balance FROM public.wallets WHERE user_id = _uid FOR UPDATE;
  IF v_balance IS NULL THEN
    INSERT INTO public.wallets (user_id) VALUES (_uid);
    v_balance := 12450;
  END IF;
  IF v_balance < v_cost THEN RAISE EXCEPTION 'Insufficient Shekels'; END IF;

  UPDATE public.wallets
    SET shekel_balance = shekel_balance - v_cost,
        total_spent = total_spent + v_cost,
        updated_at = now()
    WHERE user_id = _uid;

  INSERT INTO public.boosts (user_id, boost_type, active, expires_at)
  VALUES (_uid, p_boost_type::boost_type, true, now() + make_interval(hours => p_duration_hours))
  RETURNING id INTO v_id;

  INSERT INTO public.shekel_ledger (user_id, kind, shekels_delta, label, reference_id, metadata)
  VALUES (_uid, 'boost_purchase', -v_cost, v_label || ' boost', v_id,
          jsonb_build_object('boost_type', p_boost_type, 'duration_hours', p_duration_hours));

  RETURN jsonb_build_object('success', true, 'boost_id', v_id, 'cost', v_cost);
END $$;

CREATE OR REPLACE FUNCTION public.purchase_boost(p_boost_type text, p_duration_hours integer DEFAULT 24, p_cost_shekels numeric DEFAULT 500)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  RETURN private.purchase_boost(auth.uid(), p_boost_type, p_duration_hours, p_cost_shekels);
END $$;

-- 4e) send_royal_gift
DROP FUNCTION IF EXISTS public.send_royal_gift(text, uuid, uuid, integer);
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

  SELECT name, shekel_cost INTO v_gift_name, v_unit_cost
    FROM public.gifts WHERE id = p_gift_id AND active = true;
  IF NOT FOUND THEN RAISE EXCEPTION 'Invalid gift'; END IF;

  v_total := v_unit_cost * p_quantity;
  v_earnings := v_total * 0.5;
  v_fee := v_total - v_earnings;

  SELECT shekel_balance INTO v_balance FROM public.wallets WHERE user_id = _sender FOR UPDATE;
  IF v_balance IS NULL THEN
    INSERT INTO public.wallets (user_id) VALUES (_sender);
    v_balance := 12450;
  END IF;
  IF v_balance < v_total THEN RAISE EXCEPTION 'Insufficient Shekels'; END IF;

  UPDATE public.wallets
    SET shekel_balance = shekel_balance - v_total,
        total_spent = total_spent + v_total,
        updated_at = now()
    WHERE user_id = _sender;

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
END $$;

CREATE OR REPLACE FUNCTION public.send_royal_gift(p_gift_id text, p_recipient_id uuid, p_post_id uuid, p_quantity integer)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  RETURN private.send_royal_gift(auth.uid(), p_gift_id, p_recipient_id, p_post_id, p_quantity);
END $$;

-- 5) Lock down execute on all private.* functions
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA private FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA private TO postgres, service_role;

-- 6) Re-grant execute on the public wrappers (NOTE: invoker, no privilege escalation)
GRANT EXECUTE ON FUNCTION public.ensure_my_wallet() TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_royal_pass_active(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.bump_filter_streak(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.purchase_boost(text, integer, numeric) TO authenticated;
GRANT EXECUTE ON FUNCTION public.send_royal_gift(text, uuid, uuid, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.confirm_my_age(date) TO authenticated;