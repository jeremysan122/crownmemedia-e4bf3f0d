-- Privacy-safe analytics events
CREATE TABLE IF NOT EXISTS public.analytics_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_name text NOT NULL CHECK (event_name = ANY (ARRAY['vote_cast','vote_removed','comment_posted','post_shared','post_viewed'])),
  user_hash text,                -- sha256(user_id || daily_salt) — never the raw uid
  post_id uuid,
  category text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_analytics_events_created ON public.analytics_events (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_analytics_events_event ON public.analytics_events (event_name, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_analytics_events_post ON public.analytics_events (post_id) WHERE post_id IS NOT NULL;

ALTER TABLE public.analytics_events ENABLE ROW LEVEL SECURITY;

-- Only authenticated clients can insert; payload size + shape constrained
CREATE POLICY "Authenticated insert analytics"
  ON public.analytics_events FOR INSERT
  TO authenticated
  WITH CHECK (
    octet_length(coalesce(metadata::text,'')) < 1024
    AND (user_hash IS NULL OR length(user_hash) BETWEEN 16 AND 128)
  );

-- Admins read aggregates
CREATE POLICY "Admins read analytics"
  ON public.analytics_events FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role));

-- Lightweight rate limit: <= 60 events / minute per session hash
CREATE OR REPLACE FUNCTION public.analytics_events_rate_limit()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_recent int;
BEGIN
  IF NEW.user_hash IS NULL THEN RETURN NEW; END IF;
  SELECT count(*) INTO v_recent
    FROM public.analytics_events
    WHERE user_hash = NEW.user_hash
      AND created_at > now() - interval '1 minute';
  IF v_recent >= 60 THEN
    RAISE EXCEPTION 'analytics rate limit exceeded';
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_analytics_events_rate_limit ON public.analytics_events;
CREATE TRIGGER trg_analytics_events_rate_limit
  BEFORE INSERT ON public.analytics_events
  FOR EACH ROW EXECUTE FUNCTION public.analytics_events_rate_limit();

-- Strengthen security invariants: analytics must remain admin-read + no UPDATE/DELETE policies
CREATE OR REPLACE FUNCTION public.assert_security_invariants()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_count int; v_bad text;
BEGIN
  SELECT count(*) INTO v_count FROM pg_policies
  WHERE schemaname='public' AND tablename='boosts' AND cmd='INSERT'
    AND qual_or_check_contains(coalesce(with_check,''), 'has_role');
  IF v_count = 0 THEN RAISE EXCEPTION 'Security regression: boosts INSERT no longer admin-gated'; END IF;

  SELECT count(*) INTO v_count FROM pg_policies
  WHERE schemaname='public' AND tablename='boosts' AND cmd='UPDATE'
    AND qual_or_check_contains(coalesce(qual,''), 'has_role');
  IF v_count = 0 THEN RAISE EXCEPTION 'Security regression: boosts UPDATE no longer admin-gated'; END IF;

  SELECT count(*) INTO v_count FROM pg_policies
  WHERE schemaname='public' AND tablename='shekel_ledger' AND cmd='INSERT'
    AND qual_or_check_contains(coalesce(with_check,''), 'has_role');
  IF v_count = 0 THEN RAISE EXCEPTION 'Security regression: shekel_ledger INSERT no longer admin-gated'; END IF;

  SELECT count(*) INTO v_count FROM pg_policies
  WHERE schemaname='public' AND tablename='gift_transactions' AND cmd='INSERT'
    AND qual_or_check_contains(coalesce(with_check,''), 'has_role');
  IF v_count = 0 THEN RAISE EXCEPTION 'Security regression: gift_transactions INSERT no longer admin-gated'; END IF;

  SELECT count(*) INTO v_count FROM pg_policies
  WHERE schemaname='public' AND tablename IN ('shekel_ledger','gift_transactions','wallets','analytics_events')
    AND cmd IN ('UPDATE','DELETE');
  IF v_count > 0 THEN RAISE EXCEPTION 'Security regression: ledger/wallet/gift_tx/analytics now allows UPDATE or DELETE'; END IF;

  SELECT count(*) INTO v_count FROM pg_policies
  WHERE schemaname='public' AND tablename='votes' AND cmd='INSERT'
    AND qual_or_check_contains(coalesce(with_check,''), 'auth.uid()');
  IF v_count = 0 THEN RAISE EXCEPTION 'Security regression: votes INSERT no longer self-scoped'; END IF;

  SELECT count(*) INTO v_count FROM pg_policies
  WHERE schemaname='public' AND tablename='comments' AND cmd='INSERT'
    AND qual_or_check_contains(coalesce(with_check,''), 'auth.uid()');
  IF v_count = 0 THEN RAISE EXCEPTION 'Security regression: comments INSERT no longer self-scoped'; END IF;

  -- analytics_events must keep admin-read
  SELECT count(*) INTO v_count FROM pg_policies
  WHERE schemaname='public' AND tablename='analytics_events' AND cmd='SELECT'
    AND qual_or_check_contains(coalesce(qual,''), 'has_role');
  IF v_count = 0 THEN RAISE EXCEPTION 'Security regression: analytics_events SELECT no longer admin-gated'; END IF;

  SELECT string_agg(p.proname, ', ') INTO v_bad
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname='public' AND p.prosecdef = true
    AND has_function_privilege('anon', p.oid, 'EXECUTE');
  IF v_bad IS NOT NULL THEN
    RAISE EXCEPTION 'Security regression: SECURITY DEFINER function(s) callable by anon: %', v_bad;
  END IF;
END $$;

REVOKE EXECUTE ON FUNCTION public.analytics_events_rate_limit() FROM PUBLIC, anon;