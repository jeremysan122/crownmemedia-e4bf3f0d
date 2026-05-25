-- Bundle catalog
CREATE TABLE public.shekel_bundles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  stripe_price_id text NOT NULL UNIQUE,
  shekels numeric NOT NULL CHECK (shekels > 0),
  usd numeric NOT NULL CHECK (usd > 0),
  label text NOT NULL,
  sort_order int NOT NULL DEFAULT 0,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.shekel_bundles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Bundles viewable by everyone" ON public.shekel_bundles FOR SELECT USING (active = true OR public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins manage bundles" ON public.shekel_bundles FOR ALL USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- Creator Connect accounts
CREATE TABLE public.connect_accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL UNIQUE,
  stripe_account_id text NOT NULL UNIQUE,
  charges_enabled boolean NOT NULL DEFAULT false,
  payouts_enabled boolean NOT NULL DEFAULT false,
  details_submitted boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.connect_accounts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users view own connect account" ON public.connect_accounts FOR SELECT USING (auth.uid() = user_id);

-- Webhook idempotency
CREATE TABLE public.stripe_events (
  id text PRIMARY KEY,
  type text NOT NULL,
  received_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.stripe_events ENABLE ROW LEVEL SECURITY;
-- no policies = backend (service role) only

-- Link payouts to Stripe
ALTER TABLE public.payouts ADD COLUMN stripe_payout_id text UNIQUE;
ALTER TABLE public.payouts ADD COLUMN stripe_account_id text;