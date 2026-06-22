CREATE TABLE IF NOT EXISTS public.payment_transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  provider text NOT NULL CHECK (provider IN ('stripe','internal')),
  provider_event_id text,
  intent text NOT NULL CHECK (intent IN ('shekel_purchase','boost','royal_pass','gift','payout','refund','adjustment')),
  amount_usd numeric(12,2),
  currency text NOT NULL DEFAULT 'usd',
  shekels_delta numeric(14,2) NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','succeeded','failed','refunded','canceled')),
  reference_table text,
  reference_id uuid,
  description text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT payment_tx_event_unique UNIQUE (provider, provider_event_id)
);

GRANT SELECT ON public.payment_transactions TO authenticated;
GRANT ALL ON public.payment_transactions TO service_role;

ALTER TABLE public.payment_transactions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "users view own transactions"
  ON public.payment_transactions FOR SELECT TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "admins view all transactions"
  ON public.payment_transactions FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(),'admin'));

CREATE INDEX idx_payment_tx_user_created ON public.payment_transactions(user_id, created_at DESC);
CREATE INDEX idx_payment_tx_intent_status ON public.payment_transactions(intent, status, created_at DESC);
CREATE INDEX idx_payment_tx_reference ON public.payment_transactions(reference_table, reference_id);

CREATE TRIGGER trg_payment_tx_updated_at BEFORE UPDATE ON public.payment_transactions FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();