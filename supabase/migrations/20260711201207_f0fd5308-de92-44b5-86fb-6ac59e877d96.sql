-- ============================================================================
-- ROYAL PASS FOUNDATION: shields, monthly grants, boost tokens, founder program
-- ============================================================================

-- --------------------------------------------------------------------------
-- 1. Profile columns for cosmetics + founder status + boost token balance
-- --------------------------------------------------------------------------
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS boost_tokens_balance integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS is_founder boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS founder_granted_at timestamptz,
  ADD COLUMN IF NOT EXISTS founder_title text,
  ADD COLUMN IF NOT EXISTS royal_frame_variant text;

-- --------------------------------------------------------------------------
-- 2. royal_pass_grants — idempotent grant log
-- --------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.royal_pass_grants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  stripe_event_id text,
  stripe_invoice_id text,
  period_start timestamptz NOT NULL,
  period_end timestamptz NOT NULL,
  shields_granted integer NOT NULL DEFAULT 0,
  shekels_granted integer NOT NULL DEFAULT 0,
  boost_tokens_granted integer NOT NULL DEFAULT 0,
  founder_granted boolean NOT NULL DEFAULT false,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS ux_royal_pass_grants_user_period
  ON public.royal_pass_grants(user_id, period_start);
CREATE UNIQUE INDEX IF NOT EXISTS ux_royal_pass_grants_event
  ON public.royal_pass_grants(stripe_event_id) WHERE stripe_event_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_royal_pass_grants_user_created
  ON public.royal_pass_grants(user_id, created_at DESC);

GRANT SELECT ON public.royal_pass_grants TO authenticated;
GRANT ALL ON public.royal_pass_grants TO service_role;
ALTER TABLE public.royal_pass_grants ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users view own royal pass grants" ON public.royal_pass_grants
  FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Admins view all royal pass grants" ON public.royal_pass_grants
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "royal_pass_grants deny all client writes" ON public.royal_pass_grants
  AS RESTRICTIVE FOR ALL TO anon, authenticated USING (false) WITH CHECK (false);

-- --------------------------------------------------------------------------
-- 3. royal_pass_shield_allowances — per-user per-period shield ledger
-- --------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.royal_pass_shield_allowances (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  period_start timestamptz NOT NULL,
  period_end timestamptz NOT NULL,
  shields_granted integer NOT NULL DEFAULT 5,
  shields_used integer NOT NULL DEFAULT 0,
  granted_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT shields_used_nonneg CHECK (shields_used >= 0),
  CONSTRAINT shields_used_lte_granted CHECK (shields_used <= shields_granted)
);
CREATE UNIQUE INDEX IF NOT EXISTS ux_shield_allowances_user_period
  ON public.royal_pass_shield_allowances(user_id, period_start);
CREATE INDEX IF NOT EXISTS idx_shield_allowances_user_active
  ON public.royal_pass_shield_allowances(user_id, period_end DESC);

GRANT SELECT ON public.royal_pass_shield_allowances TO authenticated;
GRANT ALL ON public.royal_pass_shield_allowances TO service_role;
ALTER TABLE public.royal_pass_shield_allowances ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users view own shield allowance" ON public.royal_pass_shield_allowances
  FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Admins view all shield allowances" ON public.royal_pass_shield_allowances
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "shield_allowances deny all client writes" ON public.royal_pass_shield_allowances
  AS RESTRICTIVE FOR ALL TO anon, authenticated USING (false) WITH CHECK (false);

-- --------------------------------------------------------------------------
-- 4. boost_tokens_ledger — one row per credit/debit
-- --------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.boost_tokens_ledger (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  delta integer NOT NULL,
  reason text NOT NULL,
  reference_id uuid,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_boost_tokens_ledger_user_created
  ON public.boost_tokens_ledger(user_id, created_at DESC);

GRANT SELECT ON public.boost_tokens_ledger TO authenticated;
GRANT ALL ON public.boost_tokens_ledger TO service_role;
ALTER TABLE public.boost_tokens_ledger ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users view own boost tokens" ON public.boost_tokens_ledger
  FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "boost_tokens_ledger deny all client writes" ON public.boost_tokens_ledger
  AS RESTRICTIVE FOR ALL TO anon, authenticated USING (false) WITH CHECK (false);

-- --------------------------------------------------------------------------
-- 5. founder_program_config — single-row admin-editable config
-- --------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.founder_program_config (
  id integer PRIMARY KEY DEFAULT 1,
  active boolean NOT NULL DEFAULT true,
  end_at timestamptz NOT NULL,
  member_cap integer NOT NULL,
  founder_title text NOT NULL DEFAULT 'Founding Royal',
  founder_frame_variant text NOT NULL DEFAULT 'founder',
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid,
  CONSTRAINT founder_program_singleton CHECK (id = 1)
);

GRANT SELECT ON public.founder_program_config TO anon, authenticated;
GRANT ALL ON public.founder_program_config TO service_role;
ALTER TABLE public.founder_program_config ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Founder program public read" ON public.founder_program_config
  FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "founder_program_config deny client writes" ON public.founder_program_config
  AS RESTRICTIVE FOR ALL TO anon, authenticated USING (false) WITH CHECK (false);

-- Seed once
INSERT INTO public.founder_program_config (id, active, end_at, member_cap)
VALUES (1, true, '2026-10-01 04:59:00+00'::timestamptz, 1000)
ON CONFLICT (id) DO NOTHING;

-- --------------------------------------------------------------------------
-- 6. founder_grants — permanent Founder ledger
-- --------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.founder_grants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL UNIQUE REFERENCES public.profiles(id) ON DELETE CASCADE,
  granted_at timestamptz NOT NULL DEFAULT now(),
  stripe_invoice_id text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb
);
CREATE INDEX IF NOT EXISTS idx_founder_grants_granted_at
  ON public.founder_grants(granted_at DESC);

GRANT SELECT ON public.founder_grants TO anon, authenticated;
GRANT ALL ON public.founder_grants TO service_role;
ALTER TABLE public.founder_grants ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Founder grants public read" ON public.founder_grants
  FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "founder_grants deny client writes" ON public.founder_grants
  AS RESTRICTIVE FOR ALL TO anon, authenticated USING (false) WITH CHECK (false);

-- --------------------------------------------------------------------------
-- 7. Server-side RPCs
-- --------------------------------------------------------------------------

-- ---- Public founder status --------------------------------------------------
CREATE OR REPLACE FUNCTION public.founder_program_public_status()
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE cfg record; used int; remaining int; is_open boolean;
BEGIN
  SELECT * INTO cfg FROM public.founder_program_config WHERE id = 1;
  IF cfg IS NULL THEN
    RETURN jsonb_build_object('active', false, 'remaining', 0, 'cap', 0, 'end_at', null);
  END IF;
  SELECT count(*) INTO used FROM public.founder_grants;
  remaining := GREATEST(cfg.member_cap - used, 0);
  is_open := cfg.active AND cfg.end_at > now() AND remaining > 0;
  RETURN jsonb_build_object(
    'active', is_open,
    'remaining', remaining,
    'cap', cfg.member_cap,
    'granted', used,
    'end_at', cfg.end_at,
    'title', cfg.founder_title
  );
END; $$;
REVOKE ALL ON FUNCTION public.founder_program_public_status() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.founder_program_public_status() TO anon, authenticated;

-- ---- Royal entitlements (user-scoped read) ----------------------------------
CREATE OR REPLACE FUNCTION public.royal_entitlements()
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE uid uuid := auth.uid(); active bool; allow record; prof record;
BEGIN
  IF uid IS NULL THEN RETURN jsonb_build_object('error','unauthenticated'); END IF;
  active := public.is_royal_pass_active(uid);
  SELECT * INTO allow
  FROM public.royal_pass_shield_allowances
  WHERE user_id = uid AND period_end > now()
  ORDER BY period_end DESC LIMIT 1;
  SELECT boost_tokens_balance, is_founder, founder_title, royal_frame_variant
    INTO prof FROM public.profiles WHERE id = uid;
  RETURN jsonb_build_object(
    'royal_active', active,
    'shields_remaining', COALESCE(allow.shields_granted - allow.shields_used, 0),
    'shields_granted', COALESCE(allow.shields_granted, 0),
    'shields_used', COALESCE(allow.shields_used, 0),
    'period_end', allow.period_end,
    'boost_tokens', COALESCE(prof.boost_tokens_balance, 0),
    'is_founder', COALESCE(prof.is_founder, false),
    'founder_title', prof.founder_title,
    'royal_frame_variant', prof.royal_frame_variant
  );
END; $$;
REVOKE ALL ON FUNCTION public.royal_entitlements() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.royal_entitlements() TO authenticated;

-- ---- Use a Royal shield ----------------------------------------------------
CREATE OR REPLACE FUNCTION public.use_royal_shield(_post_id uuid)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  uid uuid := auth.uid();
  active bool;
  post_owner uuid;
  crown_row record;
  allow record;
  existing_shield record;
  new_boost_id uuid;
BEGIN
  IF uid IS NULL THEN RETURN jsonb_build_object('error','unauthenticated'); END IF;
  active := public.is_royal_pass_active(uid);
  IF NOT active THEN RETURN jsonb_build_object('error','no_active_royal_pass'); END IF;

  -- validate post ownership + not removed
  SELECT p.user_id INTO post_owner
    FROM public.posts p
    WHERE p.id = _post_id
      AND COALESCE(p.deleted_at, 'infinity'::timestamptz) > now()
      AND COALESCE(p.hidden_at, 'infinity'::timestamptz) > now();
  IF post_owner IS NULL THEN RETURN jsonb_build_object('error','post_not_found'); END IF;
  IF post_owner <> uid THEN RETURN jsonb_build_object('error','not_post_owner'); END IF;

  -- must hold an active crown
  SELECT id INTO crown_row FROM public.crowns
   WHERE post_id = _post_id AND user_id = uid AND active = true LIMIT 1;
  IF crown_row IS NULL THEN RETURN jsonb_build_object('error','no_active_crown'); END IF;

  -- one active royal shield per post
  SELECT id INTO existing_shield FROM public.boosts
   WHERE post_id = _post_id AND boost_type = 'crown_shield' AND active = true
     AND source = 'royal_pass' AND expires_at > now() LIMIT 1;
  IF existing_shield IS NOT NULL THEN
    RETURN jsonb_build_object('error','already_shielded');
  END IF;

  -- lock current allowance row
  SELECT * INTO allow
  FROM public.royal_pass_shield_allowances
  WHERE user_id = uid AND period_end > now()
  ORDER BY period_end DESC LIMIT 1
  FOR UPDATE;
  IF allow IS NULL THEN RETURN jsonb_build_object('error','no_allowance'); END IF;
  IF allow.shields_used >= allow.shields_granted THEN
    RETURN jsonb_build_object('error','no_shields_remaining');
  END IF;

  UPDATE public.royal_pass_shield_allowances
    SET shields_used = shields_used + 1, updated_at = now()
    WHERE id = allow.id;

  INSERT INTO public.boosts (user_id, post_id, boost_type, active, started_at, expires_at, source)
  VALUES (uid, _post_id, 'crown_shield', true, now(), now() + interval '24 hours', 'royal_pass')
  RETURNING id INTO new_boost_id;

  RETURN jsonb_build_object(
    'ok', true,
    'boost_id', new_boost_id,
    'expires_at', now() + interval '24 hours',
    'shields_remaining', allow.shields_granted - (allow.shields_used + 1)
  );
END; $$;
REVOKE ALL ON FUNCTION public.use_royal_shield(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.use_royal_shield(uuid) TO authenticated;

-- ---- Grant monthly Royal benefits (called by webhook) ----------------------
CREATE OR REPLACE FUNCTION public.grant_royal_monthly_benefits(
  _user_id uuid,
  _stripe_event_id text,
  _stripe_invoice_id text,
  _period_start timestamptz,
  _period_end timestamptz
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  existing record;
  cfg record;
  founder_used int;
  do_founder bool := false;
  founder_new bool := false;
BEGIN
  -- idempotency: by (user, period_start) OR by event id
  SELECT * INTO existing FROM public.royal_pass_grants
    WHERE (user_id = _user_id AND period_start = _period_start)
       OR (_stripe_event_id IS NOT NULL AND stripe_event_id = _stripe_event_id)
    LIMIT 1;
  IF existing IS NOT NULL THEN
    RETURN jsonb_build_object('ok', true, 'already_granted', true, 'grant_id', existing.id);
  END IF;

  -- Shields: 5 per period, no rollover
  INSERT INTO public.royal_pass_shield_allowances (user_id, period_start, period_end, shields_granted)
  VALUES (_user_id, _period_start, _period_end, 5)
  ON CONFLICT (user_id, period_start) DO NOTHING;

  -- Shekels: +500
  INSERT INTO public.shekel_ledger (user_id, kind, shekels_delta, label, stripe_event_id, metadata)
  VALUES (_user_id, 'royal_pass_monthly', 500, 'Royal Pass monthly grant',
          _stripe_event_id, jsonb_build_object('period_start', _period_start));

  UPDATE public.wallets SET shekels = shekels + 500, updated_at = now() WHERE user_id = _user_id;

  -- Boost tokens: +3
  INSERT INTO public.boost_tokens_ledger (user_id, delta, reason, metadata)
  VALUES (_user_id, 3, 'royal_pass_monthly',
          jsonb_build_object('period_start', _period_start, 'stripe_event_id', _stripe_event_id));
  UPDATE public.profiles SET boost_tokens_balance = boost_tokens_balance + 3 WHERE id = _user_id;

  -- Founder eligibility
  SELECT * INTO cfg FROM public.founder_program_config WHERE id = 1;
  IF cfg IS NOT NULL AND cfg.active AND cfg.end_at > now() THEN
    SELECT count(*) INTO founder_used FROM public.founder_grants;
    IF founder_used < cfg.member_cap
       AND NOT EXISTS (SELECT 1 FROM public.founder_grants WHERE user_id = _user_id) THEN
      INSERT INTO public.founder_grants (user_id, stripe_invoice_id)
      VALUES (_user_id, _stripe_invoice_id)
      ON CONFLICT (user_id) DO NOTHING;
      UPDATE public.profiles
        SET is_founder = true,
            founder_granted_at = COALESCE(founder_granted_at, now()),
            founder_title = cfg.founder_title,
            royal_frame_variant = COALESCE(royal_frame_variant, cfg.founder_frame_variant)
        WHERE id = _user_id;
      do_founder := true;
      founder_new := true;
    END IF;
  END IF;

  INSERT INTO public.royal_pass_grants
    (user_id, stripe_event_id, stripe_invoice_id, period_start, period_end,
     shields_granted, shekels_granted, boost_tokens_granted, founder_granted)
  VALUES (_user_id, _stripe_event_id, _stripe_invoice_id, _period_start, _period_end,
          5, 500, 3, do_founder);

  RETURN jsonb_build_object(
    'ok', true,
    'shields_granted', 5,
    'shekels_granted', 500,
    'boost_tokens_granted', 3,
    'founder_granted', founder_new
  );
END; $$;
REVOKE ALL ON FUNCTION public.grant_royal_monthly_benefits(uuid,text,text,timestamptz,timestamptz) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.grant_royal_monthly_benefits(uuid,text,text,timestamptz,timestamptz) TO service_role;

-- ---- Admin: update founder program config, log to audit -------------------
CREATE OR REPLACE FUNCTION public.admin_set_founder_program(
  _end_at timestamptz,
  _member_cap integer,
  _active boolean
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE uid uuid := auth.uid(); prev record; new_row record;
BEGIN
  IF uid IS NULL OR NOT public.has_role(uid, 'admin'::app_role) THEN
    RETURN jsonb_build_object('error','forbidden');
  END IF;
  IF _member_cap < 0 THEN RETURN jsonb_build_object('error','invalid_cap'); END IF;

  SELECT * INTO prev FROM public.founder_program_config WHERE id = 1;
  UPDATE public.founder_program_config
    SET end_at = _end_at, member_cap = _member_cap, active = _active,
        updated_at = now(), updated_by = uid
    WHERE id = 1
  RETURNING * INTO new_row;

  INSERT INTO public.admin_audit_log (actor_id, action, target_type, target_id, metadata)
  VALUES (uid, 'founder_program_update', 'founder_program_config', '1',
          jsonb_build_object(
            'previous', to_jsonb(prev),
            'new', to_jsonb(new_row)
          ));

  RETURN jsonb_build_object('ok', true, 'config', to_jsonb(new_row));
END; $$;
REVOKE ALL ON FUNCTION public.admin_set_founder_program(timestamptz,integer,boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_set_founder_program(timestamptz,integer,boolean) TO authenticated;
