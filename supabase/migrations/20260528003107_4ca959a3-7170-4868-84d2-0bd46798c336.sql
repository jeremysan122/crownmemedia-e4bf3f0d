DROP POLICY IF EXISTS "wallets: deny non-admin writes" ON public.wallets;

CREATE POLICY "wallets: deny non-admin inserts"
  ON public.wallets
  AS RESTRICTIVE
  FOR INSERT
  TO anon, authenticated
  WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));

CREATE POLICY "wallets: deny non-admin updates"
  ON public.wallets
  AS RESTRICTIVE
  FOR UPDATE
  TO anon, authenticated
  USING (public.has_role(auth.uid(), 'admin'::public.app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));

CREATE POLICY "wallets: deny non-admin deletes"
  ON public.wallets
  AS RESTRICTIVE
  FOR DELETE
  TO anon, authenticated
  USING (public.has_role(auth.uid(), 'admin'::public.app_role));