
-- ============================================================================
-- 1. BOOSTS: lock down UPDATE to admins only
-- ============================================================================
DROP POLICY IF EXISTS "Users update own boosts" ON public.boosts;

CREATE POLICY "Only admins can update boosts directly"
ON public.boosts FOR UPDATE TO authenticated
USING (public.has_role(auth.uid(), 'admin'::app_role))
WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

-- ============================================================================
-- 2. STORAGE: restrict bucket listing to authenticated users
--    (Public CDN URLs still serve files; only the LIST API is gated.)
-- ============================================================================
DROP POLICY IF EXISTS "Public read avatars" ON storage.objects;
DROP POLICY IF EXISTS "Public read posts" ON storage.objects;
DROP POLICY IF EXISTS "Public read share-cards" ON storage.objects;
DROP POLICY IF EXISTS "Banner images are publicly accessible" ON storage.objects;

CREATE POLICY "Authenticated read avatars"
ON storage.objects FOR SELECT TO authenticated
USING (bucket_id = 'avatars');

CREATE POLICY "Authenticated read posts"
ON storage.objects FOR SELECT TO authenticated
USING (bucket_id = 'posts');

CREATE POLICY "Authenticated read share-cards"
ON storage.objects FOR SELECT TO authenticated
USING (bucket_id = 'share-cards');

CREATE POLICY "Authenticated read banners"
ON storage.objects FOR SELECT TO authenticated
USING (bucket_id = 'banners');

-- ============================================================================
-- 3. SECURITY DEFINER function lockdown
--    Revoke EXECUTE from public/anon on every SECURITY DEFINER function
--    in the public schema, then grant back only the user-callable ones.
-- ============================================================================
DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT n.nspname, p.proname,
           pg_catalog.pg_get_function_identity_arguments(p.oid) AS args
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.prosecdef = true
  LOOP
    EXECUTE format(
      'REVOKE ALL ON FUNCTION %I.%I(%s) FROM PUBLIC, anon',
      r.nspname, r.proname, r.args
    );
  END LOOP;
END $$;

-- Functions that the app intentionally calls from authenticated client code
GRANT EXECUTE ON FUNCTION public.ensure_my_wallet()                          TO authenticated;
GRANT EXECUTE ON FUNCTION public.send_royal_gift(text, uuid, uuid, integer)  TO authenticated;
GRANT EXECUTE ON FUNCTION public.purchase_boost(text, integer, numeric)      TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_my_profile_sensitive()                  TO authenticated;
GRANT EXECUTE ON FUNCTION public.has_role(uuid, public.app_role)             TO authenticated;
GRANT EXECUTE ON FUNCTION public.notif_pref(uuid, text)                      TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_thread_muted(uuid, uuid)                 TO authenticated;
GRANT EXECUTE ON FUNCTION public.dm_pair_folder(uuid, uuid)                  TO authenticated;

-- ============================================================================
-- 4. Regression guardrail — call at end of any future migration
-- ============================================================================
CREATE OR REPLACE FUNCTION public.assert_security_invariants()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count int;
  v_bad text;
BEGIN
  -- Boosts: only admins may INSERT or UPDATE
  SELECT count(*) INTO v_count FROM pg_policies
  WHERE schemaname='public' AND tablename='boosts' AND cmd='INSERT'
    AND qual_or_check_contains(coalesce(with_check,''), 'has_role');
  IF v_count = 0 THEN
    RAISE EXCEPTION 'Security regression: boosts INSERT no longer admin-gated';
  END IF;

  SELECT count(*) INTO v_count FROM pg_policies
  WHERE schemaname='public' AND tablename='boosts' AND cmd='UPDATE'
    AND qual_or_check_contains(coalesce(qual,''), 'has_role');
  IF v_count = 0 THEN
    RAISE EXCEPTION 'Security regression: boosts UPDATE no longer admin-gated';
  END IF;

  -- shekel_ledger and gift_transactions: INSERT must be admin-gated
  SELECT count(*) INTO v_count FROM pg_policies
  WHERE schemaname='public' AND tablename='shekel_ledger' AND cmd='INSERT'
    AND qual_or_check_contains(coalesce(with_check,''), 'has_role');
  IF v_count = 0 THEN
    RAISE EXCEPTION 'Security regression: shekel_ledger INSERT no longer admin-gated';
  END IF;

  SELECT count(*) INTO v_count FROM pg_policies
  WHERE schemaname='public' AND tablename='gift_transactions' AND cmd='INSERT'
    AND qual_or_check_contains(coalesce(with_check,''), 'has_role');
  IF v_count = 0 THEN
    RAISE EXCEPTION 'Security regression: gift_transactions INSERT no longer admin-gated';
  END IF;

  -- shekel_ledger and gift_transactions: must NOT be UPDATE-able or DELETE-able
  SELECT count(*) INTO v_count FROM pg_policies
  WHERE schemaname='public' AND tablename IN ('shekel_ledger','gift_transactions','wallets')
    AND cmd IN ('UPDATE','DELETE');
  IF v_count > 0 THEN
    RAISE EXCEPTION 'Security regression: ledger/wallet/gift_tx now allows UPDATE or DELETE';
  END IF;

  -- Votes: INSERT must require auth.uid() = user_id
  SELECT count(*) INTO v_count FROM pg_policies
  WHERE schemaname='public' AND tablename='votes' AND cmd='INSERT'
    AND qual_or_check_contains(coalesce(with_check,''), 'auth.uid()');
  IF v_count = 0 THEN
    RAISE EXCEPTION 'Security regression: votes INSERT no longer self-scoped';
  END IF;

  -- Comments: INSERT must require auth.uid() = user_id
  SELECT count(*) INTO v_count FROM pg_policies
  WHERE schemaname='public' AND tablename='comments' AND cmd='INSERT'
    AND qual_or_check_contains(coalesce(with_check,''), 'auth.uid()');
  IF v_count = 0 THEN
    RAISE EXCEPTION 'Security regression: comments INSERT no longer self-scoped';
  END IF;

  -- No SECURITY DEFINER function in public should be executable by anon
  SELECT string_agg(p.proname, ', ') INTO v_bad
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname='public' AND p.prosecdef = true
    AND has_function_privilege('anon', p.oid, 'EXECUTE');
  IF v_bad IS NOT NULL THEN
    RAISE EXCEPTION 'Security regression: SECURITY DEFINER function(s) callable by anon: %', v_bad;
  END IF;
END $$;

-- Helper for the invariants checker (case-insensitive substring)
CREATE OR REPLACE FUNCTION public.qual_or_check_contains(_haystack text, _needle text)
RETURNS boolean
LANGUAGE sql IMMUTABLE
AS $$ SELECT position(lower(_needle) in lower(_haystack)) > 0 $$;

REVOKE ALL ON FUNCTION public.assert_security_invariants() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.qual_or_check_contains(text, text) FROM PUBLIC, anon;

-- Run the check now to validate this migration itself
SELECT public.assert_security_invariants();
