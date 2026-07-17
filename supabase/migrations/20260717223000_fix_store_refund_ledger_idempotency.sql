-- Preserve one entitlement credit per Stripe Checkout Session while allowing
-- the immutable refund entry to reference the same session. The previous
-- index covered every ledger kind, so handle_store_refund could never append
-- its bundle_refund row beside the original bundle_purchase row.
DROP INDEX IF EXISTS public.shekel_ledger_stripe_session_unique;

CREATE UNIQUE INDEX shekel_ledger_stripe_session_unique
  ON public.shekel_ledger (stripe_session_id)
  WHERE stripe_session_id IS NOT NULL
    AND kind <> 'bundle_refund';

