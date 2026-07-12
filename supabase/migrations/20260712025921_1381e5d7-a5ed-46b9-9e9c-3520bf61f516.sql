
-- Wave 8.2b — source-aware reversal + exact restoration

ALTER TABLE public.royal_pass_grants
  ADD COLUMN IF NOT EXISTS promo_shekels_remaining integer,
  ADD COLUMN IF NOT EXISTS promo_boost_tokens_remaining integer,
  ADD COLUMN IF NOT EXISTS shields_reversed integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS shekels_reversed integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS boost_tokens_reversed integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS active_shields_reversed integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS founder_reversed boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS reversal_completed_at timestamptz,
  ADD COLUMN IF NOT EXISTS reversal_source_event_id text,
  ADD COLUMN IF NOT EXISTS restoration_completed_at timestamptz,
  ADD COLUMN IF NOT EXISTS restoration_source_event_id text;

UPDATE public.royal_pass_grants
   SET promo_shekels_remaining = CASE WHEN status = 'granted' THEN shekels_granted ELSE 0 END
 WHERE promo_shekels_remaining IS NULL;
UPDATE public.royal_pass_grants
   SET promo_boost_tokens_remaining = CASE WHEN status = 'granted' THEN boost_tokens_granted ELSE 0 END
 WHERE promo_boost_tokens_remaining IS NULL;

ALTER TABLE public.royal_pass_grants
  ALTER COLUMN promo_shekels_remaining SET NOT NULL,
  ALTER COLUMN promo_boost_tokens_remaining SET NOT NULL,
  ALTER COLUMN promo_shekels_remaining SET DEFAULT 0,
  ALTER COLUMN promo_boost_tokens_remaining SET DEFAULT 0;

ALTER TABLE public.royal_pass_grants
  DROP CONSTRAINT IF EXISTS royal_pass_grants_remaining_nonneg;
ALTER TABLE public.royal_pass_grants
  ADD CONSTRAINT royal_pass_grants_remaining_nonneg
  CHECK (promo_shekels_remaining >= 0 AND promo_boost_tokens_remaining >= 0
     AND promo_shekels_remaining <= shekels_granted
     AND promo_boost_tokens_remaining <= boost_tokens_granted);

ALTER TABLE public.boosts
  ADD COLUMN IF NOT EXISTS royal_pass_grant_id uuid,
  ADD COLUMN IF NOT EXISTS royal_pass_shield_allowance_id uuid;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'boosts_royal_grant_fk') THEN
    ALTER TABLE public.boosts
      ADD CONSTRAINT boosts_royal_grant_fk
      FOREIGN KEY (royal_pass_grant_id) REFERENCES public.royal_pass_grants(id) ON DELETE RESTRICT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'boosts_royal_allowance_fk') THEN
    ALTER TABLE public.boosts
      ADD CONSTRAINT boosts_royal_allowance_fk
      FOREIGN KEY (royal_pass_shield_allowance_id) REFERENCES public.royal_pass_shield_allowances(id) ON DELETE RESTRICT;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_boosts_royal_grant
  ON public.boosts(royal_pass_grant_id)
  WHERE royal_pass_grant_id IS NOT NULL;

UPDATE public.boosts b
   SET royal_pass_grant_id = g.id,
       royal_pass_shield_allowance_id = a.id
  FROM public.royal_pass_grants g
  JOIN public.royal_pass_shield_allowances a
    ON a.user_id = g.user_id AND a.period_start = g.period_start
 WHERE b.royal_pass_grant_id IS NULL
   AND b.source = 'royal_pass'
   AND b.boost_type = 'crown_shield'
   AND b.user_id = g.user_id
   AND b.started_at >= g.period_start
   AND b.started_at <  g.period_end;

CREATE TABLE IF NOT EXISTS public.royal_pass_reversals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  royal_pass_grant_id uuid NOT NULL REFERENCES public.royal_pass_grants(id) ON DELETE RESTRICT,
  user_id uuid NOT NULL,
  event_kind text NOT NULL CHECK (event_kind IN ('reversal','restoration')),
  stripe_event_id text NOT NULL,
  stripe_event_type text,
  stripe_dispute_id text,
  reason text,
  shields_delta integer NOT NULL DEFAULT 0,
  shekels_delta integer NOT NULL DEFAULT 0,
  boost_tokens_delta integer NOT NULL DEFAULT 0,
  active_shields_delta integer NOT NULL DEFAULT 0,
  founder_touched boolean NOT NULL DEFAULT false,
  boost_ids uuid[] NOT NULL DEFAULT '{}',
  details jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS ux_royal_pass_reversals_event_kind
  ON public.royal_pass_reversals (royal_pass_grant_id, event_kind, stripe_event_id);
CREATE INDEX IF NOT EXISTS idx_royal_pass_reversals_user
  ON public.royal_pass_reversals (user_id, created_at DESC);

GRANT SELECT ON public.royal_pass_reversals TO authenticated;
GRANT ALL ON public.royal_pass_reversals TO service_role;

ALTER TABLE public.royal_pass_reversals ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users view own royal reversals" ON public.royal_pass_reversals;
CREATE POLICY "Users view own royal reversals"
  ON public.royal_pass_reversals FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Admins view all royal reversals" ON public.royal_pass_reversals;
CREATE POLICY "Admins view all royal reversals"
  ON public.royal_pass_reversals FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role));

DROP POLICY IF EXISTS "royal_pass_reversals no client insert" ON public.royal_pass_reversals;
CREATE POLICY "royal_pass_reversals no client insert"
  ON public.royal_pass_reversals
  AS RESTRICTIVE
  FOR INSERT TO anon, authenticated
  WITH CHECK (false);
DROP POLICY IF EXISTS "royal_pass_reversals no client update" ON public.royal_pass_reversals;
CREATE POLICY "royal_pass_reversals no client update"
  ON public.royal_pass_reversals
  AS RESTRICTIVE
  FOR UPDATE TO anon, authenticated
  USING (false) WITH CHECK (false);
DROP POLICY IF EXISTS "royal_pass_reversals no client delete" ON public.royal_pass_reversals;
CREATE POLICY "royal_pass_reversals no client delete"
  ON public.royal_pass_reversals
  AS RESTRICTIVE
  FOR DELETE TO anon, authenticated
  USING (false);

-- Source-aware consumption triggers
CREATE OR REPLACE FUNCTION public.trg_consume_royal_promo_shekels()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  remaining int; g record; take int;
BEGIN
  IF NEW.shekels_delta >= 0 THEN RETURN NEW; END IF;
  IF NEW.kind IN ('royal_monthly','royal_reversal','royal_reinstate') THEN RETURN NEW; END IF;
  remaining := (-NEW.shekels_delta)::int;
  FOR g IN
    SELECT id, promo_shekels_remaining FROM public.royal_pass_grants
     WHERE user_id = NEW.user_id AND status = 'granted' AND promo_shekels_remaining > 0
     ORDER BY created_at ASC FOR UPDATE
  LOOP
    EXIT WHEN remaining <= 0;
    take := LEAST(g.promo_shekels_remaining, remaining);
    UPDATE public.royal_pass_grants
       SET promo_shekels_remaining = promo_shekels_remaining - take
     WHERE id = g.id;
    remaining := remaining - take;
  END LOOP;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS shekel_ledger_consume_royal_promo ON public.shekel_ledger;
CREATE TRIGGER shekel_ledger_consume_royal_promo
  AFTER INSERT ON public.shekel_ledger
  FOR EACH ROW EXECUTE FUNCTION public.trg_consume_royal_promo_shekels();

CREATE OR REPLACE FUNCTION public.trg_consume_royal_promo_boost_tokens()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  remaining int; g record; take int;
BEGIN
  IF NEW.delta >= 0 THEN RETURN NEW; END IF;
  IF NEW.reason IN ('royal_monthly','royal_reversal','royal_reinstate') THEN RETURN NEW; END IF;
  remaining := (-NEW.delta)::int;
  FOR g IN
    SELECT id, promo_boost_tokens_remaining FROM public.royal_pass_grants
     WHERE user_id = NEW.user_id AND status = 'granted' AND promo_boost_tokens_remaining > 0
     ORDER BY created_at ASC FOR UPDATE
  LOOP
    EXIT WHEN remaining <= 0;
    take := LEAST(g.promo_boost_tokens_remaining, remaining);
    UPDATE public.royal_pass_grants
       SET promo_boost_tokens_remaining = promo_boost_tokens_remaining - take
     WHERE id = g.id;
    remaining := remaining - take;
  END LOOP;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS boost_tokens_ledger_consume_royal_promo ON public.boost_tokens_ledger;
CREATE TRIGGER boost_tokens_ledger_consume_royal_promo
  AFTER INSERT ON public.boost_tokens_ledger
  FOR EACH ROW EXECUTE FUNCTION public.trg_consume_royal_promo_boost_tokens();

-- grant_royal_monthly_benefits — initialize promo_remaining
CREATE OR REPLACE FUNCTION public.grant_royal_monthly_benefits(
  _user_id uuid, _stripe_event_id text, _stripe_invoice_id text,
  _period_start timestamptz, _period_end timestamptz, _paid_amount_cents integer,
  _stripe_payment_intent_id text DEFAULT NULL::text,
  _stripe_charge_id text DEFAULT NULL::text,
  _stripe_subscription_id text DEFAULT NULL::text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  cfg record; claimed int; new_founder boolean := false; existing record;
  user_exists boolean; new_grant_id uuid;
BEGIN
  IF _user_id IS NULL THEN RETURN jsonb_build_object('ok', false, 'reason', 'missing_user'); END IF;
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
  IF NOT user_exists THEN RETURN jsonb_build_object('ok', false, 'reason', 'user_not_found'); END IF;

  IF _stripe_event_id IS NOT NULL THEN
    SELECT * INTO existing FROM public.royal_pass_grants WHERE stripe_event_id = _stripe_event_id LIMIT 1;
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
    SELECT count(*) INTO claimed FROM public.founder_grants WHERE status IN ('active','disputed');
    IF claimed < cfg.member_cap
       AND NOT EXISTS (SELECT 1 FROM public.founder_grants WHERE user_id = _user_id AND status IN ('active','disputed'))
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

  BEGIN
    INSERT INTO public.royal_pass_grants
      (user_id, stripe_event_id, stripe_invoice_id, period_start, period_end,
       shields_granted, shekels_granted, boost_tokens_granted, founder_granted,
       stripe_payment_intent_id, stripe_charge_id, stripe_subscription_id, status,
       promo_shekels_remaining, promo_boost_tokens_remaining)
    VALUES (_user_id, _stripe_event_id, _stripe_invoice_id, _period_start, _period_end,
            5, 500, 3, new_founder,
            _stripe_payment_intent_id, _stripe_charge_id, _stripe_subscription_id, 'granted',
            500, 3)
    RETURNING id INTO new_grant_id;
  EXCEPTION WHEN unique_violation THEN
    SELECT id INTO new_grant_id FROM public.royal_pass_grants
     WHERE (stripe_event_id IS NOT NULL AND stripe_event_id = _stripe_event_id)
        OR (user_id = _user_id AND period_start = _period_start)
     ORDER BY created_at DESC LIMIT 1;
    RETURN jsonb_build_object('ok', true, 'already_processed', true,
                              'grant_id', new_grant_id, 'concurrent', true);
  END;

  INSERT INTO public.royal_pass_shield_allowances
    (user_id, period_start, period_end, shields_granted, shields_used, royal_pass_grant_id)
  VALUES (_user_id, _period_start, _period_end, 5, 0, new_grant_id)
  ON CONFLICT (user_id, period_start) DO UPDATE
    SET royal_pass_grant_id = COALESCE(public.royal_pass_shield_allowances.royal_pass_grant_id, EXCLUDED.royal_pass_grant_id);

  INSERT INTO public.shekel_ledger (user_id, kind, shekels_delta, label, stripe_event_id, metadata)
  VALUES (_user_id, 'royal_monthly', 500, 'Royal Pass monthly Shekels', _stripe_event_id,
          jsonb_build_object('invoice_id', _stripe_invoice_id, 'source', 'royal_pass', 'grant_id', new_grant_id));

  INSERT INTO public.wallets (user_id, shekel_balance)
  VALUES (_user_id, 500)
  ON CONFLICT (user_id) DO UPDATE
     SET shekel_balance = public.wallets.shekel_balance + 500,
         updated_at = now();

  INSERT INTO public.boost_tokens_ledger (user_id, delta, reason, metadata)
  VALUES (_user_id, 3, 'royal_monthly',
          jsonb_build_object('invoice_id', _stripe_invoice_id, 'event_id', _stripe_event_id, 'grant_id', new_grant_id));
  UPDATE public.profiles
     SET boost_tokens_balance = COALESCE(boost_tokens_balance,0) + 3
   WHERE id = _user_id;

  RETURN jsonb_build_object('ok', true, 'new_founder', new_founder, 'grant_id', new_grant_id);
END; $function$;

REVOKE ALL ON FUNCTION public.grant_royal_monthly_benefits(uuid,text,text,timestamptz,timestamptz,integer,text,text,text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.grant_royal_monthly_benefits(uuid,text,text,timestamptz,timestamptz,integer,text,text,text) TO service_role;

-- Source-aware handle_royal_refund
CREATE OR REPLACE FUNCTION public.handle_royal_refund(
  _stripe_event_id text, _reason text,
  _stripe_invoice_id text DEFAULT NULL::text,
  _stripe_payment_intent_id text DEFAULT NULL::text,
  _stripe_charge_id text DEFAULT NULL::text,
  _new_status text DEFAULT 'reversed'::text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  grant_row record; allowance_row record;
  shields_disabled int := 0;
  shekels_to_debit int := 0;
  tokens_to_debit int := 0;
  active_shield_ids uuid[] := ARRAY[]::uuid[];
  active_shields_deactivated int := 0;
  founder_revoked boolean := false;
BEGIN
  IF _new_status NOT IN ('reversed','disputed','refunded') THEN
    RETURN jsonb_build_object('error','invalid_status');
  END IF;

  SELECT * INTO grant_row FROM public.royal_pass_grants
   WHERE (_stripe_invoice_id        IS NOT NULL AND stripe_invoice_id        = _stripe_invoice_id)
      OR (_stripe_payment_intent_id IS NOT NULL AND stripe_payment_intent_id = _stripe_payment_intent_id)
      OR (_stripe_charge_id         IS NOT NULL AND stripe_charge_id         = _stripe_charge_id)
   ORDER BY created_at DESC LIMIT 1
   FOR UPDATE;

  IF grant_row.id IS NULL THEN
    RETURN jsonb_build_object('ok', true, 'no_grant_found', true);
  END IF;

  IF grant_row.status IN ('reversed','refunded') AND _new_status IN ('reversed','refunded') THEN
    RETURN jsonb_build_object('ok', true, 'already_reversed', true, 'grant_id', grant_row.id);
  END IF;

  IF _new_status IN ('reversed','refunded') THEN
    IF EXISTS (
      SELECT 1 FROM public.royal_pass_reversals
       WHERE royal_pass_grant_id = grant_row.id
         AND event_kind = 'reversal'
         AND stripe_event_id = _stripe_event_id
    ) THEN
      RETURN jsonb_build_object('ok', true, 'already_reversed', true, 'grant_id', grant_row.id);
    END IF;

    SELECT * INTO allowance_row FROM public.royal_pass_shield_allowances
     WHERE royal_pass_grant_id = grant_row.id FOR UPDATE;
    IF allowance_row.id IS NOT NULL THEN
      shields_disabled := GREATEST(allowance_row.shields_granted - allowance_row.shields_used, 0);
      IF shields_disabled > 0 THEN
        UPDATE public.royal_pass_shield_allowances
           SET shields_used = shields_granted, updated_at = now()
         WHERE id = allowance_row.id;
      END IF;
    END IF;

    SELECT COALESCE(array_agg(id ORDER BY started_at), ARRAY[]::uuid[])
      INTO active_shield_ids
      FROM public.boosts
     WHERE royal_pass_grant_id = grant_row.id
       AND boost_type = 'crown_shield'
       AND active = true
       AND (expires_at IS NULL OR expires_at > now());
    active_shields_deactivated := COALESCE(array_length(active_shield_ids, 1), 0);
    IF active_shields_deactivated > 0 THEN
      PERFORM set_config('lovable.boost_sync', '1', true);
      UPDATE public.boosts
         SET active = false
       WHERE id = ANY(active_shield_ids);
      PERFORM set_config('lovable.boost_sync', '0', true);
    END IF;

    shekels_to_debit := grant_row.promo_shekels_remaining;
    tokens_to_debit  := grant_row.promo_boost_tokens_remaining;

    IF shekels_to_debit > 0 THEN
      UPDATE public.wallets
         SET shekel_balance = GREATEST(shekel_balance - shekels_to_debit, 0),
             updated_at = now()
       WHERE user_id = grant_row.user_id;
      INSERT INTO public.shekel_ledger (user_id, kind, shekels_delta, label, stripe_event_id, metadata)
      VALUES (grant_row.user_id, 'royal_reversal', -shekels_to_debit,
              'Royal Pass reversal', _stripe_event_id,
              jsonb_build_object('grant_id', grant_row.id, 'reason', _reason));
    END IF;

    IF tokens_to_debit > 0 THEN
      UPDATE public.profiles
         SET boost_tokens_balance = GREATEST(COALESCE(boost_tokens_balance,0) - tokens_to_debit, 0)
       WHERE id = grant_row.user_id;
      INSERT INTO public.boost_tokens_ledger (user_id, delta, reason, metadata)
      VALUES (grant_row.user_id, -tokens_to_debit, 'royal_reversal',
              jsonb_build_object('grant_id', grant_row.id, 'stripe_event_id', _stripe_event_id, 'reason', _reason));
    END IF;

    IF grant_row.founder_granted THEN
      PERFORM public.revoke_royal_founder(grant_row.user_id, _reason, _stripe_event_id, NULL);
      founder_revoked := true;
    END IF;

    UPDATE public.royal_pass_grants
       SET status = _new_status,
           reversed_at = now(),
           reversed_reason = _reason,
           reversal_stripe_event_id = _stripe_event_id,
           reversal_completed_at = now(),
           reversal_source_event_id = _stripe_event_id,
           shields_reversed = shields_disabled,
           shekels_reversed = shekels_to_debit,
           boost_tokens_reversed = tokens_to_debit,
           active_shields_reversed = active_shields_deactivated,
           founder_reversed = founder_revoked,
           promo_shekels_remaining = promo_shekels_remaining - shekels_to_debit,
           promo_boost_tokens_remaining = promo_boost_tokens_remaining - tokens_to_debit
     WHERE id = grant_row.id;

    INSERT INTO public.royal_pass_reversals (
      royal_pass_grant_id, user_id, event_kind, stripe_event_id, stripe_event_type,
      stripe_dispute_id, reason, shields_delta, shekels_delta, boost_tokens_delta,
      active_shields_delta, founder_touched, boost_ids, details)
    VALUES (
      grant_row.id, grant_row.user_id, 'reversal', _stripe_event_id, _reason,
      grant_row.stripe_dispute_id, _reason,
      shields_disabled, shekels_to_debit, tokens_to_debit,
      active_shields_deactivated, founder_revoked, active_shield_ids,
      jsonb_build_object(
        'stripe_invoice_id', grant_row.stripe_invoice_id,
        'stripe_payment_intent_id', grant_row.stripe_payment_intent_id,
        'stripe_charge_id', grant_row.stripe_charge_id,
        'new_status', _new_status));
  ELSE
    UPDATE public.royal_pass_grants
       SET status = _new_status,
           reversed_reason = _reason,
           reversal_stripe_event_id = _stripe_event_id
     WHERE id = grant_row.id;
  END IF;

  INSERT INTO public.admin_audit_log (actor_id, action, target_type, target_id, details)
  VALUES (
    NULL, 'royal_grant_' || _new_status, 'royal_pass_grant', grant_row.id::text,
    jsonb_build_object(
      'actor_type', 'stripe_webhook',
      'stripe_event_id', _stripe_event_id, 'reason', _reason,
      'user_id', grant_row.user_id,
      'shields_disabled', shields_disabled,
      'active_shields_deactivated', active_shields_deactivated,
      'boost_tokens_debited', tokens_to_debit,
      'shekels_debited', shekels_to_debit,
      'founder_revoked', founder_revoked));

  RETURN jsonb_build_object('ok', true, 'grant_id', grant_row.id, 'new_status', _new_status,
    'shields_disabled', shields_disabled,
    'active_shields_deactivated', active_shields_deactivated,
    'boost_tokens_debited', tokens_to_debit,
    'shekels_debited', shekels_to_debit,
    'founder_revoked', founder_revoked);
END; $function$;

REVOKE ALL ON FUNCTION public.handle_royal_refund(text,text,text,text,text,text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.handle_royal_refund(text,text,text,text,text,text) TO service_role;

-- Exact restoration
CREATE OR REPLACE FUNCTION public.handle_royal_dispute_reinstated(
  _stripe_event_id text,
  _stripe_invoice_id text DEFAULT NULL::text,
  _stripe_payment_intent_id text DEFAULT NULL::text,
  _stripe_charge_id text DEFAULT NULL::text,
  _stripe_dispute_id text DEFAULT NULL::text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  grant_row record; cfg record; restored_founder boolean := false; fg record;
  shields_to_restore int := 0;
  shekels_to_restore int := 0;
  tokens_to_restore int := 0;
  reversal_row record;
  bid uuid; b record;
  reactivated_ids uuid[] := ARRAY[]::uuid[];
  allowance_credits_restored int := 0;
BEGIN
  SELECT * INTO grant_row FROM public.royal_pass_grants
   WHERE (_stripe_dispute_id        IS NOT NULL AND stripe_dispute_id        = _stripe_dispute_id)
      OR (_stripe_invoice_id        IS NOT NULL AND stripe_invoice_id        = _stripe_invoice_id)
      OR (_stripe_payment_intent_id IS NOT NULL AND stripe_payment_intent_id = _stripe_payment_intent_id)
      OR (_stripe_charge_id         IS NOT NULL AND stripe_charge_id         = _stripe_charge_id)
   ORDER BY created_at DESC LIMIT 1
   FOR UPDATE;

  IF grant_row.id IS NULL THEN
    RETURN jsonb_build_object('ok', true, 'no_grant_found', true);
  END IF;

  IF grant_row.status = 'refunded' THEN
    RETURN jsonb_build_object('ok', true, 'skipped_refunded', true, 'grant_id', grant_row.id);
  END IF;

  IF grant_row.stripe_dispute_id IS NOT NULL THEN
    IF _stripe_dispute_id IS NULL OR _stripe_dispute_id <> grant_row.stripe_dispute_id THEN
      RETURN jsonb_build_object('ok', true, 'dispute_mismatch', true, 'grant_id', grant_row.id);
    END IF;
  END IF;

  IF grant_row.status = 'granted' AND grant_row.dispute_status IN ('won','funds_reinstated') THEN
    RETURN jsonb_build_object('ok', true, 'already_restored', true, 'grant_id', grant_row.id);
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.royal_pass_reversals
     WHERE royal_pass_grant_id = grant_row.id
       AND event_kind = 'restoration'
       AND stripe_event_id = _stripe_event_id
  ) THEN
    RETURN jsonb_build_object('ok', true, 'already_restored', true, 'grant_id', grant_row.id);
  END IF;

  SELECT * INTO reversal_row FROM public.royal_pass_reversals
   WHERE royal_pass_grant_id = grant_row.id AND event_kind = 'reversal'
   ORDER BY created_at DESC LIMIT 1;

  IF reversal_row.id IS NOT NULL THEN
    shields_to_restore := reversal_row.shields_delta;
    shekels_to_restore := reversal_row.shekels_delta;
    tokens_to_restore  := reversal_row.boost_tokens_delta;
  END IF;

  IF shields_to_restore > 0 THEN
    UPDATE public.royal_pass_shield_allowances
       SET shields_used = GREATEST(shields_used - shields_to_restore, 0),
           updated_at = now()
     WHERE royal_pass_grant_id = grant_row.id;
  END IF;

  IF reversal_row.id IS NOT NULL AND array_length(reversal_row.boost_ids, 1) > 0 THEN
    FOREACH bid IN ARRAY reversal_row.boost_ids LOOP
      SELECT * INTO b FROM public.boosts WHERE id = bid;
      IF b.id IS NULL THEN CONTINUE; END IF;
      IF b.expires_at IS NOT NULL AND b.expires_at > now() THEN
        PERFORM set_config('lovable.boost_sync', '1', true);
        UPDATE public.boosts SET active = true WHERE id = bid;
        PERFORM set_config('lovable.boost_sync', '0', true);
        reactivated_ids := reactivated_ids || bid;
      ELSE
        UPDATE public.royal_pass_shield_allowances
           SET shields_used = GREATEST(shields_used - 1, 0),
               updated_at = now()
         WHERE royal_pass_grant_id = grant_row.id;
        allowance_credits_restored := allowance_credits_restored + 1;
      END IF;
    END LOOP;
  END IF;

  IF shekels_to_restore > 0 THEN
    UPDATE public.wallets
       SET shekel_balance = shekel_balance + shekels_to_restore,
           updated_at = now()
     WHERE user_id = grant_row.user_id;
    INSERT INTO public.shekel_ledger (user_id, kind, shekels_delta, label, stripe_event_id, metadata)
    VALUES (grant_row.user_id, 'royal_reinstate', shekels_to_restore,
            'Royal Pass reinstatement', _stripe_event_id,
            jsonb_build_object('grant_id', grant_row.id));
  END IF;

  IF tokens_to_restore > 0 THEN
    UPDATE public.profiles
       SET boost_tokens_balance = COALESCE(boost_tokens_balance,0) + tokens_to_restore
     WHERE id = grant_row.user_id;
    INSERT INTO public.boost_tokens_ledger (user_id, delta, reason, metadata)
    VALUES (grant_row.user_id, tokens_to_restore, 'royal_reinstate',
            jsonb_build_object('grant_id', grant_row.id, 'stripe_event_id', _stripe_event_id));
  END IF;

  UPDATE public.royal_pass_grants
     SET status = COALESCE(pre_dispute_status, 'granted'),
         dispute_status = 'funds_reinstated',
         dispute_resolved_at = now(),
         reversed_at = NULL,
         reversed_reason = NULL,
         restoration_completed_at = now(),
         restoration_source_event_id = _stripe_event_id,
         promo_shekels_remaining = promo_shekels_remaining + shekels_to_restore,
         promo_boost_tokens_remaining = promo_boost_tokens_remaining + tokens_to_restore
   WHERE id = grant_row.id;

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
             revoked_at = NULL, revoked_reason = NULL, revoked_stripe_event_id = NULL,
             dispute_resolved_at = now(),
             metadata = metadata || jsonb_build_object(
               'lifecycle_event', jsonb_build_object(
                 'mode','reactivate','stripe_event_id',_stripe_event_id,
                 'stripe_dispute_id',_stripe_dispute_id,'at',now()))
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

  INSERT INTO public.royal_pass_reversals (
    royal_pass_grant_id, user_id, event_kind, stripe_event_id, stripe_event_type,
    stripe_dispute_id, reason, shields_delta, shekels_delta, boost_tokens_delta,
    active_shields_delta, founder_touched, boost_ids, details)
  VALUES (
    grant_row.id, grant_row.user_id, 'restoration', _stripe_event_id, 'reinstated',
    _stripe_dispute_id, 'dispute_reinstated',
    shields_to_restore, shekels_to_restore, tokens_to_restore,
    COALESCE(array_length(reactivated_ids, 1), 0), restored_founder, reactivated_ids,
    jsonb_build_object(
      'allowance_credits_restored_from_expired', allowance_credits_restored,
      'source_reversal_id', reversal_row.id));

  INSERT INTO public.admin_audit_log (actor_id, action, target_type, target_id, details)
  VALUES (
    NULL, 'royal_grant_reinstated', 'royal_pass_grant', grant_row.id::text,
    jsonb_build_object(
      'actor_type','stripe_webhook',
      'stripe_event_id',_stripe_event_id,
      'stripe_dispute_id',_stripe_dispute_id,
      'user_id',grant_row.user_id,
      'shields_restored', shields_to_restore,
      'shekels_restored', shekels_to_restore,
      'boost_tokens_restored', tokens_to_restore,
      'active_shields_reactivated', COALESCE(array_length(reactivated_ids, 1), 0),
      'expired_shields_converted', allowance_credits_restored,
      'restored_founder', restored_founder));

  RETURN jsonb_build_object('ok', true, 'grant_id', grant_row.id,
    'restored_founder', restored_founder,
    'shields_restored', shields_to_restore,
    'shekels_restored', shekels_to_restore,
    'boost_tokens_restored', tokens_to_restore,
    'active_shields_reactivated', COALESCE(array_length(reactivated_ids, 1), 0),
    'expired_shields_converted_to_credits', allowance_credits_restored);
END; $function$;

REVOKE ALL ON FUNCTION public.handle_royal_dispute_reinstated(text,text,text,text,text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.handle_royal_dispute_reinstated(text,text,text,text,text) TO service_role;

-- use_royal_shield — link boost to grant + allowance
CREATE OR REPLACE FUNCTION public.use_royal_shield(_post_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  uid uuid := auth.uid();
  royal_active bool;
  post_owner uuid;
  post_removed bool;
  crown_row_id uuid;
  allow record;
  linked_grant_status text;
  existing_shield record;
  new_boost_id uuid;
BEGIN
  IF uid IS NULL THEN RETURN jsonb_build_object('error','unauthenticated'); END IF;
  royal_active := public.is_royal_pass_active(uid);
  IF NOT royal_active THEN RETURN jsonb_build_object('error','no_active_royal_pass'); END IF;

  SELECT p.user_id, COALESCE(p.is_removed, false) INTO post_owner, post_removed
    FROM public.posts p WHERE p.id = _post_id;
  IF post_owner IS NULL THEN RETURN jsonb_build_object('error','post_not_found'); END IF;
  IF post_removed THEN RETURN jsonb_build_object('error','post_removed'); END IF;
  IF post_owner <> uid THEN RETURN jsonb_build_object('error','not_post_owner'); END IF;

  SELECT c.id INTO crown_row_id FROM public.crowns c
   WHERE c.post_id = _post_id AND c.user_id = uid AND c.active = true LIMIT 1;
  IF crown_row_id IS NULL THEN RETURN jsonb_build_object('error','no_active_crown'); END IF;

  SELECT b.id, b.expires_at, b.source INTO existing_shield
    FROM public.boosts b
   WHERE b.post_id = _post_id
     AND b.boost_type = 'crown_shield'
     AND b.active = true
     AND (b.expires_at IS NULL OR b.expires_at > now())
   ORDER BY b.expires_at DESC NULLS LAST LIMIT 1;
  IF existing_shield.id IS NOT NULL THEN
    RETURN jsonb_build_object('error','already_shielded',
      'expires_at', existing_shield.expires_at, 'source', existing_shield.source);
  END IF;

  SELECT * INTO allow FROM public.royal_pass_shield_allowances a
   WHERE a.user_id = uid AND a.period_end > now()
   ORDER BY a.period_end DESC LIMIT 1 FOR UPDATE;
  IF allow IS NULL THEN RETURN jsonb_build_object('error','no_allowance'); END IF;

  IF allow.royal_pass_grant_id IS NULL THEN
    RETURN jsonb_build_object('error','royal_allowance_not_linked');
  END IF;

  SELECT g.status INTO linked_grant_status
    FROM public.royal_pass_grants g WHERE g.id = allow.royal_pass_grant_id;
  IF linked_grant_status IS NULL THEN
    RETURN jsonb_build_object('error','royal_allowance_not_linked');
  END IF;
  IF linked_grant_status <> 'granted' THEN
    RETURN jsonb_build_object('error','royal_benefits_temporarily_suspended',
      'grant_status', linked_grant_status);
  END IF;

  IF allow.shields_used >= allow.shields_granted THEN
    RETURN jsonb_build_object('error','no_shields_remaining');
  END IF;

  UPDATE public.royal_pass_shield_allowances a
     SET shields_used = a.shields_used + 1, updated_at = now()
   WHERE a.id = allow.id;

  INSERT INTO public.boosts
    (user_id, post_id, boost_type, active, started_at, expires_at, source,
     royal_pass_grant_id, royal_pass_shield_allowance_id)
  VALUES (uid, _post_id, 'crown_shield', true, now(), now() + interval '24 hours', 'royal_pass',
          allow.royal_pass_grant_id, allow.id)
  RETURNING id INTO new_boost_id;

  RETURN jsonb_build_object('ok', true, 'boost_id', new_boost_id,
    'shields_used', allow.shields_used + 1,
    'shields_granted', allow.shields_granted,
    'expires_at', (now() + interval '24 hours'));
END; $function$;
