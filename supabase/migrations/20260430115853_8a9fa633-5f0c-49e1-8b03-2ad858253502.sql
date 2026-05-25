-- Wallets
CREATE TABLE public.wallets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL UNIQUE,
  shekel_balance numeric NOT NULL DEFAULT 12450,
  usd_balance numeric NOT NULL DEFAULT 0,
  total_earned numeric NOT NULL DEFAULT 0,
  total_spent numeric NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.wallets ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users view own wallet" ON public.wallets
  FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users insert own wallet" ON public.wallets
  FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users update own wallet" ON public.wallets
  FOR UPDATE USING (auth.uid() = user_id);

-- Gift transactions
CREATE TABLE public.gift_transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sender_id uuid NOT NULL,
  receiver_id uuid NOT NULL,
  post_id uuid,
  gift_id text NOT NULL,
  gift_name text NOT NULL,
  quantity integer NOT NULL DEFAULT 1,
  total_shekels numeric NOT NULL,
  platform_fee_shekels numeric NOT NULL DEFAULT 0,
  receiver_earnings_shekels numeric NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'completed',
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.gift_transactions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Sender or receiver view tx" ON public.gift_transactions
  FOR SELECT USING (auth.uid() = sender_id OR auth.uid() = receiver_id);
CREATE POLICY "Public can view gift feed" ON public.gift_transactions
  FOR SELECT USING (true);

-- Payouts
CREATE TABLE public.payouts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  amount_usd numeric NOT NULL,
  status text NOT NULL DEFAULT 'pending',
  payout_method text,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.payouts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "User view own payouts" ON public.payouts
  FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "User create own payouts" ON public.payouts
  FOR INSERT WITH CHECK (auth.uid() = user_id);

-- Auto-create wallet for new users
CREATE OR REPLACE FUNCTION public.create_wallet_for_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.wallets (user_id) VALUES (NEW.id)
  ON CONFLICT (user_id) DO NOTHING;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_create_wallet
AFTER INSERT ON public.profiles
FOR EACH ROW EXECUTE FUNCTION public.create_wallet_for_user();

-- Backfill wallets for existing users
INSERT INTO public.wallets (user_id)
SELECT id FROM public.profiles
ON CONFLICT (user_id) DO NOTHING;

-- send_royal_gift RPC
CREATE OR REPLACE FUNCTION public.send_royal_gift(
  p_gift_id text,
  p_gift_name text,
  p_gift_cost numeric,
  p_recipient_id uuid,
  p_post_id uuid,
  p_quantity integer
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_sender uuid := auth.uid();
  v_total numeric;
  v_fee numeric;
  v_earnings numeric;
  v_balance numeric;
  v_tx_id uuid;
BEGIN
  IF v_sender IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;
  IF p_quantity < 1 THEN
    RAISE EXCEPTION 'Invalid quantity';
  END IF;

  v_total := p_gift_cost * p_quantity;
  v_earnings := v_total * 0.5;
  v_fee := v_total - v_earnings;

  SELECT shekel_balance INTO v_balance FROM public.wallets WHERE user_id = v_sender FOR UPDATE;
  IF v_balance IS NULL THEN
    INSERT INTO public.wallets (user_id) VALUES (v_sender);
    v_balance := 12450;
  END IF;
  IF v_balance < v_total THEN
    RAISE EXCEPTION 'Insufficient Shekels';
  END IF;

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
    (v_sender, p_recipient_id, p_post_id, p_gift_id, p_gift_name, p_quantity,
     v_total, v_fee, v_earnings)
  RETURNING id INTO v_tx_id;

  INSERT INTO public.notifications (user_id, type, title, body, payload)
  VALUES (p_recipient_id, 'vote', 'Royal Gift received',
          'You received ' || p_quantity || 'x ' || p_gift_name,
          jsonb_build_object('gift_id', p_gift_id, 'sender_id', v_sender, 'post_id', p_post_id, 'shekels', v_earnings));

  IF p_post_id IS NOT NULL THEN
    UPDATE public.posts
      SET crown_score = crown_score + (v_total * 0.01)
      WHERE id = p_post_id;
  END IF;

  RETURN jsonb_build_object('success', true, 'transaction_id', v_tx_id, 'total', v_total);
END;
$$;

-- Add gift_transactions to realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.gift_transactions;