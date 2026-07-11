-- Wave 8.2 hardening

-- 1. admin_audit_log actor_id nullable for system events
ALTER TABLE public.admin_audit_log ALTER COLUMN actor_id DROP NOT NULL;

-- 2. royal_pass_grants lifecycle + Stripe reference IDs
ALTER TABLE public.royal_pass_grants
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'granted',
  ADD COLUMN IF NOT EXISTS reversed_at timestamptz,
  ADD COLUMN IF NOT EXISTS reversed_reason text,
  ADD COLUMN IF NOT EXISTS reversal_stripe_event_id text,
  ADD COLUMN IF NOT EXISTS stripe_payment_intent_id text,
  ADD COLUMN IF NOT EXISTS stripe_charge_id text,
  ADD COLUMN IF NOT EXISTS stripe_subscription_id text;

ALTER TABLE public.royal_pass_grants DROP CONSTRAINT IF EXISTS royal_pass_grants_status_chk;
ALTER TABLE public.royal_pass_grants
  ADD CONSTRAINT royal_pass_grants_status_chk
  CHECK (status IN ('granted','refunded','disputed','reversed'));

CREATE INDEX IF NOT EXISTS idx_royal_pass_grants_pi
  ON public.royal_pass_grants(stripe_payment_intent_id) WHERE stripe_payment_intent_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_royal_pass_grants_charge
  ON public.royal_pass_grants(stripe_charge_id) WHERE stripe_charge_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_royal_pass_grants_invoice_v2
  ON public.royal_pass_grants(stripe_invoice_id) WHERE stripe_invoice_id IS NOT NULL;

-- 3. grant_royal_monthly_benefits: extend with PI/charge/subscription
DROP FUNCTION IF EXISTS public.grant_royal_monthly_benefits(uuid, text, text, timestamptz, timestamptz, integer);
DROP FUNCTION IF EXISTS public.grant_royal_monthly_benefits(uuid, text, text, timestamptz, timestamptz, integer, text, text, text);

CREATE FUNCTION public.grant_royal_monthly_benefits(
  _user_id uuid,
  _stripe_event_id text,
  _stripe_invoice_id text,
  _period_start timestamptz,
  _period_end timestamptz,
  _paid_amount_cents integer,
  _stripe_payment_intent_id text DEFAULT NULL,
  _stripe_charge_id text DEFAULT NULL,
  _stripe_subscription_id text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  cfg record; founder_used int; new_founder boolean := false; existing record;
BEGIN
  IF _user_id IS NULL OR _paid_amount_cents IS NULL OR _paid_amount_cents <= 0 THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'invalid_input');
  END IF;

  IF _stripe_event_id IS NOT NULL THEN
    SELECT * INTO existing FROM public.royal_pass_grants
     WHERE stripe_event_id = _stripe_event_id LIMIT 1;
    IF existing.id IS NOT NULL THEN
      RETURN jsonb_build_object('ok', true, 'already_processed', true, 'grant_id', existing.id);
    END IF;
  END IF;

  SELECT * INTO existing FROM public.royal_pass_grants
   WHERE user_id = _user_id AND period_start = _period_start LIMIT 1;
  IF existing.id IS NOT NULL THEN
    RETURN jsonb_build_object('ok', true, 'already_processed', true, 'grant_id', existing.id);
  END IF;

  SELECT * INTO cfg FROM public.founder_program_config WHERE id = 1 FOR UPDATE;
  IF cfg.active AND cfg.end_at > now() THEN
    SELECT count(*) INTO founder_used FROM public.founder_grants WHERE status = 'active';
    IF founder_used < cfg.member_cap
       AND NOT EXISTS (SELECT 1 FROM public.founder_grants WHERE user_id = _user_id AND status = 'active')
    THEN
      INSERT INTO public.founder_grants
        (user_id, stripe_invoice_id, paid_amount_cents, qualifying_invoice_id, status)
      VALUES (_user_id, _stripe_invoice_id, _paid_amount_cents, _stripe_invoice_id, 'active')
      ON CONFLICT DO NOTHING;
      new_founder := FOUND;
      IF new_founder THEN
        UPDATE public.profiles
           SET is_founder = true, founder_granted_at = now(),
               founder_title = cfg.founder_title,
               royal_frame_variant = cfg.founder_frame_variant
         WHERE id = _user_id;
      END IF;
    END IF;
  END IF;

  INSERT INTO public.royal_pass_shield_allowances
    (user_id, period_start, period_end, shields_granted, shields_used)
  VALUES (_user_id, _period_start, _period_end, 5, 0)
  ON CONFLICT (user_id, period_start) DO NOTHING;

  INSERT INTO public.shekel_ledger (user_id, kind, shekels_delta, label, stripe_event_id, metadata)
  VALUES (_user_id, 'royal_monthly', 500, 'Royal Pass monthly Shekels', _stripe_event_id,
          jsonb_build_object('invoice_id', _stripe_invoice_id, 'source', 'royal_pass'));
  UPDATE public.wallets SET shekel_balance = shekel_balance + 500 WHERE user_id = _user_id;

  INSERT INTO public.boost_tokens_ledger (user_id, delta, reason, metadata)
  VALUES (_user_id, 3, 'royal_monthly',
          jsonb_build_object('invoice_id', _stripe_invoice_id, 'event_id', _stripe_event_id));
  UPDATE public.profiles SET boost_tokens_balance = COALESCE(boost_tokens_balance,0) + 3 WHERE id = _user_id;

  INSERT INTO public.royal_pass_grants
    (user_id, stripe_event_id, stripe_invoice_id, period_start, period_end,
     shields_granted, shekels_granted, boost_tokens_granted, founder_granted,
     stripe_payment_intent_id, stripe_charge_id, stripe_subscription_id, status)
  VALUES (_user_id, _stripe_event_id, _stripe_invoice_id, _period_start, _period_end,
          5, 500, 3, new_founder,
          _stripe_payment_intent_id, _stripe_charge_id, _stripe_subscription_id, 'granted');

  RETURN jsonb_build_object('ok', true, 'new_founder', new_founder);
END; $$;

REVOKE ALL ON FUNCTION public.grant_royal_monthly_benefits(uuid, text, text, timestamptz, timestamptz, integer, text, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.grant_royal_monthly_benefits(uuid, text, text, timestamptz, timestamptz, integer, text, text, text) TO service_role;

-- 4. founder_program_public_status: only active grants
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
  SELECT count(*) INTO used FROM public.founder_grants WHERE status = 'active';
  remaining := GREATEST(cfg.member_cap - used, 0);
  is_open := cfg.active AND cfg.end_at > now() AND remaining > 0;
  RETURN jsonb_build_object(
    'active', is_open, 'remaining', remaining, 'cap', cfg.member_cap,
    'granted', used, 'end_at', cfg.end_at, 'title', cfg.founder_title
  );
END; $$;
REVOKE ALL ON FUNCTION public.founder_program_public_status() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.founder_program_public_status() TO anon, authenticated;

-- 5. revoke_royal_founder: same signature, restore frame if still Royal
DROP FUNCTION IF EXISTS public.revoke_royal_founder(uuid, text, text, uuid);
CREATE FUNCTION public.revoke_royal_founder(
  _user_id uuid, _reason text, _stripe_event_id text, _actor_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE grant_row record; updated_count integer := 0; still_royal boolean := false;
BEGIN
  SELECT * INTO grant_row FROM public.founder_grants
   WHERE user_id = _user_id AND status = 'active' LIMIT 1;
  IF grant_row.id IS NULL THEN
    RETURN jsonb_build_object('ok', true, 'no_active_grant', true);
  END IF;

  UPDATE public.founder_grants
     SET status = 'revoked', revoked_at = now(), revoked_reason = _reason,
         metadata = metadata || jsonb_build_object('revocation_event', _stripe_event_id)
   WHERE id = grant_row.id;
  GET DIAGNOSTICS updated_count = ROW_COUNT;

  SELECT EXISTS (
    SELECT 1 FROM public.royal_pass_subscriptions
     WHERE user_id = _user_id AND status IN ('active','trialing')
       AND (current_period_end IS NULL OR current_period_end > now())
  ) INTO still_royal;

  UPDATE public.profiles
     SET is_founder = false, founder_granted_at = NULL, founder_title = NULL,
         royal_frame_variant = CASE WHEN still_royal THEN 'royal' ELSE NULL END
   WHERE id = _user_id;

  INSERT INTO public.admin_audit_log (actor_id, action, target_type, target_id, details)
  VALUES (
    _actor_id, 'royal_founder_revoked', 'founder_grant', grant_row.id::text,
    jsonb_build_object(
      'actor_type', CASE WHEN _actor_id IS NULL THEN 'stripe_webhook' ELSE 'admin' END,
      'user_id', _user_id, 'reason', _reason,
      'stripe_event_id', _stripe_event_id, 'still_royal_subscriber', still_royal
    )
  );

  RETURN jsonb_build_object('ok', true, 'revoked', updated_count, 'still_royal', still_royal);
END; $$;
REVOKE ALL ON FUNCTION public.revoke_royal_founder(uuid, text, text, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.revoke_royal_founder(uuid, text, text, uuid) TO service_role;

-- 6. handle_royal_refund: full reversal (shields/tokens/shekels) via any Stripe id
DROP FUNCTION IF EXISTS public.handle_royal_refund(text, text, text);
CREATE FUNCTION public.handle_royal_refund(
  _stripe_event_id text,
  _reason text,
  _stripe_invoice_id text DEFAULT NULL,
  _stripe_payment_intent_id text DEFAULT NULL,
  _stripe_charge_id text DEFAULT NULL,
  _new_status text DEFAULT 'reversed'
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  grant_row record; allowance_row record;
  remaining_shields int := 0; tokens_to_debit int := 0;
  current_tokens int := 0; current_shekels int := 0;
  shekels_to_debit int := 0; unrecovered_shekels int := 0;
  founder_revoked boolean := false;
BEGIN
  IF _new_status NOT IN ('reversed','disputed','refunded') THEN
    RETURN jsonb_build_object('error','invalid_status');
  END IF;

  SELECT * INTO grant_row FROM public.royal_pass_grants
   WHERE (_stripe_invoice_id        IS NOT NULL AND stripe_invoice_id        = _stripe_invoice_id)
      OR (_stripe_payment_intent_id IS NOT NULL AND stripe_payment_intent_id = _stripe_payment_intent_id)
      OR (_stripe_charge_id         IS NOT NULL AND stripe_charge_id         = _stripe_charge_id)
   ORDER BY created_at DESC LIMIT 1;

  IF grant_row.id IS NULL THEN
    RETURN jsonb_build_object('ok', true, 'no_grant_found', true);
  END IF;

  IF grant_row.status = 'reversed' THEN
    RETURN jsonb_build_object('ok', true, 'already_reversed', true, 'grant_id', grant_row.id);
  END IF;

  IF _new_status = 'reversed' THEN
    SELECT * INTO allowance_row FROM public.royal_pass_shield_allowances
     WHERE user_id = grant_row.user_id AND period_start = grant_row.period_start
     FOR UPDATE;
    IF allowance_row.id IS NOT NULL THEN
      remaining_shields := GREATEST(allowance_row.shields_granted - allowance_row.shields_used, 0);
      UPDATE public.royal_pass_shield_allowances
         SET shields_used = shields_granted, updated_at = now()
       WHERE id = allowance_row.id;
    END IF;

    SELECT COALESCE(boost_tokens_balance,0) INTO current_tokens FROM public.profiles WHERE id = grant_row.user_id;
    tokens_to_debit := LEAST(grant_row.boost_tokens_granted, current_tokens);
    IF tokens_to_debit > 0 THEN
      UPDATE public.profiles SET boost_tokens_balance = boost_tokens_balance - tokens_to_debit
       WHERE id = grant_row.user_id;
      INSERT INTO public.boost_tokens_ledger (user_id, delta, reason, metadata)
      VALUES (grant_row.user_id, -tokens_to_debit, 'royal_reversal',
              jsonb_build_object('grant_id', grant_row.id, 'stripe_event_id', _stripe_event_id,
                                 'reason', _reason, 'originally_granted', grant_row.boost_tokens_granted));
    END IF;

    SELECT COALESCE(shekel_balance,0) INTO current_shekels FROM public.wallets WHERE user_id = grant_row.user_id;
    shekels_to_debit := LEAST(grant_row.shekels_granted, current_shekels);
    unrecovered_shekels := GREATEST(grant_row.shekels_granted - shekels_to_debit, 0);
    IF shekels_to_debit > 0 THEN
      UPDATE public.wallets SET shekel_balance = shekel_balance - shekels_to_debit
       WHERE user_id = grant_row.user_id;
      INSERT INTO public.shekel_ledger (user_id, kind, shekels_delta, label, stripe_event_id, metadata)
      VALUES (grant_row.user_id, 'royal_reversal', -shekels_to_debit,
              'Royal Pass reversal', _stripe_event_id,
              jsonb_build_object('grant_id', grant_row.id, 'reason', _reason,
                                 'originally_granted', grant_row.shekels_granted,
                                 'unrecovered_promotional', unrecovered_shekels));
    END IF;

    IF grant_row.founder_granted THEN
      PERFORM public.revoke_royal_founder(grant_row.user_id, _reason, _stripe_event_id, NULL);
      founder_revoked := true;
    END IF;
  END IF;

  UPDATE public.royal_pass_grants
     SET status = _new_status,
         reversed_at = CASE WHEN _new_status = 'reversed' THEN now() ELSE reversed_at END,
         reversed_reason = _reason,
         reversal_stripe_event_id = _stripe_event_id
   WHERE id = grant_row.id;

  INSERT INTO public.admin_audit_log (actor_id, action, target_type, target_id, details)
  VALUES (
    NULL, 'royal_grant_' || _new_status, 'royal_pass_grant', grant_row.id::text,
    jsonb_build_object(
      'actor_type', 'stripe_webhook',
      'stripe_event_id', _stripe_event_id, 'reason', _reason,
      'user_id', grant_row.user_id,
      'stripe_invoice_id', grant_row.stripe_invoice_id,
      'stripe_payment_intent_id', grant_row.stripe_payment_intent_id,
      'stripe_charge_id', grant_row.stripe_charge_id,
      'shields_disabled', remaining_shields,
      'boost_tokens_debited', tokens_to_debit,
      'shekels_debited', shekels_to_debit,
      'unrecovered_promotional_shekels', unrecovered_shekels,
      'founder_revoked', founder_revoked
    )
  );

  RETURN jsonb_build_object('ok', true, 'grant_id', grant_row.id, 'new_status', _new_status,
    'shields_disabled', remaining_shields, 'boost_tokens_debited', tokens_to_debit,
    'shekels_debited', shekels_to_debit, 'unrecovered_promotional_shekels', unrecovered_shekels,
    'founder_revoked', founder_revoked);
END; $$;
REVOKE ALL ON FUNCTION public.handle_royal_refund(text, text, text, text, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.handle_royal_refund(text, text, text, text, text, text) TO service_role;

-- 7. handle_royal_dispute_reinstated
CREATE OR REPLACE FUNCTION public.handle_royal_dispute_reinstated(
  _stripe_event_id text,
  _stripe_invoice_id text DEFAULT NULL,
  _stripe_payment_intent_id text DEFAULT NULL,
  _stripe_charge_id text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE grant_row record; cfg record; founder_used int; restored_founder boolean := false;
BEGIN
  SELECT * INTO grant_row FROM public.royal_pass_grants
   WHERE (_stripe_invoice_id        IS NOT NULL AND stripe_invoice_id        = _stripe_invoice_id)
      OR (_stripe_payment_intent_id IS NOT NULL AND stripe_payment_intent_id = _stripe_payment_intent_id)
      OR (_stripe_charge_id         IS NOT NULL AND stripe_charge_id         = _stripe_charge_id)
   ORDER BY created_at DESC LIMIT 1;
  IF grant_row.id IS NULL THEN
    RETURN jsonb_build_object('ok', true, 'no_grant_found', true);
  END IF;
  IF grant_row.status <> 'disputed' THEN
    RETURN jsonb_build_object('ok', true, 'no_op', true, 'status', grant_row.status);
  END IF;

  UPDATE public.royal_pass_grants
     SET status = 'granted', reversed_reason = NULL,
         reversal_stripe_event_id = _stripe_event_id
   WHERE id = grant_row.id;

  IF grant_row.founder_granted THEN
    SELECT * INTO cfg FROM public.founder_program_config WHERE id = 1 FOR UPDATE;
    SELECT count(*) INTO founder_used FROM public.founder_grants WHERE status = 'active';
    IF founder_used < cfg.member_cap
       AND NOT EXISTS (SELECT 1 FROM public.founder_grants WHERE user_id = grant_row.user_id AND status = 'active')
    THEN
      INSERT INTO public.founder_grants (user_id, stripe_invoice_id, paid_amount_cents, qualifying_invoice_id, status)
      VALUES (grant_row.user_id, grant_row.stripe_invoice_id, 0, grant_row.stripe_invoice_id, 'active')
      ON CONFLICT DO NOTHING;
      restored_founder := FOUND;
      IF restored_founder THEN
        UPDATE public.profiles
           SET is_founder = true, founder_granted_at = now(),
               founder_title = cfg.founder_title,
               royal_frame_variant = cfg.founder_frame_variant
         WHERE id = grant_row.user_id;
      END IF;
    END IF;
  END IF;

  INSERT INTO public.admin_audit_log (actor_id, action, target_type, target_id, details)
  VALUES (
    NULL, 'royal_grant_reinstated', 'royal_pass_grant', grant_row.id::text,
    jsonb_build_object('actor_type', 'stripe_webhook',
                       'stripe_event_id', _stripe_event_id,
                       'user_id', grant_row.user_id,
                       'founder_restored', restored_founder)
  );

  RETURN jsonb_build_object('ok', true, 'restored_founder', restored_founder);
END; $$;
REVOKE ALL ON FUNCTION public.handle_royal_dispute_reinstated(text, text, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.handle_royal_dispute_reinstated(text, text, text, text) TO service_role;
