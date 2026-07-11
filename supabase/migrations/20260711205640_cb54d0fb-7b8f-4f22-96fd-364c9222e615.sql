
-- =====================================================================
-- Wave 8.2a — Royal Pass dispute lifecycle hardening
-- =====================================================================

-- ---------- royal_pass_grants: dispute lifecycle columns ----------
ALTER TABLE public.royal_pass_grants
  ADD COLUMN IF NOT EXISTS pre_dispute_status text,
  ADD COLUMN IF NOT EXISTS stripe_dispute_id text,
  ADD COLUMN IF NOT EXISTS dispute_status text,
  ADD COLUMN IF NOT EXISTS disputed_at timestamptz,
  ADD COLUMN IF NOT EXISTS dispute_resolved_at timestamptz;

ALTER TABLE public.royal_pass_grants
  DROP CONSTRAINT IF EXISTS royal_pass_grants_status_chk;
ALTER TABLE public.royal_pass_grants
  ADD CONSTRAINT royal_pass_grants_status_chk
  CHECK (status IN ('granted','refunded','disputed','funds_withdrawn','reversed'));

ALTER TABLE public.royal_pass_grants
  DROP CONSTRAINT IF EXISTS royal_pass_grants_dispute_status_chk;
ALTER TABLE public.royal_pass_grants
  ADD CONSTRAINT royal_pass_grants_dispute_status_chk
  CHECK (dispute_status IS NULL OR dispute_status IN (
    'needs_response','under_review','funds_withdrawn','won','lost','funds_reinstated'
  ));

CREATE INDEX IF NOT EXISTS idx_royal_pass_grants_dispute
  ON public.royal_pass_grants(stripe_dispute_id)
  WHERE stripe_dispute_id IS NOT NULL;

-- ---------- founder_grants: dispute lifecycle columns ----------
ALTER TABLE public.founder_grants
  ADD COLUMN IF NOT EXISTS disputed_at timestamptz,
  ADD COLUMN IF NOT EXISTS dispute_resolved_at timestamptz,
  ADD COLUMN IF NOT EXISTS stripe_dispute_id text,
  ADD COLUMN IF NOT EXISTS pre_dispute_status text,
  ADD COLUMN IF NOT EXISTS original_paid_amount_cents integer;

-- Backfill original_paid_amount_cents from paid_amount_cents for existing rows.
UPDATE public.founder_grants
   SET original_paid_amount_cents = paid_amount_cents
 WHERE original_paid_amount_cents IS NULL AND paid_amount_cents IS NOT NULL;

-- Backfill original_granted_at from granted_at where missing.
UPDATE public.founder_grants
   SET original_granted_at = granted_at
 WHERE original_granted_at IS NULL;

ALTER TABLE public.founder_grants
  DROP CONSTRAINT IF EXISTS founder_grants_status_chk;
ALTER TABLE public.founder_grants
  ADD CONSTRAINT founder_grants_status_chk
  CHECK (status IN ('active','disputed','revoked'));

-- Founder slot is claimed while active OR disputed — one live claim per user.
DROP INDEX IF EXISTS public.ux_founder_grants_user_active;
CREATE UNIQUE INDEX IF NOT EXISTS ux_founder_grants_user_claimed
  ON public.founder_grants(user_id)
  WHERE status IN ('active','disputed');

CREATE INDEX IF NOT EXISTS idx_founder_grants_dispute
  ON public.founder_grants(stripe_dispute_id)
  WHERE stripe_dispute_id IS NOT NULL;

-- =====================================================================
-- founder_program_public_status — active + disputed count as claimed
-- =====================================================================
CREATE OR REPLACE FUNCTION public.founder_program_public_status()
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE cfg record; claimed int; remaining int; is_open boolean;
BEGIN
  SELECT * INTO cfg FROM public.founder_program_config WHERE id = 1;
  IF cfg IS NULL THEN
    RETURN jsonb_build_object('active', false, 'remaining', 0, 'cap', 0, 'end_at', null);
  END IF;
  -- Disputed grants keep the slot reserved until the dispute finalizes.
  SELECT count(*) INTO claimed
    FROM public.founder_grants
   WHERE status IN ('active','disputed');
  remaining := GREATEST(cfg.member_cap - claimed, 0);
  is_open := cfg.active AND cfg.end_at > now() AND remaining > 0;
  RETURN jsonb_build_object(
    'active', is_open, 'remaining', remaining, 'cap', cfg.member_cap,
    'granted', claimed, 'end_at', cfg.end_at, 'title', cfg.founder_title
  );
END; $function$;

-- =====================================================================
-- grant_royal_monthly_benefits — period validation + wallet upsert
-- =====================================================================
CREATE OR REPLACE FUNCTION public.grant_royal_monthly_benefits(
  _user_id uuid,
  _stripe_event_id text,
  _stripe_invoice_id text,
  _period_start timestamptz,
  _period_end timestamptz,
  _paid_amount_cents integer,
  _stripe_payment_intent_id text DEFAULT NULL::text,
  _stripe_charge_id text DEFAULT NULL::text,
  _stripe_subscription_id text DEFAULT NULL::text
)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  cfg record; claimed int; new_founder boolean := false; existing record;
  user_exists boolean;
BEGIN
  -- Input validation (item 9).
  IF _user_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'missing_user');
  END IF;
  IF _paid_amount_cents IS NULL OR _paid_amount_cents <= 0 THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'invalid_amount');
  END IF;
  IF _period_start IS NULL OR _period_end IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'missing_period');
  END IF;
  IF _period_end <= _period_start THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'invalid_period_range');
  END IF;
  SELECT EXISTS (SELECT 1 FROM public.profiles WHERE id = _user_id) INTO user_exists;
  IF NOT user_exists THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'user_not_found');
  END IF;

  -- Idempotency by Stripe event id.
  IF _stripe_event_id IS NOT NULL THEN
    SELECT * INTO existing FROM public.royal_pass_grants
     WHERE stripe_event_id = _stripe_event_id LIMIT 1;
    IF existing.id IS NOT NULL THEN
      RETURN jsonb_build_object('ok', true, 'already_processed', true, 'grant_id', existing.id);
    END IF;
  END IF;

  -- Idempotency by (user_id, period_start).
  SELECT * INTO existing FROM public.royal_pass_grants
   WHERE user_id = _user_id AND period_start = _period_start LIMIT 1;
  IF existing.id IS NOT NULL THEN
    RETURN jsonb_build_object('ok', true, 'already_processed', true, 'grant_id', existing.id);
  END IF;

  -- Atomic Founder cap check.
  SELECT * INTO cfg FROM public.founder_program_config WHERE id = 1 FOR UPDATE;
  IF cfg.active AND cfg.end_at > now() THEN
    SELECT count(*) INTO claimed FROM public.founder_grants
     WHERE status IN ('active','disputed');
    IF claimed < cfg.member_cap
       AND NOT EXISTS (
         SELECT 1 FROM public.founder_grants
          WHERE user_id = _user_id AND status IN ('active','disputed')
       )
    THEN
      INSERT INTO public.founder_grants
        (user_id, stripe_invoice_id, paid_amount_cents, original_paid_amount_cents,
         qualifying_invoice_id, original_granted_at, status)
      VALUES (_user_id, _stripe_invoice_id, _paid_amount_cents, _paid_amount_cents,
              _stripe_invoice_id, now(), 'active')
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

  -- Shield allowance (idempotent on user_id+period_start).
  INSERT INTO public.royal_pass_shield_allowances
    (user_id, period_start, period_end, shields_granted, shields_used)
  VALUES (_user_id, _period_start, _period_end, 5, 0)
  ON CONFLICT (user_id, period_start) DO NOTHING;

  -- Promotional Shekels.
  INSERT INTO public.shekel_ledger (user_id, kind, shekels_delta, label, stripe_event_id, metadata)
  VALUES (_user_id, 'royal_monthly', 500, 'Royal Pass monthly Shekels', _stripe_event_id,
          jsonb_build_object('invoice_id', _stripe_invoice_id, 'source', 'royal_pass'));

  -- Wallet upsert (item 8): create the row if the user has none yet.
  INSERT INTO public.wallets (user_id, shekel_balance)
  VALUES (_user_id, 500)
  ON CONFLICT (user_id) DO UPDATE
     SET shekel_balance = public.wallets.shekel_balance + 500,
         updated_at = now();

  -- Promotional Boost Tokens.
  INSERT INTO public.boost_tokens_ledger (user_id, delta, reason, metadata)
  VALUES (_user_id, 3, 'royal_monthly',
          jsonb_build_object('invoice_id', _stripe_invoice_id, 'event_id', _stripe_event_id));
  UPDATE public.profiles
     SET boost_tokens_balance = COALESCE(boost_tokens_balance,0) + 3
   WHERE id = _user_id;

  INSERT INTO public.royal_pass_grants
    (user_id, stripe_event_id, stripe_invoice_id, period_start, period_end,
     shields_granted, shekels_granted, boost_tokens_granted, founder_granted,
     stripe_payment_intent_id, stripe_charge_id, stripe_subscription_id, status)
  VALUES (_user_id, _stripe_event_id, _stripe_invoice_id, _period_start, _period_end,
          5, 500, 3, new_founder,
          _stripe_payment_intent_id, _stripe_charge_id, _stripe_subscription_id, 'granted');

  RETURN jsonb_build_object('ok', true, 'new_founder', new_founder);
END; $function$;

-- =====================================================================
-- revoke_royal_founder — add suspend mode
-- =====================================================================
CREATE OR REPLACE FUNCTION public.revoke_royal_founder(
  _user_id uuid,
  _reason text,
  _stripe_event_id text,
  _actor_id uuid DEFAULT NULL::uuid,
  _mode text DEFAULT 'revoke',        -- 'revoke' | 'suspend'
  _stripe_dispute_id text DEFAULT NULL::text
)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE grant_row record; still_royal boolean := false; new_status text;
BEGIN
  IF _mode NOT IN ('revoke','suspend') THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'invalid_mode');
  END IF;

  SELECT * INTO grant_row FROM public.founder_grants
   WHERE user_id = _user_id AND status IN ('active','disputed')
   ORDER BY status = 'active' DESC, granted_at DESC LIMIT 1;
  IF grant_row.id IS NULL THEN
    RETURN jsonb_build_object('ok', true, 'no_active_grant', true);
  END IF;

  -- No-op if suspending an already-disputed row.
  IF _mode = 'suspend' AND grant_row.status = 'disputed' THEN
    RETURN jsonb_build_object('ok', true, 'already_suspended', true, 'grant_id', grant_row.id);
  END IF;

  new_status := CASE WHEN _mode = 'suspend' THEN 'disputed' ELSE 'revoked' END;

  UPDATE public.founder_grants
     SET status = new_status,
         pre_dispute_status = CASE
           WHEN _mode = 'suspend' THEN COALESCE(pre_dispute_status, grant_row.status)
           ELSE pre_dispute_status END,
         disputed_at = CASE WHEN _mode = 'suspend' THEN COALESCE(disputed_at, now()) ELSE disputed_at END,
         stripe_dispute_id = COALESCE(_stripe_dispute_id, stripe_dispute_id),
         revoked_at = CASE WHEN _mode = 'revoke' THEN now() ELSE revoked_at END,
         revoked_reason = CASE WHEN _mode = 'revoke' THEN _reason ELSE revoked_reason END,
         revoked_stripe_event_id = CASE WHEN _mode = 'revoke' THEN _stripe_event_id ELSE revoked_stripe_event_id END,
         metadata = metadata || jsonb_build_object(
           'lifecycle_event', jsonb_build_object(
             'mode', _mode, 'reason', _reason,
             'stripe_event_id', _stripe_event_id,
             'stripe_dispute_id', _stripe_dispute_id,
             'at', now()
           )
         )
   WHERE id = grant_row.id;

  -- Founder cosmetics cleared in both modes; frame restored to 'royal' if still a subscriber.
  SELECT EXISTS (
    SELECT 1 FROM public.royal_pass_subscriptions
     WHERE user_id = _user_id AND status IN ('active','trialing')
       AND (current_period_end IS NULL OR current_period_end > now())
  ) INTO still_royal;

  UPDATE public.profiles
     SET is_founder = false,
         founder_granted_at = NULL,
         founder_title = NULL,
         royal_frame_variant = CASE WHEN still_royal THEN 'royal' ELSE NULL END
   WHERE id = _user_id;

  INSERT INTO public.admin_audit_log (actor_id, action, target_type, target_id, details)
  VALUES (
    _actor_id,
    CASE WHEN _mode = 'suspend' THEN 'royal_founder_suspended' ELSE 'royal_founder_revoked' END,
    'founder_grant', grant_row.id::text,
    jsonb_build_object(
      'actor_type', CASE WHEN _actor_id IS NULL THEN 'stripe_webhook' ELSE 'admin' END,
      'user_id', _user_id, 'reason', _reason, 'mode', _mode,
      'stripe_event_id', _stripe_event_id,
      'stripe_dispute_id', _stripe_dispute_id,
      'still_royal_subscriber', still_royal
    )
  );

  RETURN jsonb_build_object('ok', true, 'mode', _mode, 'grant_id', grant_row.id, 'still_royal', still_royal);
END; $function$;

-- =====================================================================
-- handle_royal_dispute_created — suspend, do NOT reverse
-- =====================================================================
CREATE OR REPLACE FUNCTION public.handle_royal_dispute_created(
  _stripe_event_id text,
  _stripe_dispute_id text,
  _dispute_reason text DEFAULT NULL::text,
  _stripe_invoice_id text DEFAULT NULL::text,
  _stripe_payment_intent_id text DEFAULT NULL::text,
  _stripe_charge_id text DEFAULT NULL::text
)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE grant_row record; suspended_founder boolean := false;
BEGIN
  SELECT * INTO grant_row FROM public.royal_pass_grants
   WHERE (_stripe_invoice_id        IS NOT NULL AND stripe_invoice_id        = _stripe_invoice_id)
      OR (_stripe_payment_intent_id IS NOT NULL AND stripe_payment_intent_id = _stripe_payment_intent_id)
      OR (_stripe_charge_id         IS NOT NULL AND stripe_charge_id         = _stripe_charge_id)
      OR (_stripe_dispute_id        IS NOT NULL AND stripe_dispute_id        = _stripe_dispute_id)
   ORDER BY created_at DESC LIMIT 1;

  IF grant_row.id IS NULL THEN
    RETURN jsonb_build_object('ok', true, 'no_grant_found', true);
  END IF;

  -- Idempotent: if already in a dispute/reversed state for this dispute id, no-op.
  IF grant_row.status IN ('disputed','funds_withdrawn','reversed')
     AND (grant_row.stripe_dispute_id IS NOT NULL AND grant_row.stripe_dispute_id = _stripe_dispute_id)
  THEN
    RETURN jsonb_build_object('ok', true, 'already_disputed', true, 'grant_id', grant_row.id);
  END IF;

  -- Do NOT reverse balances. Suspend Founder cosmetics + prevent unused shield activation
  -- by relying on the 'disputed' grant status (checked in use_royal_shield / cosmetics UI).
  UPDATE public.royal_pass_grants
     SET pre_dispute_status = COALESCE(pre_dispute_status, status),
         status = 'disputed',
         stripe_dispute_id = _stripe_dispute_id,
         dispute_status = 'needs_response',
         disputed_at = COALESCE(disputed_at, now()),
         reversed_reason = _dispute_reason,
         reversal_stripe_event_id = _stripe_event_id
   WHERE id = grant_row.id;

  IF grant_row.founder_granted THEN
    PERFORM public.revoke_royal_founder(
      grant_row.user_id, COALESCE(_dispute_reason,'dispute_created'),
      _stripe_event_id, NULL, 'suspend', _stripe_dispute_id
    );
    suspended_founder := true;
  END IF;

  INSERT INTO public.admin_audit_log (actor_id, action, target_type, target_id, details)
  VALUES (
    NULL, 'royal_grant_dispute_created', 'royal_pass_grant', grant_row.id::text,
    jsonb_build_object(
      'actor_type','stripe_webhook',
      'stripe_event_id',_stripe_event_id,'stripe_dispute_id',_stripe_dispute_id,
      'reason',_dispute_reason,'user_id',grant_row.user_id,
      'suspended_founder',suspended_founder
    )
  );

  RETURN jsonb_build_object('ok', true, 'grant_id', grant_row.id,
                            'suspended_founder', suspended_founder);
END; $function$;

-- =====================================================================
-- handle_royal_dispute_funds_withdrawn — record only, do NOT double-reverse
-- =====================================================================
CREATE OR REPLACE FUNCTION public.handle_royal_dispute_funds_withdrawn(
  _stripe_event_id text,
  _stripe_dispute_id text,
  _stripe_invoice_id text DEFAULT NULL::text,
  _stripe_payment_intent_id text DEFAULT NULL::text,
  _stripe_charge_id text DEFAULT NULL::text
)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE grant_row record;
BEGIN
  SELECT * INTO grant_row FROM public.royal_pass_grants
   WHERE (_stripe_dispute_id        IS NOT NULL AND stripe_dispute_id        = _stripe_dispute_id)
      OR (_stripe_invoice_id        IS NOT NULL AND stripe_invoice_id        = _stripe_invoice_id)
      OR (_stripe_payment_intent_id IS NOT NULL AND stripe_payment_intent_id = _stripe_payment_intent_id)
      OR (_stripe_charge_id         IS NOT NULL AND stripe_charge_id         = _stripe_charge_id)
   ORDER BY created_at DESC LIMIT 1;

  IF grant_row.id IS NULL THEN
    RETURN jsonb_build_object('ok', true, 'no_grant_found', true);
  END IF;

  -- Idempotent
  IF grant_row.dispute_status = 'funds_withdrawn' THEN
    RETURN jsonb_build_object('ok', true, 'already_recorded', true, 'grant_id', grant_row.id);
  END IF;

  UPDATE public.royal_pass_grants
     SET dispute_status = 'funds_withdrawn',
         -- Only advance status to funds_withdrawn if we haven't already finalized reversal.
         status = CASE WHEN status IN ('reversed','refunded') THEN status
                       ELSE 'funds_withdrawn' END,
         pre_dispute_status = COALESCE(pre_dispute_status, 'granted'),
         stripe_dispute_id = COALESCE(stripe_dispute_id, _stripe_dispute_id)
   WHERE id = grant_row.id;

  INSERT INTO public.admin_audit_log (actor_id, action, target_type, target_id, details)
  VALUES (
    NULL, 'royal_grant_dispute_funds_withdrawn', 'royal_pass_grant', grant_row.id::text,
    jsonb_build_object('actor_type','stripe_webhook',
      'stripe_event_id',_stripe_event_id,'stripe_dispute_id',_stripe_dispute_id,
      'user_id',grant_row.user_id)
  );

  RETURN jsonb_build_object('ok', true, 'grant_id', grant_row.id);
END; $function$;

-- =====================================================================
-- handle_royal_dispute_lost — finalize reversal (delegates to handle_royal_refund)
-- =====================================================================
CREATE OR REPLACE FUNCTION public.handle_royal_dispute_lost(
  _stripe_event_id text,
  _stripe_dispute_id text,
  _reason text DEFAULT 'dispute_lost',
  _stripe_invoice_id text DEFAULT NULL::text,
  _stripe_payment_intent_id text DEFAULT NULL::text,
  _stripe_charge_id text DEFAULT NULL::text
)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE grant_row record; result jsonb;
BEGIN
  SELECT * INTO grant_row FROM public.royal_pass_grants
   WHERE (_stripe_dispute_id        IS NOT NULL AND stripe_dispute_id        = _stripe_dispute_id)
      OR (_stripe_invoice_id        IS NOT NULL AND stripe_invoice_id        = _stripe_invoice_id)
      OR (_stripe_payment_intent_id IS NOT NULL AND stripe_payment_intent_id = _stripe_payment_intent_id)
      OR (_stripe_charge_id         IS NOT NULL AND stripe_charge_id         = _stripe_charge_id)
   ORDER BY created_at DESC LIMIT 1;

  IF grant_row.id IS NULL THEN
    RETURN jsonb_build_object('ok', true, 'no_grant_found', true);
  END IF;
  IF grant_row.status = 'reversed' THEN
    RETURN jsonb_build_object('ok', true, 'already_reversed', true, 'grant_id', grant_row.id);
  END IF;

  result := public.handle_royal_refund(
    _stripe_event_id, _reason,
    _stripe_invoice_id, _stripe_payment_intent_id, _stripe_charge_id,
    'reversed'
  );

  UPDATE public.royal_pass_grants
     SET dispute_status = 'lost',
         dispute_resolved_at = now(),
         stripe_dispute_id = COALESCE(stripe_dispute_id, _stripe_dispute_id)
   WHERE id = grant_row.id;

  -- Founder was already suspended at dispute.created; convert suspension → permanent revoke.
  UPDATE public.founder_grants
     SET status = 'revoked',
         revoked_at = COALESCE(revoked_at, now()),
         revoked_reason = COALESCE(revoked_reason, _reason),
         revoked_stripe_event_id = COALESCE(revoked_stripe_event_id, _stripe_event_id),
         dispute_resolved_at = now()
   WHERE user_id = grant_row.user_id
     AND stripe_dispute_id IS NOT NULL
     AND stripe_dispute_id = _stripe_dispute_id
     AND status = 'disputed';

  RETURN jsonb_build_object('ok', true, 'dispute_lost', true, 'grant_id', grant_row.id, 'refund', result);
END; $function$;

-- =====================================================================
-- handle_royal_dispute_reinstated — restore from disputed / funds_withdrawn
-- Handles both `funds_reinstated` and `closed → won`.
-- Reactivates the ORIGINAL founder_grants row instead of inserting a new one.
-- =====================================================================
CREATE OR REPLACE FUNCTION public.handle_royal_dispute_reinstated(
  _stripe_event_id text,
  _stripe_invoice_id text DEFAULT NULL::text,
  _stripe_payment_intent_id text DEFAULT NULL::text,
  _stripe_charge_id text DEFAULT NULL::text,
  _stripe_dispute_id text DEFAULT NULL::text
)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE grant_row record; cfg record; restored_founder boolean := false; fg record;
BEGIN
  SELECT * INTO grant_row FROM public.royal_pass_grants
   WHERE (_stripe_dispute_id        IS NOT NULL AND stripe_dispute_id        = _stripe_dispute_id)
      OR (_stripe_invoice_id        IS NOT NULL AND stripe_invoice_id        = _stripe_invoice_id)
      OR (_stripe_payment_intent_id IS NOT NULL AND stripe_payment_intent_id = _stripe_payment_intent_id)
      OR (_stripe_charge_id         IS NOT NULL AND stripe_charge_id         = _stripe_charge_id)
   ORDER BY created_at DESC LIMIT 1;

  IF grant_row.id IS NULL THEN
    RETURN jsonb_build_object('ok', true, 'no_grant_found', true);
  END IF;

  -- 'refunded' rows are NOT auto-restored (item 1).
  IF grant_row.status = 'refunded' THEN
    RETURN jsonb_build_object('ok', true, 'skipped_refunded', true, 'grant_id', grant_row.id);
  END IF;

  -- Only restore if this dispute is the one that caused suspension/reversal.
  IF grant_row.status IN ('reversed','funds_withdrawn')
     AND (grant_row.stripe_dispute_id IS NULL OR grant_row.stripe_dispute_id <> COALESCE(_stripe_dispute_id, grant_row.stripe_dispute_id))
  THEN
    RETURN jsonb_build_object('ok', true, 'dispute_mismatch', true, 'grant_id', grant_row.id);
  END IF;

  -- Idempotent
  IF grant_row.status = 'granted' AND grant_row.dispute_status IN ('won','funds_reinstated') THEN
    RETURN jsonb_build_object('ok', true, 'already_restored', true, 'grant_id', grant_row.id);
  END IF;

  UPDATE public.royal_pass_grants
     SET status = COALESCE(pre_dispute_status, 'granted'),
         dispute_status = 'funds_reinstated',
         dispute_resolved_at = now(),
         reversed_at = NULL,
         reversed_reason = NULL,
         reversal_stripe_event_id = _stripe_event_id
   WHERE id = grant_row.id;

  -- Reactivate the ORIGINAL Founder row (do not insert a new one at $0).
  IF grant_row.founder_granted THEN
    SELECT * INTO fg FROM public.founder_grants
     WHERE user_id = grant_row.user_id
       AND (
         (stripe_dispute_id IS NOT NULL AND stripe_dispute_id = _stripe_dispute_id)
         OR qualifying_invoice_id = grant_row.stripe_invoice_id
       )
     ORDER BY status = 'disputed' DESC, granted_at DESC LIMIT 1;

    IF fg.id IS NOT NULL AND fg.status IN ('disputed','revoked') THEN
      SELECT * INTO cfg FROM public.founder_program_config WHERE id = 1;
      UPDATE public.founder_grants
         SET status = 'active',
             revoked_at = NULL,
             revoked_reason = NULL,
             revoked_stripe_event_id = NULL,
             dispute_resolved_at = now(),
             metadata = metadata || jsonb_build_object(
               'lifecycle_event', jsonb_build_object(
                 'mode','reactivate','stripe_event_id',_stripe_event_id,
                 'stripe_dispute_id',_stripe_dispute_id,'at',now()
               )
             )
       WHERE id = fg.id;

      UPDATE public.profiles
         SET is_founder = true,
             founder_granted_at = COALESCE(founder_granted_at, fg.original_granted_at, fg.granted_at),
             founder_title = COALESCE(cfg.founder_title, founder_title),
             royal_frame_variant = COALESCE(cfg.founder_frame_variant, 'royal')
       WHERE id = grant_row.user_id;
      restored_founder := true;
    END IF;
  END IF;

  INSERT INTO public.admin_audit_log (actor_id, action, target_type, target_id, details)
  VALUES (
    NULL, 'royal_grant_reinstated', 'royal_pass_grant', grant_row.id::text,
    jsonb_build_object(
      'actor_type','stripe_webhook',
      'stripe_event_id',_stripe_event_id,
      'stripe_dispute_id',_stripe_dispute_id,
      'user_id',grant_row.user_id,
      'restored_founder',restored_founder,
      'note','Exact balance restoration deferred to Wave 8.2b — status flipped, cosmetics restored.'
    )
  );

  RETURN jsonb_build_object('ok', true, 'restored_founder', restored_founder,
                            'grant_id', grant_row.id,
                            'balance_restoration_pending_wave_8_2b', true);
END; $function$;

-- =====================================================================
-- handle_royal_dispute_won — thin wrapper over handle_royal_dispute_reinstated
-- =====================================================================
CREATE OR REPLACE FUNCTION public.handle_royal_dispute_won(
  _stripe_event_id text,
  _stripe_dispute_id text,
  _stripe_invoice_id text DEFAULT NULL::text,
  _stripe_payment_intent_id text DEFAULT NULL::text,
  _stripe_charge_id text DEFAULT NULL::text
)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  RETURN public.handle_royal_dispute_reinstated(
    _stripe_event_id, _stripe_invoice_id, _stripe_payment_intent_id,
    _stripe_charge_id, _stripe_dispute_id
  );
END; $function$;

REVOKE ALL ON FUNCTION public.handle_royal_dispute_created(text,text,text,text,text,text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.handle_royal_dispute_funds_withdrawn(text,text,text,text,text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.handle_royal_dispute_lost(text,text,text,text,text,text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.handle_royal_dispute_won(text,text,text,text,text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.revoke_royal_founder(uuid,text,text,uuid,text,text) FROM PUBLIC, anon, authenticated;
