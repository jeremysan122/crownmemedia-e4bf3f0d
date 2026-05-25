-- Lock down connect_accounts: only service role / admin can write.
-- Users can only SELECT their own row (existing policy).

-- Restrictive policy denying all writes from anon/authenticated unless admin.
CREATE POLICY "connect_accounts: deny non-admin writes"
  ON public.connect_accounts
  AS RESTRICTIVE
  FOR ALL
  TO anon, authenticated
  USING (public.has_role(auth.uid(), 'admin'::public.app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));

-- Also lock down royal_pass_subscriptions writes (defense-in-depth: stripe_customer_id/subscription_id must only be written by webhooks via service role).
CREATE POLICY "royal_pass_subscriptions: deny non-admin writes"
  ON public.royal_pass_subscriptions
  AS RESTRICTIVE
  FOR INSERT
  TO anon, authenticated
  WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));

CREATE POLICY "royal_pass_subscriptions: deny non-admin updates"
  ON public.royal_pass_subscriptions
  AS RESTRICTIVE
  FOR UPDATE
  TO anon, authenticated
  USING (public.has_role(auth.uid(), 'admin'::public.app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));

CREATE POLICY "royal_pass_subscriptions: deny non-admin deletes"
  ON public.royal_pass_subscriptions
  AS RESTRICTIVE
  FOR DELETE
  TO anon, authenticated
  USING (public.has_role(auth.uid(), 'admin'::public.app_role));