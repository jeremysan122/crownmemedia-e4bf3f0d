
ALTER TABLE public.payouts
  ADD COLUMN IF NOT EXISTS metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS shekels_locked numeric NOT NULL DEFAULT 0;

CREATE INDEX IF NOT EXISTS idx_payouts_user_created
  ON public.payouts(user_id, created_at DESC);
