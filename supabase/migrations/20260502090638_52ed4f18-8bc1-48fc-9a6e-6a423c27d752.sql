-- 1. Wallet self-credit fix: drop user INSERT policy; rely on create_wallet_for_user trigger (SECURITY DEFINER)
DROP POLICY IF EXISTS "Users insert own wallet" ON public.wallets;

-- Ensure trigger exists on auth.users for wallet creation
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgname = 'on_auth_user_created_wallet'
  ) THEN
    CREATE TRIGGER on_auth_user_created_wallet
      AFTER INSERT ON auth.users
      FOR EACH ROW EXECUTE FUNCTION public.create_wallet_for_user();
  END IF;
END $$;

-- Add a SECURITY DEFINER helper so client code paths that previously created a wallet on-demand still work,
-- but always with the default starting balance (no client-controlled values).
CREATE OR REPLACE FUNCTION public.ensure_my_wallet()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  INSERT INTO public.wallets (user_id) VALUES (auth.uid())
  ON CONFLICT (user_id) DO NOTHING;
END;
$$;

-- 2. Battles privilege escalation: restrict UPDATE to safe columns only.
-- Drop existing permissive UPDATE policy and replace with column-specific one via trigger guard.
DROP POLICY IF EXISTS "Participants can update battle" ON public.battles;

-- Re-create UPDATE for participants only; column safety enforced by a BEFORE UPDATE trigger.
CREATE POLICY "Participants can update battle limited"
  ON public.battles
  FOR UPDATE
  USING ((auth.uid() = challenger_id) OR (auth.uid() = opponent_id))
  WITH CHECK ((auth.uid() = challenger_id) OR (auth.uid() = opponent_id));

CREATE OR REPLACE FUNCTION public.battles_guard_participant_updates()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Allow service role / admins to update anything
  IF auth.uid() IS NULL OR public.has_role(auth.uid(), 'admin'::app_role) THEN
    RETURN NEW;
  END IF;

  -- Participants may only modify opponent_post_id (e.g., to accept a challenge).
  -- Block changes to vote counts, winner, status, ends_at, ids, etc.
  IF NEW.challenger_votes IS DISTINCT FROM OLD.challenger_votes
     OR NEW.opponent_votes IS DISTINCT FROM OLD.opponent_votes
     OR NEW.winner_id IS DISTINCT FROM OLD.winner_id
     OR NEW.status IS DISTINCT FROM OLD.status
     OR NEW.ends_at IS DISTINCT FROM OLD.ends_at
     OR NEW.challenger_id IS DISTINCT FROM OLD.challenger_id
     OR NEW.opponent_id IS DISTINCT FROM OLD.opponent_id
     OR NEW.challenger_post_id IS DISTINCT FROM OLD.challenger_post_id
     OR NEW.created_at IS DISTINCT FROM OLD.created_at
  THEN
    RAISE EXCEPTION 'Participants cannot modify protected battle fields';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS battles_guard_participant_updates_trg ON public.battles;
CREATE TRIGGER battles_guard_participant_updates_trg
  BEFORE UPDATE ON public.battles
  FOR EACH ROW EXECUTE FUNCTION public.battles_guard_participant_updates();

-- 3. Avatars storage policies: enforce path-scoping in addition to owner check
DROP POLICY IF EXISTS "Owner update avatars" ON storage.objects;
DROP POLICY IF EXISTS "Owner delete avatars" ON storage.objects;

CREATE POLICY "Owner update avatars"
  ON storage.objects FOR UPDATE TO authenticated
  USING (
    bucket_id = 'avatars'
    AND (storage.foldername(name))[1] = auth.uid()::text
  )
  WITH CHECK (
    bucket_id = 'avatars'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

CREATE POLICY "Owner delete avatars"
  ON storage.objects FOR DELETE TO authenticated
  USING (
    bucket_id = 'avatars'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

-- 4. stripe_events: explicit deny-all for non-admin to make intent clear
CREATE POLICY "Deny non-admin access to stripe_events"
  ON public.stripe_events
  AS RESTRICTIVE
  FOR ALL
  TO anon, authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

-- 5. Remove gift_transactions from realtime publication; clients can use the sanitized
-- gift_transactions_public view via polling/refetch on notifications instead.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'gift_transactions'
  ) THEN
    EXECUTE 'ALTER PUBLICATION supabase_realtime DROP TABLE public.gift_transactions';
  END IF;
END $$;

-- Use notifications table (already in realtime context) to signal new gifts to recipients.
-- Add a trigger that broadcasts a lightweight "gift" notification row (no sensitive fields).
-- Note: receivers already get a notification via send_royal_gift; senders/post viewers can
-- refetch via the gift_transactions_public view on a polling interval if needed.