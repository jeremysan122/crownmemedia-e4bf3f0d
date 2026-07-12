
-- =========================================================================
-- Wave 8.2b patch — blockers 1-8
-- =========================================================================

-- 1. Drop duplicate promo-consumption triggers -----------------------------
DROP TRIGGER IF EXISTS trg_shekel_ledger_consume_promo ON public.shekel_ledger;
DROP TRIGGER IF EXISTS trg_boost_tokens_ledger_consume_promo ON public.boost_tokens_ledger;

-- 2. Drop duplicate gift bridge trigger ------------------------------------
DROP TRIGGER IF EXISTS gift_transactions_bridge_ledger ON public.gift_transactions;

-- 5. Drop overlapping profile-protection trigger + its function ------------
--    Referenced nonexistent columns (is_royal, royal_pass_expires_at) and
--    threw raw exceptions; canonical guard silently preserves fields.
DROP TRIGGER IF EXISTS trg_protect_profile_fields ON public.profiles;
DROP FUNCTION IF EXISTS public.protect_profile_fields();

-- 3. Rewrite gift bridge to use real columns + idempotency -----------------
CREATE OR REPLACE FUNCTION public.trg_gift_transactions_to_shekel_ledger()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  -- Records the sender's Shekel outflow so promo consumption sees it.
  -- Uses gift_transactions.total_shekels (real column). receiver_id (real column).
  IF NEW.sender_id IS NOT NULL
     AND NEW.total_shekels IS NOT NULL
     AND NEW.total_shekels > 0
     AND COALESCE(NEW.status, 'completed') NOT IN ('failed','pending','refunded') THEN
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
  END IF;
  RETURN NEW;
END;
$function$;

-- Idempotency for the bridge: exactly one gift_send row per gift_transaction.
CREATE UNIQUE INDEX IF NOT EXISTS ux_shekel_ledger_gift_send_ref
  ON public.shekel_ledger(reference_id)
  WHERE kind = 'gift_send' AND reference_id IS NOT NULL;

-- 4. Promo-consumption: status = 'granted' only ----------------------------
CREATE OR REPLACE FUNCTION public.trg_consume_royal_promo_shekels()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  need int; take int; g record;
BEGIN
  -- Only debits (negative delta) trigger consumption.
  IF NEW.shekels_delta >= 0 THEN RETURN NEW; END IF;
  -- Never consume promo balance on Royal-managed ledger kinds.
  IF NEW.kind IN ('royal_monthly','royal_reversal','royal_reinstate') THEN
    RETURN NEW;
  END IF;

  need := -NEW.shekels_delta;
  FOR g IN
    SELECT id, promo_shekels_remaining
      FROM public.royal_pass_grants
     WHERE user_id = NEW.user_id
       AND status = 'granted'                 -- disputed/withdrawn/reversed excluded
       AND promo_shekels_remaining > 0
     ORDER BY created_at ASC
     FOR UPDATE
  LOOP
    EXIT WHEN need <= 0;
    take := LEAST(g.promo_shekels_remaining, need);
    UPDATE public.royal_pass_grants
       SET promo_shekels_remaining = promo_shekels_remaining - take
     WHERE id = g.id;
    need := need - take;
  END LOOP;
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.trg_consume_royal_promo_boost_tokens()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  need int; take int; g record;
BEGIN
  IF NEW.delta >= 0 THEN RETURN NEW; END IF;
  IF NEW.reason IN ('royal_monthly','royal_reversal','royal_reinstate') THEN
    RETURN NEW;
  END IF;

  need := -NEW.delta;
  FOR g IN
    SELECT id, promo_boost_tokens_remaining
      FROM public.royal_pass_grants
     WHERE user_id = NEW.user_id
       AND status = 'granted'
       AND promo_boost_tokens_remaining > 0
     ORDER BY created_at ASC
     FOR UPDATE
  LOOP
    EXIT WHEN need <= 0;
    take := LEAST(g.promo_boost_tokens_remaining, need);
    UPDATE public.royal_pass_grants
       SET promo_boost_tokens_remaining = promo_boost_tokens_remaining - take
     WHERE id = g.id;
    need := need - take;
  END LOOP;
  RETURN NEW;
END;
$function$;

-- 7. Reconciliation columns on grants --------------------------------------
ALTER TABLE public.royal_pass_grants
  ADD COLUMN IF NOT EXISTS needs_reconciliation boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS reconciliation_reason text;

-- 7. Wallet-shortage: refund debits nothing when wallet < promo -----------
CREATE OR REPLACE FUNCTION public.handle_royal_refund(
  _stripe_event_id text,
  _reason text,
  _stripe_invoice_id text DEFAULT NULL,
  _stripe_payment_intent_id text DEFAULT NULL,
  _stripe_charge_id text DEFAULT NULL,
  _new_status text DEFAULT 'reversed'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  grant_row record; allowance_row record;
  wallet_balance int := 0;
  bt_balance int := 0;
  shields_disabled int := 0;
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
    RETURN jsonb_build_object('ok', true, 'no_grant_found', true);
  END IF;

  IF grant_row.legacy_unreconciled AND _new_status IN ('reversed','refunded') THEN
    RETURN jsonb_build_object('ok', true, 'skipped_legacy_unreconciled', true, 'grant_id', grant_row.id);
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

    -- Unused shield allowance credits
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

    -- Active Royal shields linked to this grant.
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

      UPDATE public.posts p
         SET crown_shield_until = sub.max_until
        FROM (
          SELECT b.post_id, MAX(b.expires_at) AS max_until
            FROM public.boosts b
           WHERE b.post_id = ANY(affected_posts)
             AND b.boost_type = 'crown_shield'
             AND b.active = true
             AND (b.expires_at IS NULL OR b.expires_at > now())
           GROUP BY b.post_id
        ) sub
       WHERE p.id = sub.post_id;
      UPDATE public.posts p
         SET crown_shield_until = NULL
       WHERE p.id = ANY(affected_posts)
         AND NOT EXISTS (
           SELECT 1 FROM public.boosts b
            WHERE b.post_id = p.id AND b.boost_type='crown_shield' AND b.active=true
              AND (b.expires_at IS NULL OR b.expires_at > now())
         );
    END IF;

    shekels_intended := COALESCE(grant_row.promo_shekels_remaining, 0);
    tokens_intended  := COALESCE(grant_row.promo_boost_tokens_remaining, 0);

    -- Wallet-shortage rule: all-or-nothing on Shekels.
    IF shekels_intended > 0 THEN
      SELECT COALESCE(shekel_balance,0) INTO wallet_balance FROM public.wallets
       WHERE user_id = grant_row.user_id FOR UPDATE;
      IF wallet_balance >= shekels_intended THEN
        shekels_actual := shekels_intended;
        unrec_shekels  := 0;
        UPDATE public.wallets
           SET shekel_balance = shekel_balance - shekels_actual,
               updated_at = now()
         WHERE user_id = grant_row.user_id;
        INSERT INTO public.shekel_ledger (user_id, kind, shekels_delta, label, stripe_event_id, metadata)
        VALUES (grant_row.user_id, 'royal_reversal', -shekels_actual,
                'Royal Pass reversal', _stripe_event_id,
                jsonb_build_object('grant_id', grant_row.id, 'reason', _reason,
                                   'intended', shekels_intended, 'unrecovered', 0));
      ELSE
        -- Wallet cannot prove promo source; debit nothing, flag reconcile.
        shekels_actual := 0;
        unrec_shekels  := shekels_intended;
        reconcile := true;
        reconcile_reasons := reconcile_reasons || ('wallet_short_shekels:' || wallet_balance::text || '<' || shekels_intended::text);
      END IF;
    END IF;

    -- Wallet-shortage rule: all-or-nothing on Boost Tokens.
    IF tokens_intended > 0 THEN
      SELECT COALESCE(boost_tokens_balance,0) INTO bt_balance FROM public.profiles
       WHERE id = grant_row.user_id FOR UPDATE;
      IF bt_balance >= tokens_intended THEN
        tokens_actual := tokens_intended;
        unrec_tokens  := 0;
        UPDATE public.profiles
           SET boost_tokens_balance = boost_tokens_balance - tokens_actual
         WHERE id = grant_row.user_id;
        INSERT INTO public.boost_tokens_ledger (user_id, delta, reason, metadata)
        VALUES (grant_row.user_id, -tokens_actual, 'royal_reversal',
                jsonb_build_object('grant_id', grant_row.id,
                                   'stripe_event_id', _stripe_event_id,
                                   'reason', _reason,
                                   'intended', tokens_intended,
                                   'unrecovered', 0));
      ELSE
        tokens_actual := 0;
        unrec_tokens  := tokens_intended;
        reconcile := true;
        reconcile_reasons := reconcile_reasons || ('wallet_short_tokens:' || bt_balance::text || '<' || tokens_intended::text);
      END IF;
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
           shekels_reversed = shekels_actual,
           boost_tokens_reversed = tokens_actual,
           active_shields_reversed = active_shields_deactivated,
           founder_reversed = founder_revoked,
           unrecovered_promotional_shekels = unrec_shekels,
           unrecovered_promotional_boost_tokens = unrec_tokens,
           promo_shekels_remaining = promo_shekels_remaining - shekels_intended,
           promo_boost_tokens_remaining = promo_boost_tokens_remaining - tokens_intended,
           needs_reconciliation = reconcile,
           reconciliation_reason = CASE WHEN reconcile THEN array_to_string(reconcile_reasons, '; ') ELSE NULL END
     WHERE id = grant_row.id;

    INSERT INTO public.royal_pass_reversals (
      royal_pass_grant_id, user_id, event_kind, stripe_event_id, stripe_event_type,
      stripe_dispute_id, reason, shields_delta, shekels_delta, boost_tokens_delta,
      active_shields_delta, founder_touched, boost_ids,
      unrecovered_promotional_shekels, unrecovered_promotional_boost_tokens,
      details)
    VALUES (
      grant_row.id, grant_row.user_id, 'reversal', _stripe_event_id, _reason,
      grant_row.stripe_dispute_id, _reason,
      shields_disabled, shekels_actual, tokens_actual,
      active_shields_deactivated, founder_revoked, active_shield_ids,
      unrec_shekels, unrec_tokens,
      jsonb_build_object(
        'stripe_invoice_id', grant_row.stripe_invoice_id,
        'stripe_payment_intent_id', grant_row.stripe_payment_intent_id,
        'stripe_charge_id', grant_row.stripe_charge_id,
        'new_status', _new_status,
        'intended_shekels', shekels_intended,
        'intended_boost_tokens', tokens_intended,
        'reconcile', reconcile,
        'reconcile_reasons', reconcile_reasons));

    IF reconcile THEN
      INSERT INTO public.admin_alerts (kind, severity, title, details)
      VALUES (
        'royal_grant_needs_reconciliation',
        'high',
        'Royal grant needs reconciliation',
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
      'boost_tokens_debited_actual', tokens_actual,
      'shekels_debited_actual', shekels_actual,
      'unrecovered_shekels', unrec_shekels,
      'unrecovered_boost_tokens', unrec_tokens,
      'founder_revoked', founder_revoked,
      'needs_reconciliation', reconcile));

  RETURN jsonb_build_object('ok', true, 'grant_id', grant_row.id, 'new_status', _new_status,
    'shields_disabled', shields_disabled,
    'active_shields_deactivated', active_shields_deactivated,
    'shekels_debited', shekels_actual,
    'boost_tokens_debited', tokens_actual,
    'unrecovered_shekels', unrec_shekels,
    'unrecovered_boost_tokens', unrec_tokens,
    'needs_reconciliation', reconcile);
END;
$function$;

REVOKE ALL ON FUNCTION public.handle_royal_refund(text,text,text,text,text,text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.handle_royal_refund(text,text,text,text,text,text) TO service_role;

-- 6. Admin-only raw reversal RPC -------------------------------------------
CREATE OR REPLACE FUNCTION public.admin_list_royal_pass_reversals(
  _user_id uuid DEFAULT NULL,
  _grant_id uuid DEFAULT NULL,
  _limit int DEFAULT 100,
  _offset int DEFAULT 0
)
RETURNS SETOF public.royal_pass_reversals
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'unauthenticated' USING ERRCODE = '28000';
  END IF;
  IF NOT public.has_role(auth.uid(), 'admin'::app_role) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  _limit  := LEAST(GREATEST(COALESCE(_limit, 100), 1), 500);
  _offset := GREATEST(COALESCE(_offset, 0), 0);

  INSERT INTO public.admin_audit_log (actor_id, action, target_type, target_id, details)
  VALUES (
    auth.uid(),
    'admin_list_royal_pass_reversals',
    'royal_pass_reversal',
    COALESCE(_grant_id::text, _user_id::text, 'all'),
    jsonb_build_object('user_id', _user_id, 'grant_id', _grant_id,
                       'limit', _limit, 'offset', _offset));

  RETURN QUERY
    SELECT r.* FROM public.royal_pass_reversals r
     WHERE (_user_id IS NULL OR r.user_id = _user_id)
       AND (_grant_id IS NULL OR r.royal_pass_grant_id = _grant_id)
     ORDER BY r.created_at DESC
     LIMIT _limit OFFSET _offset;
END;
$function$;

REVOKE ALL ON FUNCTION public.admin_list_royal_pass_reversals(uuid,uuid,int,int) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_list_royal_pass_reversals(uuid,uuid,int,int) TO authenticated, service_role;
