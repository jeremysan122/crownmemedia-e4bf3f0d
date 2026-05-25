-- =====================================================================
-- Security hardening: lock down wallets / ledger / gift_tx / boosts
-- writes, and prevent blocked users from sending DMs / reactions.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. wallets — deny all non-admin writes (INSERT/UPDATE/DELETE)
--    SELECT remains owner-scoped via existing permissive policy.
--    Wallet rows are auto-created by the create_wallet_for_user()
--    SECURITY DEFINER trigger on auth.users INSERT, so users never
--    need direct write access.
-- ---------------------------------------------------------------------
DROP POLICY IF EXISTS "wallets: deny non-admin writes" ON public.wallets;
CREATE POLICY "wallets: deny non-admin writes"
  ON public.wallets
  AS RESTRICTIVE
  FOR ALL
  TO anon, authenticated
  USING (public.has_role(auth.uid(), 'admin'::public.app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));

-- ---------------------------------------------------------------------
-- 2. shekel_ledger — explicitly deny UPDATE and DELETE for non-admins.
--    INSERT was already admin-gated; this closes the door against any
--    future permissive policy being added by accident.
-- ---------------------------------------------------------------------
DROP POLICY IF EXISTS "shekel_ledger: deny non-admin updates" ON public.shekel_ledger;
CREATE POLICY "shekel_ledger: deny non-admin updates"
  ON public.shekel_ledger
  AS RESTRICTIVE
  FOR UPDATE
  TO anon, authenticated
  USING (public.has_role(auth.uid(), 'admin'::public.app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));

DROP POLICY IF EXISTS "shekel_ledger: deny non-admin deletes" ON public.shekel_ledger;
CREATE POLICY "shekel_ledger: deny non-admin deletes"
  ON public.shekel_ledger
  AS RESTRICTIVE
  FOR DELETE
  TO anon, authenticated
  USING (public.has_role(auth.uid(), 'admin'::public.app_role));

-- ---------------------------------------------------------------------
-- 3. gift_transactions — deny non-admin UPDATE and DELETE.
-- ---------------------------------------------------------------------
DROP POLICY IF EXISTS "gift_transactions: deny non-admin updates" ON public.gift_transactions;
CREATE POLICY "gift_transactions: deny non-admin updates"
  ON public.gift_transactions
  AS RESTRICTIVE
  FOR UPDATE
  TO anon, authenticated
  USING (public.has_role(auth.uid(), 'admin'::public.app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));

DROP POLICY IF EXISTS "gift_transactions: deny non-admin deletes" ON public.gift_transactions;
CREATE POLICY "gift_transactions: deny non-admin deletes"
  ON public.gift_transactions
  AS RESTRICTIVE
  FOR DELETE
  TO anon, authenticated
  USING (public.has_role(auth.uid(), 'admin'::public.app_role));

-- ---------------------------------------------------------------------
-- 4. boosts — deny non-admin DELETE (mirrors INSERT/UPDATE protection).
-- ---------------------------------------------------------------------
DROP POLICY IF EXISTS "boosts: deny non-admin deletes" ON public.boosts;
CREATE POLICY "boosts: deny non-admin deletes"
  ON public.boosts
  AS RESTRICTIVE
  FOR DELETE
  TO anon, authenticated
  USING (public.has_role(auth.uid(), 'admin'::public.app_role));

-- ---------------------------------------------------------------------
-- 5. messages — block sends from a user the recipient has blocked.
--    Replaces the existing permissive INSERT policy that only checked
--    sender identity.
-- ---------------------------------------------------------------------
DROP POLICY IF EXISTS "Users send DMs as themselves" ON public.messages;
CREATE POLICY "Users send DMs as themselves"
  ON public.messages
  FOR INSERT
  TO authenticated
  WITH CHECK (
    auth.uid() = sender_id
    AND NOT EXISTS (
      SELECT 1 FROM public.blocks
      WHERE blocker_id = receiver_id
        AND blocked_id = auth.uid()
    )
  );

-- ---------------------------------------------------------------------
-- 6. message_reactions — apply the same block check on INSERT, so a
--    blocked user can't react to a message either.
-- ---------------------------------------------------------------------
DROP POLICY IF EXISTS "Users add own reactions" ON public.message_reactions;
CREATE POLICY "Users add own reactions"
  ON public.message_reactions
  FOR INSERT
  TO authenticated
  WITH CHECK (
    auth.uid() = user_id
    AND EXISTS (
      SELECT 1 FROM public.messages m
      WHERE m.id = message_reactions.message_id
        AND (m.sender_id = auth.uid() OR m.receiver_id = auth.uid())
        AND NOT EXISTS (
          SELECT 1 FROM public.blocks b
          WHERE b.blocker_id = CASE
              WHEN m.sender_id = auth.uid() THEN m.receiver_id
              ELSE m.sender_id
            END
            AND b.blocked_id = auth.uid()
        )
    )
  );
