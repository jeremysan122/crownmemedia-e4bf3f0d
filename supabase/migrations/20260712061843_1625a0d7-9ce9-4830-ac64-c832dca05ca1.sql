
-- 1. Gift bridge: INSERT or UPDATE OF status → completed
CREATE OR REPLACE FUNCTION public.trg_gift_transactions_to_shekel_ledger()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  -- Only debit when the row enters the terminal successful state.
  -- Real allowed status values in gift_transactions: 'completed' only (verified at runtime).
  IF NEW.status <> 'completed' THEN
    RETURN NEW;
  END IF;

  -- On UPDATE: only fire the debit exactly once, on the transition into 'completed'.
  IF TG_OP = 'UPDATE' AND OLD.status = 'completed' THEN
    RETURN NEW;
  END IF;

  IF NEW.sender_id IS NULL OR NEW.total_shekels IS NULL OR NEW.total_shekels <= 0 THEN
    RETURN NEW;
  END IF;

  INSERT INTO public.shekel_ledger(user_id, kind, shekels_delta, label, reference_id, metadata)
  VALUES (
    NEW.sender_id,
    'gift_send',
    -NEW.total_shekels::int,
    'Gift sent',
    NEW.id,
    jsonb_build_object(
      'gift_transaction_id', NEW.id,
      'gift_id',             NEW.gift_id,
      'gift_name',           NEW.gift_name,
      'quantity',            NEW.quantity,
      'receiver_id',         NEW.receiver_id,
      'receiver_earnings_shekels', NEW.receiver_earnings_shekels
    )
  )
  ON CONFLICT DO NOTHING;
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_gift_tx_to_shekel_ledger ON public.gift_transactions;
CREATE TRIGGER trg_gift_tx_to_shekel_ledger
AFTER INSERT OR UPDATE OF status ON public.gift_transactions
FOR EACH ROW EXECUTE FUNCTION public.trg_gift_transactions_to_shekel_ledger();

-- 2. Canonical shield resync helper
CREATE OR REPLACE FUNCTION public.recalculate_post_crown_shield_until(_post_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  new_until timestamptz;
BEGIN
  IF _post_id IS NULL THEN RETURN; END IF;

  SELECT MAX(expires_at)
    INTO new_until
    FROM public.boosts
   WHERE post_id = _post_id
     AND boost_type = 'crown_shield'
     AND active = true
     AND (expires_at IS NULL OR expires_at > now());

  -- Enable controlled bypass ONLY around the canonical post write.
  PERFORM set_config('lovable.boost_sync', '1', true);
  UPDATE public.posts
     SET crown_shield_until = new_until
   WHERE id = _post_id
     AND crown_shield_until IS DISTINCT FROM new_until;
  PERFORM set_config('lovable.boost_sync', '0', true);
END;
$function$;

REVOKE ALL ON FUNCTION public.recalculate_post_crown_shield_until(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.recalculate_post_crown_shield_until(uuid) TO service_role;

-- 3. Spendable balance helpers (source-aware)
CREATE OR REPLACE FUNCTION public.suspended_royal_shekels(_user_id uuid)
 RETURNS integer
 LANGUAGE sql
 STABLE
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT COALESCE(SUM(GREATEST(COALESCE(promo_shekels_remaining, 0), 0)), 0)::int
    FROM public.royal_pass_grants
   WHERE user_id = _user_id
     AND (
       status IN ('disputed', 'funds_withdrawn')
       OR (status IN ('reversed', 'refunded') AND COALESCE(needs_reconciliation, false) = true)
     );
$function$;

CREATE OR REPLACE FUNCTION public.suspended_royal_boost_tokens(_user_id uuid)
 RETURNS integer
 LANGUAGE sql
 STABLE
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT COALESCE(SUM(GREATEST(COALESCE(promo_boost_tokens_remaining, 0), 0)), 0)::int
    FROM public.royal_pass_grants
   WHERE user_id = _user_id
     AND (
       status IN ('disputed', 'funds_withdrawn')
       OR (status IN ('reversed', 'refunded') AND COALESCE(needs_reconciliation, false) = true)
     );
$function$;

CREATE OR REPLACE FUNCTION public.spendable_shekels(_user_id uuid)
 RETURNS integer
 LANGUAGE sql
 STABLE
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT GREATEST(
    COALESCE((SELECT shekel_balance FROM public.wallets WHERE user_id = _user_id), 0)
    - public.suspended_royal_shekels(_user_id),
    0
  )::int;
$function$;

CREATE OR REPLACE FUNCTION public.spendable_boost_tokens(_user_id uuid)
 RETURNS integer
 LANGUAGE sql
 STABLE
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT GREATEST(
    COALESCE((SELECT boost_tokens_balance FROM public.profiles WHERE id = _user_id), 0)
    - public.suspended_royal_boost_tokens(_user_id),
    0
  )::int;
$function$;

REVOKE ALL ON FUNCTION public.suspended_royal_shekels(uuid), public.suspended_royal_boost_tokens(uuid),
                     public.spendable_shekels(uuid), public.spendable_boost_tokens(uuid)
FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.suspended_royal_shekels(uuid), public.suspended_royal_boost_tokens(uuid),
                        public.spendable_shekels(uuid), public.spendable_boost_tokens(uuid)
TO authenticated, service_role;

-- 4. handle_royal_refund: fix admin_alerts column names + use canonical shield helper.
--    Rewriting only the two affected blocks by CREATE OR REPLACE with the full body.
CREATE OR REPLACE FUNCTION public.handle_royal_refund(
  _stripe_event_id text,
  _reason text,
  _stripe_invoice_id text DEFAULT NULL::text,
  _stripe_payment_intent_id text DEFAULT NULL::text,
  _stripe_charge_id text DEFAULT NULL::text,
  _new_status text DEFAULT 'reversed'::text
)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  grant_row record;
  wallet_balance int := 0;
  bt_balance int := 0;
  shekels_intended int := 0;
  tokens_intended int := 0;
  shekels_actual int := 0;
  tokens_actual int := 0;
  unrec_shekels int := 0;
  unrec_tokens int := 0;
  active_shield_ids uuid[] := ARRAY[]::uuid[];
  active_shields_deactivated int := 0;
  founder_revoked boolean := false;
  affected_posts uuid[];
  _pid uuid;
  reconcile boolean := false;
  reconcile_reasons text[] := ARRAY[]::text[];
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
    RETURN jsonb_build_object('error','grant_not_found','stripe_event_id',_stripe_event_id);
  END IF;

  -- Idempotency: if already at this terminal state and same reversal source, no-op.
  IF grant_row.status = _new_status
     AND grant_row.reversal_source_event_id = _stripe_event_id THEN
    RETURN jsonb_build_object('ok', true, 'already_processed', true, 'grant_id', grant_row.id);
  END IF;

  -- Lock wallet + profile
  SELECT COALESCE(shekel_balance, 0) INTO wallet_balance
    FROM public.wallets WHERE user_id = grant_row.user_id FOR UPDATE;
  SELECT COALESCE(boost_tokens_balance, 0) INTO bt_balance
    FROM public.profiles WHERE id = grant_row.user_id FOR UPDATE;

  -- Deactivate Royal shields linked to this grant and resync each affected post via canonical helper.
  SELECT COALESCE(array_agg(id ORDER BY started_at), ARRAY[]::uuid[]),
         COALESCE(array_agg(DISTINCT post_id) FILTER (WHERE post_id IS NOT NULL), ARRAY[]::uuid[])
    INTO active_shield_ids, affected_posts
    FROM public.boosts
   WHERE royal_pass_grant_id = grant_row.id
     AND boost_type = 'crown_shield'
     AND active = true
     AND (expires_at IS NULL OR expires_at > now());
  active_shields_deactivated := COALESCE(array_length(active_shield_ids, 1), 0);

  IF active_shields_deactivated > 0 THEN
    PERFORM set_config('lovable.boost_sync', '1', true);
    UPDATE public.boosts SET active = false WHERE id = ANY(active_shield_ids);
    PERFORM set_config('lovable.boost_sync', '0', true);

    FOREACH _pid IN ARRAY affected_posts LOOP
      PERFORM public.recalculate_post_crown_shield_until(_pid);
    END LOOP;
  END IF;

  shekels_intended := COALESCE(grant_row.promo_shekels_remaining, 0);
  tokens_intended  := COALESCE(grant_row.promo_boost_tokens_remaining, 0);

  -- All-or-nothing wallet shortage rule (Shekels)
  IF shekels_intended > 0 THEN
    IF wallet_balance >= shekels_intended THEN
      shekels_actual := shekels_intended;
      UPDATE public.wallets
         SET shekel_balance = shekel_balance - shekels_actual,
             updated_at = now()
       WHERE user_id = grant_row.user_id;
      INSERT INTO public.shekel_ledger(user_id, kind, shekels_delta, label, reference_id, metadata)
      VALUES (grant_row.user_id, 'royal_reversal', -shekels_actual,
              'Royal grant reversed', grant_row.id,
              jsonb_build_object('reason', _reason, 'stripe_event_id', _stripe_event_id))
      ON CONFLICT DO NOTHING;
    ELSE
      shekels_actual := 0;
      unrec_shekels := shekels_intended;
      reconcile := true;
      reconcile_reasons := reconcile_reasons || 'wallet_shortage_shekels';
    END IF;
  END IF;

  -- All-or-nothing rule (Boost tokens)
  IF tokens_intended > 0 THEN
    IF bt_balance >= tokens_intended THEN
      tokens_actual := tokens_intended;
      UPDATE public.profiles
         SET boost_tokens_balance = boost_tokens_balance - tokens_actual
       WHERE id = grant_row.user_id;
      INSERT INTO public.boost_tokens_ledger(user_id, kind, tokens_delta, label, reference_id, metadata)
      VALUES (grant_row.user_id, 'royal_reversal', -tokens_actual,
              'Royal grant reversed (tokens)', grant_row.id,
              jsonb_build_object('reason', _reason, 'stripe_event_id', _stripe_event_id))
      ON CONFLICT DO NOTHING;
    ELSE
      tokens_actual := 0;
      unrec_tokens := tokens_intended;
      reconcile := true;
      reconcile_reasons := reconcile_reasons || 'wallet_shortage_boost_tokens';
    END IF;
  END IF;

  -- Founder revoke (if this grant conferred founder)
  IF COALESCE(grant_row.founder_granted, false) = true THEN
    PERFORM public.revoke_royal_founder(grant_row.user_id, grant_row.id, _reason, 'permanent');
    founder_revoked := true;
  END IF;

  UPDATE public.royal_pass_grants
     SET status = _new_status,
         reversed_at = now(),
         reversed_reason = _reason,
         reversal_stripe_event_id = _stripe_event_id,
         reversal_source_event_id = _stripe_event_id,
         reversal_completed_at = now(),
         shekels_reversed = shekels_actual,
         boost_tokens_reversed = tokens_actual,
         active_shields_reversed = active_shields_deactivated,
         founder_reversed = founder_revoked,
         unrecovered_promotional_shekels = unrec_shekels,
         unrecovered_promotional_boost_tokens = unrec_tokens,
         needs_reconciliation = reconcile,
         reconciliation_reason = CASE WHEN reconcile THEN array_to_string(reconcile_reasons, ',') ELSE NULL END
   WHERE id = grant_row.id;

  IF reconcile THEN
    -- FIXED: real admin_alerts columns are (category, severity, title, body, metadata).
    INSERT INTO public.admin_alerts (category, severity, title, body, metadata)
    VALUES (
      'royal_grant_needs_reconciliation',
      'high',
      'Royal grant needs reconciliation',
      format('Grant %s for user %s could not be fully reversed. Unrecovered: %s shekels, %s boost tokens.',
             grant_row.id, grant_row.user_id, unrec_shekels, unrec_tokens),
      jsonb_build_object(
        'grant_id', grant_row.id,
        'user_id', grant_row.user_id,
        'stripe_event_id', _stripe_event_id,
        'unrecovered_shekels', unrec_shekels,
        'unrecovered_boost_tokens', unrec_tokens,
        'wallet_balance_shekels', wallet_balance,
        'wallet_balance_boost_tokens', bt_balance,
        'reasons', reconcile_reasons)
    );
  END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'grant_id', grant_row.id,
    'new_status', _new_status,
    'shekels_reversed', shekels_actual,
    'boost_tokens_reversed', tokens_actual,
    'active_shields_reversed', active_shields_deactivated,
    'founder_reversed', founder_revoked,
    'unrecovered_shekels', unrec_shekels,
    'unrecovered_boost_tokens', unrec_tokens,
    'needs_reconciliation', reconcile);
END;
$function$;

REVOKE ALL ON FUNCTION public.handle_royal_refund(text,text,text,text,text,text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.handle_royal_refund(text,text,text,text,text,text) TO service_role;

-- 5. Reinstatement guard: refuse auto-restore for grants flagged needs_reconciliation.
--    We wrap the existing behaviour with a pre-check.
CREATE OR REPLACE FUNCTION public.handle_royal_dispute_reinstated(
  _stripe_event_id text,
  _stripe_dispute_id text,
  _stripe_charge_id text DEFAULT NULL::text,
  _stripe_payment_intent_id text DEFAULT NULL::text
)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  grant_row record;
BEGIN
  SELECT * INTO grant_row FROM public.royal_pass_grants
   WHERE (_stripe_charge_id IS NOT NULL AND stripe_charge_id = _stripe_charge_id)
      OR (_stripe_payment_intent_id IS NOT NULL AND stripe_payment_intent_id = _stripe_payment_intent_id)
   ORDER BY created_at DESC LIMIT 1
   FOR UPDATE;

  IF grant_row.id IS NULL THEN
    RETURN jsonb_build_object('error','grant_not_found','stripe_event_id',_stripe_event_id);
  END IF;

  -- Strict dispute id match if a dispute id is on record
  IF grant_row.stripe_dispute_id IS NOT NULL
     AND (_stripe_dispute_id IS NULL OR _stripe_dispute_id <> grant_row.stripe_dispute_id) THEN
    RETURN jsonb_build_object('error','dispute_mismatch','grant_id',grant_row.id);
  END IF;

  IF grant_row.status = 'refunded' THEN
    RETURN jsonb_build_object('ok', true, 'skipped_refunded', true, 'grant_id', grant_row.id);
  END IF;

  -- NEW: guard needs_reconciliation grants from auto-restore
  IF COALESCE(grant_row.needs_reconciliation, false) = true THEN
    INSERT INTO public.admin_alerts (category, severity, title, body, metadata)
    VALUES (
      'royal_reinstatement_blocked',
      'high',
      'Reinstatement blocked: grant needs manual reconciliation',
      format('Grant %s cannot be auto-reinstated because it has unresolved reconciliation.', grant_row.id),
      jsonb_build_object(
        'grant_id', grant_row.id,
        'user_id', grant_row.user_id,
        'stripe_event_id', _stripe_event_id,
        'stripe_dispute_id', _stripe_dispute_id,
        'unrecovered_shekels', grant_row.unrecovered_promotional_shekels,
        'unrecovered_boost_tokens', grant_row.unrecovered_promotional_boost_tokens
      )
    );
    RETURN jsonb_build_object(
      'error', 'needs_manual_reconciliation',
      'grant_id', grant_row.id,
      'unrecovered_shekels', grant_row.unrecovered_promotional_shekels,
      'unrecovered_boost_tokens', grant_row.unrecovered_promotional_boost_tokens
    );
  END IF;

  -- Idempotent restoration by source event id
  IF grant_row.restoration_source_event_id = _stripe_event_id THEN
    RETURN jsonb_build_object('ok', true, 'already_processed', true, 'grant_id', grant_row.id);
  END IF;

  -- Only restore Shekels/tokens/shields we actually reversed.
  IF COALESCE(grant_row.shekels_reversed, 0) > 0 THEN
    UPDATE public.wallets
       SET shekel_balance = shekel_balance + grant_row.shekels_reversed,
           updated_at = now()
     WHERE user_id = grant_row.user_id;
    INSERT INTO public.shekel_ledger(user_id, kind, shekels_delta, label, reference_id, metadata)
    VALUES (grant_row.user_id, 'royal_reinstatement', grant_row.shekels_reversed,
            'Royal grant reinstated', grant_row.id,
            jsonb_build_object('stripe_event_id', _stripe_event_id, 'stripe_dispute_id', _stripe_dispute_id))
    ON CONFLICT DO NOTHING;
  END IF;

  IF COALESCE(grant_row.boost_tokens_reversed, 0) > 0 THEN
    UPDATE public.profiles
       SET boost_tokens_balance = boost_tokens_balance + grant_row.boost_tokens_reversed
     WHERE id = grant_row.user_id;
    INSERT INTO public.boost_tokens_ledger(user_id, kind, tokens_delta, label, reference_id, metadata)
    VALUES (grant_row.user_id, 'royal_reinstatement', grant_row.boost_tokens_reversed,
            'Royal grant reinstated (tokens)', grant_row.id,
            jsonb_build_object('stripe_event_id', _stripe_event_id, 'stripe_dispute_id', _stripe_dispute_id))
    ON CONFLICT DO NOTHING;
  END IF;

  IF COALESCE(grant_row.founder_reversed, false) = true THEN
    UPDATE public.founder_grants
       SET status = 'active'
     WHERE royal_pass_grant_id = grant_row.id
       AND status <> 'refunded';
  END IF;

  UPDATE public.royal_pass_grants
     SET status = COALESCE(pre_dispute_status, 'granted'),
         restoration_completed_at = now(),
         restoration_source_event_id = _stripe_event_id
   WHERE id = grant_row.id;

  RETURN jsonb_build_object(
    'ok', true,
    'grant_id', grant_row.id,
    'shekels_restored', COALESCE(grant_row.shekels_reversed, 0),
    'boost_tokens_restored', COALESCE(grant_row.boost_tokens_reversed, 0),
    'founder_restored', COALESCE(grant_row.founder_reversed, false));
END;
$function$;

REVOKE ALL ON FUNCTION public.handle_royal_dispute_reinstated(text,text,text,text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.handle_royal_dispute_reinstated(text,text,text,text) TO service_role;

-- 6. Source-linked gift spend allocations table
CREATE TABLE IF NOT EXISTS public.gift_spend_allocations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  gift_transaction_id uuid NOT NULL REFERENCES public.gift_transactions(id) ON DELETE RESTRICT,
  user_id uuid NOT NULL,
  royal_pass_grant_id uuid REFERENCES public.royal_pass_grants(id) ON DELETE RESTRICT,
  promo_shekels_consumed integer NOT NULL DEFAULT 0,
  purchased_shekels_consumed integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_gift_spend_allocations_tx ON public.gift_spend_allocations(gift_transaction_id);
CREATE INDEX IF NOT EXISTS idx_gift_spend_allocations_grant ON public.gift_spend_allocations(royal_pass_grant_id);

GRANT SELECT ON public.gift_spend_allocations TO authenticated;
GRANT ALL ON public.gift_spend_allocations TO service_role;

ALTER TABLE public.gift_spend_allocations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users see own gift allocations"
  ON public.gift_spend_allocations FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Service role manages gift allocations"
  ON public.gift_spend_allocations FOR ALL
  TO service_role
  USING (true) WITH CHECK (true);
