-- Hard idempotency for Stripe credits: a given Stripe session can produce
-- at most one ledger row. Backs up the existing pre-check in the webhook
-- and verify-purchase functions in case both fire concurrently.
CREATE UNIQUE INDEX IF NOT EXISTS shekel_ledger_stripe_session_unique
  ON public.shekel_ledger (stripe_session_id)
  WHERE stripe_session_id IS NOT NULL;