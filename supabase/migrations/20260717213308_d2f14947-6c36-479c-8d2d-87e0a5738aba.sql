DROP INDEX IF EXISTS public.shekel_ledger_stripe_session_unique;

CREATE UNIQUE INDEX shekel_ledger_stripe_session_unique
  ON public.shekel_ledger (stripe_session_id)
  WHERE stripe_session_id IS NOT NULL
    AND kind <> 'bundle_refund';