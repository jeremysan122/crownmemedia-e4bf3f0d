-- Restrict INSERTs on boosts to admins only.
-- Legitimate boost grants flow through SECURITY DEFINER functions
-- (purchase_boost) and the stripe webhook (service role), both of which
-- bypass RLS. This prevents authenticated clients from minting free boosts.
CREATE POLICY "Only admins can insert boosts directly"
ON public.boosts
FOR INSERT
TO authenticated
WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

-- Defense in depth: explicitly forbid client-side INSERTs on
-- gift_transactions and shekel_ledger. These tables are append-only
-- ledgers written exclusively by SECURITY DEFINER RPCs and the
-- service-role stripe webhook.
CREATE POLICY "Only admins can insert gift_transactions directly"
ON public.gift_transactions
FOR INSERT
TO authenticated
WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Only admins can insert shekel_ledger directly"
ON public.shekel_ledger
FOR INSERT
TO authenticated
WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));