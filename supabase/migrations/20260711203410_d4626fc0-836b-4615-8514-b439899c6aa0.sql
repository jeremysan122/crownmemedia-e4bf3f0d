
-- 1. Drop obsolete 5-argument overload; only the 6-arg version remains.
DROP FUNCTION IF EXISTS public.grant_royal_monthly_benefits(uuid, text, text, timestamptz, timestamptz);

-- 2. Foreign key hardening: RESTRICT deletion of financial/audit rows.
ALTER TABLE public.royal_pass_grants DROP CONSTRAINT IF EXISTS royal_pass_grants_user_id_fkey;
ALTER TABLE public.royal_pass_grants
  ADD CONSTRAINT royal_pass_grants_user_id_fkey
  FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE RESTRICT;

ALTER TABLE public.royal_pass_shield_allowances DROP CONSTRAINT IF EXISTS royal_pass_shield_allowances_user_id_fkey;
ALTER TABLE public.royal_pass_shield_allowances
  ADD CONSTRAINT royal_pass_shield_allowances_user_id_fkey
  FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE RESTRICT;

ALTER TABLE public.boost_tokens_ledger DROP CONSTRAINT IF EXISTS boost_tokens_ledger_user_id_fkey;
ALTER TABLE public.boost_tokens_ledger
  ADD CONSTRAINT boost_tokens_ledger_user_id_fkey
  FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE RESTRICT;

ALTER TABLE public.founder_grants DROP CONSTRAINT IF EXISTS founder_grants_user_id_fkey;
ALTER TABLE public.founder_grants
  ADD CONSTRAINT founder_grants_user_id_fkey
  FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE RESTRICT;

-- 3. Immutable Founder grant ledger — status + revocation fields.
ALTER TABLE public.founder_grants
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'active',
  ADD COLUMN IF NOT EXISTS revoked_at timestamptz,
  ADD COLUMN IF NOT EXISTS revoked_reason text,
  ADD COLUMN IF NOT EXISTS revoked_stripe_event_id text,
  ADD COLUMN IF NOT EXISTS qualifying_invoice_id text,
  ADD COLUMN IF NOT EXISTS original_granted_at timestamptz;

UPDATE public.founder_grants
   SET original_granted_at = granted_at
 WHERE original_granted_at IS NULL;

ALTER TABLE public.founder_grants
  ADD CONSTRAINT founder_grants_status_chk
  CHECK (status IN ('active','revoked'));

-- Replace plain unique(user_id) with a partial unique so revoked users can re-qualify.
ALTER TABLE public.founder_grants DROP CONSTRAINT IF EXISTS founder_grants_user_id_key;
DROP INDEX IF EXISTS public.founder_grants_user_unique;
CREATE UNIQUE INDEX IF NOT EXISTS ux_founder_grants_user_active
  ON public.founder_grants(user_id)
  WHERE status = 'active';

-- 4. Fix column names in the 6-arg grant RPC (founder_granted, wallets.shekel_balance).
CREATE OR REPLACE FUNCTION public.grant_royal_monthly_benefits(
  _user_id uuid,
  _stripe_event_id text,
  _stripe_invoice_id text,
  _period_start timestamptz,
  _period_end timestamptz,
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
  wallet_rows int;
BEGIN
  IF _user_id IS NULL THEN RETURN jsonb_build_object('error','missing_user'); END IF;
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

  -- Shields: 5/period, no rollover
  INSERT INTO public.royal_pass_shield_allowances (user_id, period_start, period_end, shields_granted)
  VALUES (_user_id, _period_start, _period_end, 5)
  ON CONFLICT (user_id, period_start) DO NOTHING;

  -- Shekels ledger + wallet
  INSERT INTO public.shekel_ledger (user_id, kind, shekels_delta, label, stripe_event_id, metadata)
  VALUES (_user_id, 'royal_pass_monthly', 500, 'Royal Pass monthly grant',
          _stripe_event_id, jsonb_build_object('period_start', _period_start));

  UPDATE public.wallets
     SET shekel_balance = shekel_balance + 500, updated_at = now()
   WHERE user_id = _user_id;
  GET DIAGNOSTICS wallet_rows = ROW_COUNT;
  IF wallet_rows = 0 THEN
    INSERT INTO public.wallets (user_id, shekel_balance) VALUES (_user_id, 500)
    ON CONFLICT (user_id) DO UPDATE
      SET shekel_balance = public.wallets.shekel_balance + 500, updated_at = now();
  END IF;

  -- Boost tokens
  INSERT INTO public.boost_tokens_ledger (user_id, delta, reason, metadata)
  VALUES (_user_id, 3, 'royal_pass_monthly',
          jsonb_build_object('period_start', _period_start, 'stripe_event_id', _stripe_event_id));
  UPDATE public.profiles
     SET boost_tokens_balance = COALESCE(boost_tokens_balance, 0) + 3
   WHERE id = _user_id;

  -- Atomic Founder allocation under config-row lock
  SELECT * INTO cfg FROM public.founder_program_config WHERE id = 1 FOR UPDATE;
  IF cfg IS NOT NULL AND cfg.active AND cfg.end_at > now() THEN
    SELECT count(*) INTO founder_used
      FROM public.founder_grants WHERE status = 'active';
    IF founder_used < cfg.member_cap
       AND NOT EXISTS (
         SELECT 1 FROM public.founder_grants
          WHERE user_id = _user_id AND status = 'active'
       ) THEN
      BEGIN
        INSERT INTO public.founder_grants
          (user_id, stripe_invoice_id, paid_amount_cents,
           qualifying_invoice_id, original_granted_at, status)
        VALUES (_user_id, _stripe_invoice_id, _paid_amount_cents,
                _stripe_invoice_id, now(), 'active');
        UPDATE public.profiles
           SET is_founder = true,
               founder_granted_at = now(),
               founder_title = COALESCE(founder_title, cfg.founder_title),
               royal_frame_variant = COALESCE(royal_frame_variant, cfg.founder_frame_variant)
         WHERE id = _user_id;
        founder_new := true;
      EXCEPTION WHEN unique_violation THEN
        founder_new := false;
      END;
    END IF;
  END IF;

  INSERT INTO public.royal_pass_grants
    (user_id, stripe_event_id, stripe_invoice_id, period_start, period_end,
     shekels_granted, boost_tokens_granted, shields_granted, founder_granted)
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

REVOKE ALL ON FUNCTION public.grant_royal_monthly_benefits(uuid, text, text, timestamptz, timestamptz, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.grant_royal_monthly_benefits(uuid, text, text, timestamptz, timestamptz, integer) TO service_role;

-- 5. Founder revocation — status flip, never DELETE. Records audit event.
CREATE OR REPLACE FUNCTION public.revoke_royal_founder(
  _user_id uuid,
  _reason text,
  _stripe_event_id text DEFAULT NULL,
  _actor_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  updated_count integer := 0;
  grant_row record;
BEGIN
  IF _user_id IS NULL THEN RETURN jsonb_build_object('error','missing_user'); END IF;

  SELECT * INTO grant_row
    FROM public.founder_grants
   WHERE user_id = _user_id AND status = 'active'
   LIMIT 1
   FOR UPDATE;

  IF grant_row.id IS NULL THEN
    RETURN jsonb_build_object('ok', true, 'no_active_grant', true);
  END IF;

  UPDATE public.founder_grants
     SET status = 'revoked',
         revoked_at = now(),
         revoked_reason = COALESCE(_reason, 'unspecified'),
         revoked_stripe_event_id = _stripe_event_id
   WHERE id = grant_row.id;
  GET DIAGNOSTICS updated_count = ROW_COUNT;

  -- Strip cosmetics; leave audit trail intact.
  UPDATE public.profiles
     SET is_founder = false,
         founder_title = NULL,
         royal_frame_variant = NULL
   WHERE id = _user_id;

  INSERT INTO public.admin_audit_log (actor_id, action, target_type, target_id, details)
  VALUES (
    COALESCE(_actor_id, _user_id),
    'royal_founder_revoked',
    'founder_grant',
    grant_row.id::text,
    jsonb_build_object(
      'user_id', _user_id,
      'reason', _reason,
      'stripe_event_id', _stripe_event_id,
      'original_granted_at', grant_row.original_granted_at,
      'qualifying_invoice_id', grant_row.qualifying_invoice_id
    )
  );

  RETURN jsonb_build_object('ok', true, 'revoked', updated_count, 'grant_id', grant_row.id);
END;
$function$;

REVOKE ALL ON FUNCTION public.revoke_royal_founder(uuid, text, text, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.revoke_royal_founder(uuid, text, text, uuid) TO service_role;

-- 6. Refund/chargeback handler — invoked from webhook.
CREATE OR REPLACE FUNCTION public.handle_royal_refund(
  _stripe_event_id text,
  _stripe_invoice_id text,
  _reason text DEFAULT 'refund'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  grant_row record;
  founder_row record;
  revoked_count integer := 0;
BEGIN
  IF _stripe_invoice_id IS NULL THEN
    RETURN jsonb_build_object('error','missing_invoice');
  END IF;

  SELECT * INTO grant_row
    FROM public.royal_pass_grants
   WHERE stripe_invoice_id = _stripe_invoice_id
   ORDER BY created_at DESC LIMIT 1;

  IF grant_row.id IS NULL THEN
    RETURN jsonb_build_object('ok', true, 'no_grant_found', true);
  END IF;

  SELECT * INTO founder_row
    FROM public.founder_grants
   WHERE qualifying_invoice_id = _stripe_invoice_id
     AND status = 'active'
   LIMIT 1;

  IF founder_row.id IS NOT NULL THEN
    PERFORM public.revoke_royal_founder(
      founder_row.user_id, _reason, _stripe_event_id, NULL
    );
    revoked_count := 1;
  END IF;

  INSERT INTO public.admin_audit_log (actor_id, action, target_type, target_id, details)
  VALUES (
    grant_row.user_id,
    'royal_refund_processed',
    'royal_pass_grant',
    grant_row.id::text,
    jsonb_build_object(
      'user_id', grant_row.user_id,
      'reason', _reason,
      'stripe_event_id', _stripe_event_id,
      'stripe_invoice_id', _stripe_invoice_id,
      'founder_revoked', revoked_count = 1
    )
  );

  RETURN jsonb_build_object(
    'ok', true,
    'founder_revoked', revoked_count = 1,
    'grant_id', grant_row.id
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.handle_royal_refund(text, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.handle_royal_refund(text, text, text) TO service_role;

-- 7. use_royal_shield: block any active crown_shield on the post, return existing expiry.
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
  existing_shield record;
  new_boost_id uuid;
BEGIN
  IF uid IS NULL THEN RETURN jsonb_build_object('error','unauthenticated'); END IF;
  active := public.is_royal_pass_active(uid);
  IF NOT active THEN RETURN jsonb_build_object('error','no_active_royal_pass'); END IF;

  SELECT p.user_id, COALESCE(p.is_removed, false)
    INTO post_owner, post_removed
    FROM public.posts p WHERE p.id = _post_id;
  IF post_owner IS NULL THEN RETURN jsonb_build_object('error','post_not_found'); END IF;
  IF post_removed THEN RETURN jsonb_build_object('error','post_removed'); END IF;
  IF post_owner <> uid THEN RETURN jsonb_build_object('error','not_post_owner'); END IF;

  SELECT id INTO crown_row_id FROM public.crowns
   WHERE post_id = _post_id AND user_id = uid AND active = true LIMIT 1;
  IF crown_row_id IS NULL THEN RETURN jsonb_build_object('error','no_active_crown'); END IF;

  -- Block any active shield from any source.
  SELECT id, expires_at, source INTO existing_shield
    FROM public.boosts
   WHERE post_id = _post_id
     AND boost_type = 'crown_shield'
     AND active = true
     AND (expires_at IS NULL OR expires_at > now())
   ORDER BY expires_at DESC NULLS LAST
   LIMIT 1;
  IF existing_shield.id IS NOT NULL THEN
    RETURN jsonb_build_object(
      'error','already_shielded',
      'expires_at', existing_shield.expires_at,
      'source', existing_shield.source
    );
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
END;
$function$;

REVOKE ALL ON FUNCTION public.use_royal_shield(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.use_royal_shield(uuid) TO authenticated, service_role;
