
-- Boost bundles (Stripe-paid boosts)
CREATE TABLE public.boost_bundles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  stripe_price_id text NOT NULL UNIQUE,
  boost_type text NOT NULL,
  label text NOT NULL,
  usd numeric NOT NULL,
  duration_hours integer NOT NULL DEFAULT 24,
  sort_order integer NOT NULL DEFAULT 0,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.boost_bundles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Boost bundles viewable by everyone" ON public.boost_bundles
  FOR SELECT USING (active = true OR has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Admins manage boost bundles" ON public.boost_bundles
  FOR ALL USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

-- Shekel ledger
CREATE TABLE public.shekel_ledger (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  kind text NOT NULL, -- 'bundle_purchase' | 'boost_purchase' | 'boost_stripe' | 'gift_sent' | 'gift_received'
  shekels_delta numeric NOT NULL, -- positive = credit, negative = debit
  usd_amount numeric,
  label text NOT NULL,
  stripe_session_id text,
  stripe_event_id text,
  reference_id uuid, -- boost id, gift tx id, etc.
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_shekel_ledger_user_created ON public.shekel_ledger(user_id, created_at DESC);
CREATE INDEX idx_shekel_ledger_session ON public.shekel_ledger(stripe_session_id);
ALTER TABLE public.shekel_ledger ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users view own ledger" ON public.shekel_ledger
  FOR SELECT USING (auth.uid() = user_id);

-- Update purchase_boost to write ledger
CREATE OR REPLACE FUNCTION public.purchase_boost(p_boost_type text, p_duration_hours integer DEFAULT 24, p_cost_shekels numeric DEFAULT 500)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_user uuid := auth.uid();
  v_balance numeric;
  v_id uuid;
  v_cost numeric;
  v_label text;
BEGIN
  IF v_user IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
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

  INSERT INTO public.shekel_ledger (user_id, kind, shekels_delta, label, reference_id, metadata)
  VALUES (v_user, 'boost_purchase', -v_cost, v_label || ' boost', v_id,
          jsonb_build_object('boost_type', p_boost_type, 'duration_hours', p_duration_hours));

  RETURN jsonb_build_object('success', true, 'boost_id', v_id, 'cost', v_cost);
END;
$function$;
