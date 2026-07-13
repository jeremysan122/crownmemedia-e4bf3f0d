-- 1) Failed daily Royal Boost claim attempts (persist across devices)
CREATE TABLE IF NOT EXISTS public.royal_pass_boost_claim_failures (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  post_id UUID,
  reason TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_rpbcf_user_created
  ON public.royal_pass_boost_claim_failures (user_id, created_at DESC);

GRANT SELECT, INSERT ON public.royal_pass_boost_claim_failures TO authenticated;
GRANT ALL ON public.royal_pass_boost_claim_failures TO service_role;
ALTER TABLE public.royal_pass_boost_claim_failures ENABLE ROW LEVEL SECURITY;

CREATE POLICY "own failures readable"
  ON public.royal_pass_boost_claim_failures FOR SELECT
  TO authenticated USING (auth.uid() = user_id);

CREATE POLICY "own failures insertable"
  ON public.royal_pass_boost_claim_failures FOR INSERT
  TO authenticated WITH CHECK (auth.uid() = user_id);

-- RPC to record a failed claim (idempotent-ish, capped, sanitizes reason)
CREATE OR REPLACE FUNCTION public.record_failed_royal_boost(p_reason TEXT, p_post_id UUID DEFAULT NULL)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid UUID := auth.uid();
  v_id UUID;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'auth required'; END IF;
  INSERT INTO public.royal_pass_boost_claim_failures (user_id, post_id, reason)
  VALUES (v_uid, p_post_id, LEFT(COALESCE(p_reason, 'unknown'), 300))
  RETURNING id INTO v_id;
  -- keep only 30 most recent per user
  DELETE FROM public.royal_pass_boost_claim_failures
   WHERE user_id = v_uid
     AND id NOT IN (
       SELECT id FROM public.royal_pass_boost_claim_failures
        WHERE user_id = v_uid
        ORDER BY created_at DESC
        LIMIT 30
     );
  RETURN v_id;
END;
$$;

REVOKE ALL ON FUNCTION public.record_failed_royal_boost(TEXT, UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.record_failed_royal_boost(TEXT, UUID) TO authenticated;

-- 2) Admin audit log for entitlement refreshes (Refresh Entitlements from Stripe)
CREATE TABLE IF NOT EXISTS public.royal_pass_sync_audit (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  actor_user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  target_user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  environment TEXT NOT NULL CHECK (environment IN ('sandbox','live')),
  success BOOLEAN NOT NULL,
  status TEXT,
  stripe_subscription_id TEXT,
  current_period_end TIMESTAMPTZ,
  error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_rpsa_created ON public.royal_pass_sync_audit (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_rpsa_actor ON public.royal_pass_sync_audit (actor_user_id, created_at DESC);

GRANT SELECT ON public.royal_pass_sync_audit TO authenticated;
GRANT ALL ON public.royal_pass_sync_audit TO service_role;
ALTER TABLE public.royal_pass_sync_audit ENABLE ROW LEVEL SECURITY;

-- Admins only can read (matches Refresh Entitlements admin-only capability)
CREATE POLICY "admins read sync audit"
  ON public.royal_pass_sync_audit FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.user_roles ur
      WHERE ur.user_id = auth.uid()
        AND ur.role IN ('admin','super_admin','finance_admin','moderator')
    )
  );

-- No client insert policy; only service_role (edge function) writes.

-- Admin RPC to list recent sync audit rows
CREATE OR REPLACE FUNCTION public.admin_list_royal_pass_sync_audit(p_limit INT DEFAULT 50)
RETURNS SETOF public.royal_pass_sync_audit
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.user_roles ur
     WHERE ur.user_id = auth.uid()
       AND ur.role IN ('admin','super_admin','finance_admin','moderator')
  ) THEN
    RAISE EXCEPTION 'admin required';
  END IF;
  RETURN QUERY
    SELECT * FROM public.royal_pass_sync_audit
     ORDER BY created_at DESC
     LIMIT LEAST(GREATEST(p_limit,1), 200);
END;
$$;
REVOKE ALL ON FUNCTION public.admin_list_royal_pass_sync_audit(INT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_list_royal_pass_sync_audit(INT) TO authenticated;