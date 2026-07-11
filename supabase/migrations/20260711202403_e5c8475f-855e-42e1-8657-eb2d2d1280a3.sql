
-- ============================================================
-- WAVE 8.1 — Royal security hardening
-- ============================================================

-- ------------------------------------------------------------
-- 1) RLS: replace RESTRICTIVE FOR ALL false (which blocks SELECT)
--    with RESTRICTIVE deny policies for INSERT/UPDATE/DELETE only.
--    Also revoke write privileges as belt-and-braces.
-- ------------------------------------------------------------

-- royal_pass_grants
DROP POLICY IF EXISTS "royal_pass_grants deny all client writes" ON public.royal_pass_grants;
REVOKE INSERT, UPDATE, DELETE ON public.royal_pass_grants FROM anon, authenticated;
CREATE POLICY "royal_pass_grants no client insert" ON public.royal_pass_grants
  AS RESTRICTIVE FOR INSERT TO anon, authenticated WITH CHECK (false);
CREATE POLICY "royal_pass_grants no client update" ON public.royal_pass_grants
  AS RESTRICTIVE FOR UPDATE TO anon, authenticated USING (false) WITH CHECK (false);
CREATE POLICY "royal_pass_grants no client delete" ON public.royal_pass_grants
  AS RESTRICTIVE FOR DELETE TO anon, authenticated USING (false);

-- royal_pass_shield_allowances
DROP POLICY IF EXISTS "shield_allowances deny all client writes" ON public.royal_pass_shield_allowances;
REVOKE INSERT, UPDATE, DELETE ON public.royal_pass_shield_allowances FROM anon, authenticated;
CREATE POLICY "shield_allowances no client insert" ON public.royal_pass_shield_allowances
  AS RESTRICTIVE FOR INSERT TO anon, authenticated WITH CHECK (false);
CREATE POLICY "shield_allowances no client update" ON public.royal_pass_shield_allowances
  AS RESTRICTIVE FOR UPDATE TO anon, authenticated USING (false) WITH CHECK (false);
CREATE POLICY "shield_allowances no client delete" ON public.royal_pass_shield_allowances
  AS RESTRICTIVE FOR DELETE TO anon, authenticated USING (false);

-- boost_tokens_ledger
DROP POLICY IF EXISTS "boost_tokens_ledger deny all client writes" ON public.boost_tokens_ledger;
REVOKE INSERT, UPDATE, DELETE ON public.boost_tokens_ledger FROM anon, authenticated;
CREATE POLICY "boost_tokens_ledger no client insert" ON public.boost_tokens_ledger
  AS RESTRICTIVE FOR INSERT TO anon, authenticated WITH CHECK (false);
CREATE POLICY "boost_tokens_ledger no client update" ON public.boost_tokens_ledger
  AS RESTRICTIVE FOR UPDATE TO anon, authenticated USING (false) WITH CHECK (false);
CREATE POLICY "boost_tokens_ledger no client delete" ON public.boost_tokens_ledger
  AS RESTRICTIVE FOR DELETE TO anon, authenticated USING (false);

-- founder_program_config (public read of aggregate config is fine)
DROP POLICY IF EXISTS "founder_program_config deny client writes" ON public.founder_program_config;
REVOKE INSERT, UPDATE, DELETE ON public.founder_program_config FROM anon, authenticated;
CREATE POLICY "founder_program_config no client insert" ON public.founder_program_config
  AS RESTRICTIVE FOR INSERT TO anon, authenticated WITH CHECK (false);
CREATE POLICY "founder_program_config no client update" ON public.founder_program_config
  AS RESTRICTIVE FOR UPDATE TO anon, authenticated USING (false) WITH CHECK (false);
CREATE POLICY "founder_program_config no client delete" ON public.founder_program_config
  AS RESTRICTIVE FOR DELETE TO anon, authenticated USING (false);

-- founder_grants: LOCK DOWN. No public enumeration.
DROP POLICY IF EXISTS "Founder grants public read" ON public.founder_grants;
DROP POLICY IF EXISTS "founder_grants deny client writes" ON public.founder_grants;
REVOKE SELECT, INSERT, UPDATE, DELETE ON public.founder_grants FROM anon, authenticated;
GRANT SELECT ON public.founder_grants TO authenticated;  -- gated by policies below
CREATE POLICY "Users view own founder grant" ON public.founder_grants
  FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Admins view all founder grants" ON public.founder_grants
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "founder_grants no client insert" ON public.founder_grants
  AS RESTRICTIVE FOR INSERT TO anon, authenticated WITH CHECK (false);
CREATE POLICY "founder_grants no client update" ON public.founder_grants
  AS RESTRICTIVE FOR UPDATE TO anon, authenticated USING (false) WITH CHECK (false);
CREATE POLICY "founder_grants no client delete" ON public.founder_grants
  AS RESTRICTIVE FOR DELETE TO anon, authenticated USING (false);

-- Unique-per-user hard guarantee for founder membership
CREATE UNIQUE INDEX IF NOT EXISTS founder_grants_user_unique ON public.founder_grants(user_id);

-- ------------------------------------------------------------
-- 2) Extend profile-protection trigger
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.profiles_guard_protected_fields()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  is_privileged boolean;
BEGIN
  is_privileged := (
    current_setting('request.jwt.claim.role', true) = 'service_role'
    OR public.has_role(auth.uid(), 'admin'::app_role)
    OR public.has_role(auth.uid(), 'moderator'::app_role)
  );

  IF is_privileged THEN RETURN NEW; END IF;

  -- Existing protected fields
  NEW.is_suspended        := OLD.is_suspended;
  NEW.crowns_held         := OLD.crowns_held;
  NEW.crowns_total        := OLD.crowns_total;
  NEW.battle_wins         := OLD.battle_wins;
  NEW.followers_count     := OLD.followers_count;
  NEW.following_count     := OLD.following_count;
  NEW.votes_received      := OLD.votes_received;
  NEW.votes_given         := OLD.votes_given;
  NEW.is_banned           := OLD.is_banned;
  NEW.banned_at           := OLD.banned_at;
  NEW.banned_by           := OLD.banned_by;
  NEW.banned_reason       := OLD.banned_reason;
  NEW.deactivated_at      := OLD.deactivated_at;
  NEW.deletion_requested_at := OLD.deletion_requested_at;
  NEW.verified            := OLD.verified;
  NEW.verified_at         := OLD.verified_at;
  NEW.verification_plan   := OLD.verification_plan;

  -- NEW: Royal Pass protected fields (Wave 8.1)
  NEW.boost_tokens_balance := OLD.boost_tokens_balance;
  NEW.is_founder           := OLD.is_founder;
  NEW.founder_granted_at   := OLD.founder_granted_at;
  NEW.founder_title        := OLD.founder_title;
  NEW.royal_frame_variant  := OLD.royal_frame_variant;

  RETURN NEW;
END;
$function$;

-- ------------------------------------------------------------
-- 3) Atomic Founder cap + require paid invoice amount > 0
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.grant_royal_monthly_benefits(
  _user_id uuid,
  _stripe_event_id text,
  _stripe_invoice_id text,
  _period_start timestamptz,
  _period_end   timestamptz,
  _paid_amount_cents integer DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  existing record;
  cfg record;
  founder_used int;
  founder_new bool := false;
  grant_id_out uuid;
BEGIN
  IF _user_id IS NULL THEN
    RETURN jsonb_build_object('error','missing_user');
  END IF;
  IF _period_start IS NULL OR _period_end IS NULL OR _period_end <= _period_start THEN
    RETURN jsonb_build_object('error','invalid_period');
  END IF;
  IF _paid_amount_cents IS NULL OR _paid_amount_cents <= 0 THEN
    RETURN jsonb_build_object('error','invalid_paid_amount');
  END IF;

  -- Idempotency
  SELECT * INTO existing FROM public.royal_pass_grants
    WHERE (user_id = _user_id AND period_start = _period_start)
       OR (_stripe_event_id IS NOT NULL AND stripe_event_id = _stripe_event_id)
    LIMIT 1;
  IF existing IS NOT NULL THEN
    RETURN jsonb_build_object('ok', true, 'already_granted', true, 'grant_id', existing.id);
  END IF;

  -- Shields
  INSERT INTO public.royal_pass_shield_allowances (user_id, period_start, period_end, shields_granted)
  VALUES (_user_id, _period_start, _period_end, 5)
  ON CONFLICT (user_id, period_start) DO NOTHING;

  -- Shekels
  INSERT INTO public.shekel_ledger (user_id, kind, shekels_delta, label, stripe_event_id, metadata)
  VALUES (_user_id, 'royal_pass_monthly', 500, 'Royal Pass monthly grant',
          _stripe_event_id, jsonb_build_object('period_start', _period_start));
  UPDATE public.wallets SET shekels = shekels + 500, updated_at = now() WHERE user_id = _user_id;
  IF NOT FOUND THEN
    INSERT INTO public.wallets (user_id, shekels) VALUES (_user_id, 500)
    ON CONFLICT (user_id) DO UPDATE SET shekels = public.wallets.shekels + 500, updated_at = now();
  END IF;

  -- Boost tokens
  INSERT INTO public.boost_tokens_ledger (user_id, delta, reason, metadata)
  VALUES (_user_id, 3, 'royal_pass_monthly',
          jsonb_build_object('period_start', _period_start, 'stripe_event_id', _stripe_event_id));
  UPDATE public.profiles
     SET boost_tokens_balance = COALESCE(boost_tokens_balance, 0) + 3
   WHERE id = _user_id;

  -- ATOMIC Founder allocation: lock config row, then count under the same lock.
  SELECT * INTO cfg FROM public.founder_program_config WHERE id = 1 FOR UPDATE;
  IF cfg IS NOT NULL AND cfg.active AND cfg.end_at > now() THEN
    SELECT count(*) INTO founder_used FROM public.founder_grants;
    IF founder_used < cfg.member_cap
       AND NOT EXISTS (SELECT 1 FROM public.founder_grants WHERE user_id = _user_id) THEN
      BEGIN
        INSERT INTO public.founder_grants (user_id, stripe_invoice_id, paid_amount_cents)
        VALUES (_user_id, _stripe_invoice_id, _paid_amount_cents);
        UPDATE public.profiles
           SET is_founder = true,
               founder_granted_at = now(),
               founder_title = COALESCE(founder_title, 'Royal Founder'),
               royal_frame_variant = COALESCE(royal_frame_variant, 'founder_v1')
         WHERE id = _user_id;
        founder_new := true;
      EXCEPTION WHEN unique_violation THEN
        -- Race: another concurrent tx took the slot; skip silently.
        founder_new := false;
      END;
    END IF;
  END IF;

  INSERT INTO public.royal_pass_grants
    (user_id, stripe_event_id, stripe_invoice_id, period_start, period_end,
     shekels_granted, boost_tokens_granted, shields_granted, granted_founder)
  VALUES (_user_id, _stripe_event_id, _stripe_invoice_id, _period_start, _period_end,
          500, 3, 5, founder_new)
  RETURNING id INTO grant_id_out;

  RETURN jsonb_build_object(
    'ok', true,
    'grant_id', grant_id_out,
    'founder_new', founder_new
  );
END;
$function$;

-- Only service_role should call this
REVOKE ALL ON FUNCTION public.grant_royal_monthly_benefits(uuid, text, text, timestamptz, timestamptz, integer) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.grant_royal_monthly_benefits(uuid, text, text, timestamptz, timestamptz, integer) TO service_role;

-- Ensure paid_amount_cents column exists on founder_grants
ALTER TABLE public.founder_grants
  ADD COLUMN IF NOT EXISTS paid_amount_cents integer;

-- ------------------------------------------------------------
-- 4) Revoke Founder helper (for refunds/chargebacks)
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.revoke_founder_for_refund(
  _user_id uuid,
  _stripe_invoice_id text,
  _reason text
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  had_grant bool;
BEGIN
  IF _user_id IS NULL THEN RETURN jsonb_build_object('error','missing_user'); END IF;

  DELETE FROM public.founder_grants
    WHERE user_id = _user_id
      AND (_stripe_invoice_id IS NULL OR stripe_invoice_id = _stripe_invoice_id);
  GET DIAGNOSTICS had_grant = ROW_COUNT;

  IF had_grant THEN
    UPDATE public.profiles
       SET is_founder = false,
           founder_granted_at = NULL,
           founder_title = NULL,
           royal_frame_variant = NULL
     WHERE id = _user_id;

    INSERT INTO public.admin_audit_log (actor_id, action, target_type, target_id, metadata)
    VALUES (NULL, 'founder_revoked', 'user', _user_id::text,
            jsonb_build_object('reason', _reason, 'invoice', _stripe_invoice_id));
  END IF;

  RETURN jsonb_build_object('ok', true, 'revoked', had_grant);
END; $$;

REVOKE ALL ON FUNCTION public.revoke_founder_for_refund(uuid, text, text) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.revoke_founder_for_refund(uuid, text, text) TO service_role;

-- ------------------------------------------------------------
-- 5) Repair use_royal_shield: posts uses `is_removed`, not deleted_at/hidden_at
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.use_royal_shield(_post_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  uid uuid := auth.uid();
  active bool;
  post_owner uuid;
  post_removed bool;
  crown_row_id uuid;
  allow record;
  existing_shield_id uuid;
  new_boost_id uuid;
BEGIN
  IF uid IS NULL THEN RETURN jsonb_build_object('error','unauthenticated'); END IF;
  active := public.is_royal_pass_active(uid);
  IF NOT active THEN RETURN jsonb_build_object('error','no_active_royal_pass'); END IF;

  SELECT p.user_id, COALESCE(p.is_removed, false)
    INTO post_owner, post_removed
    FROM public.posts p
    WHERE p.id = _post_id;
  IF post_owner IS NULL THEN RETURN jsonb_build_object('error','post_not_found'); END IF;
  IF post_removed THEN RETURN jsonb_build_object('error','post_removed'); END IF;
  IF post_owner <> uid THEN RETURN jsonb_build_object('error','not_post_owner'); END IF;

  SELECT id INTO crown_row_id FROM public.crowns
   WHERE post_id = _post_id AND user_id = uid AND active = true LIMIT 1;
  IF crown_row_id IS NULL THEN RETURN jsonb_build_object('error','no_active_crown'); END IF;

  SELECT id INTO existing_shield_id FROM public.boosts
   WHERE post_id = _post_id AND boost_type = 'crown_shield' AND active = true
     AND source = 'royal_pass' AND expires_at > now() LIMIT 1;
  IF existing_shield_id IS NOT NULL THEN
    RETURN jsonb_build_object('error','already_shielded');
  END IF;

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
END; $function$;

-- ------------------------------------------------------------
-- 6) Retention policy comments
-- ------------------------------------------------------------
COMMENT ON TABLE public.royal_pass_grants IS
  'Financial audit ledger. Intentionally has no FK to profiles: rows must survive profile deletion. user_id is retained as an immutable reference for reconciliation.';
COMMENT ON TABLE public.royal_pass_shield_allowances IS
  'Entitlement ledger. Retained beyond profile deletion for audit; no FK cascade.';
COMMENT ON TABLE public.boost_tokens_ledger IS
  'Immutable token movement ledger. Retained beyond profile deletion; no FK cascade.';
COMMENT ON TABLE public.founder_grants IS
  'Founder membership ledger. Retained beyond profile deletion for program integrity; no FK cascade. Admin-only read; users can see their own row.';
