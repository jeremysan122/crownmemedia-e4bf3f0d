
-- 1) Rebuild handle_royal_refund with real columns + real revoke signature + lifecycle idempotency
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
  grant_row record;
  wallet_balance numeric := 0;
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
  affected_posts uuid[] := ARRAY[]::uuid[];
  _pid uuid;
  reconcile boolean := false;
  reconcile_reasons text[] := ARRAY[]::text[];
  reversal_id uuid;
BEGIN
  IF _new_status NOT IN ('reversed','refunded','disputed') THEN
    RETURN jsonb_build_object('error','invalid_status');
  END IF;

  -- Locate + lock grant.
  SELECT * INTO grant_row FROM public.royal_pass_grants
   WHERE (_stripe_invoice_id        IS NOT NULL AND stripe_invoice_id        = _stripe_invoice_id)
      OR (_stripe_payment_intent_id IS NOT NULL AND stripe_payment_intent_id = _stripe_payment_intent_id)
      OR (_stripe_charge_id         IS NOT NULL AND stripe_charge_id         = _stripe_charge_id)
   ORDER BY created_at DESC LIMIT 1
   FOR UPDATE;

  IF grant_row.id IS NULL THEN
    RETURN jsonb_build_object('ok', true, 'no_grant_found', true, 'stripe_event_id', _stripe_event_id);
  END IF;

  -- LIFECYCLE IDEMPOTENCY: once terminal reversal is complete, refuse further debits
  -- regardless of Stripe event ID. Covers funds_withdrawn -> closed_lost, and lost -> duplicate lost.
  IF grant_row.reversal_completed_at IS NOT NULL
     AND grant_row.status IN ('reversed','refunded') THEN
    RETURN jsonb_build_object('ok', true, 'already_processed', true,
                              'grant_id', grant_row.id,
                              'status', grant_row.status);
  END IF;

  -- Disputed (temporary suspension) path: mark state only, no debits, no reversal row.
  IF _new_status = 'disputed' THEN
    UPDATE public.royal_pass_grants
       SET status = CASE WHEN status IN ('reversed','refunded') THEN status ELSE 'disputed' END,
           pre_dispute_status = COALESCE(pre_dispute_status, grant_row.status),
           disputed_at = COALESCE(disputed_at, now()),
           dispute_status = COALESCE(dispute_status, 'under_review')
     WHERE id = grant_row.id;
    RETURN jsonb_build_object('ok', true, 'suspended', true, 'grant_id', grant_row.id);
  END IF;

  -- Lock wallet + profile.
  SELECT COALESCE(shekel_balance, 0) INTO wallet_balance
    FROM public.wallets WHERE user_id = grant_row.user_id FOR UPDATE;
  SELECT COALESCE(boost_tokens_balance, 0) INTO bt_balance
    FROM public.profiles WHERE id = grant_row.user_id FOR UPDATE;

  -- Deactivate only ACTIVE royal shields linked to this grant. Paid crown-shield
  -- boosts have royal_pass_grant_id IS NULL and are untouched.
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

  -- All-or-nothing wallet shortage rule (Shekels): protect purchased/earned balances.
  IF shekels_intended > 0 THEN
    IF wallet_balance >= shekels_intended THEN
      shekels_actual := shekels_intended;
      UPDATE public.wallets
         SET shekel_balance = shekel_balance - shekels_actual,
             updated_at = now()
       WHERE user_id = grant_row.user_id;
      INSERT INTO public.shekel_ledger(user_id, kind, shekels_delta, label, stripe_event_id, reference_id, metadata)
      VALUES (grant_row.user_id, 'royal_reversal', -shekels_actual,
              'Royal grant reversed', _stripe_event_id, grant_row.id,
              jsonb_build_object('reason', _reason, 'stripe_event_id', _stripe_event_id));
    ELSE
      shekels_actual := 0;
      unrec_shekels := shekels_intended;
      reconcile := true;
      reconcile_reasons := reconcile_reasons || 'wallet_shortage_shekels';
    END IF;
  END IF;

  -- All-or-nothing rule (Boost tokens) using REAL column names: delta, reason, reference_id, metadata.
  IF tokens_intended > 0 THEN
    IF bt_balance >= tokens_intended THEN
      tokens_actual := tokens_intended;
      UPDATE public.profiles
         SET boost_tokens_balance = boost_tokens_balance - tokens_actual
       WHERE id = grant_row.user_id;
      INSERT INTO public.boost_tokens_ledger(user_id, delta, reason, reference_id, metadata)
      VALUES (grant_row.user_id, -tokens_actual, 'royal_reversal', grant_row.id,
              jsonb_build_object('label','Royal grant reversed (tokens)',
                                 'reason', _reason,
                                 'stripe_event_id', _stripe_event_id));
    ELSE
      tokens_actual := 0;
      unrec_tokens := tokens_intended;
      reconcile := true;
      reconcile_reasons := reconcile_reasons || 'wallet_shortage_boost_tokens';
    END IF;
  END IF;

  -- Founder permanent revoke via REAL six-argument signature.
  IF COALESCE(grant_row.founder_granted, false) = true THEN
    PERFORM public.revoke_royal_founder(
      grant_row.user_id,           -- _user_id
      _reason,                     -- _reason
      _stripe_event_id,            -- _stripe_event_id
      NULL::uuid,                  -- _actor_id (webhook)
      'revoke',                    -- _mode
      grant_row.stripe_dispute_id  -- _stripe_dispute_id
    );
    founder_revoked := true;
  END IF;

  -- Update grant: record intended vs actual, remaining balances, reconciliation.
  UPDATE public.royal_pass_grants
     SET status = _new_status,
         reversed_at = COALESCE(reversed_at, now()),
         reversed_reason = _reason,
         reversal_stripe_event_id = _stripe_event_id,
         reversal_source_event_id = _stripe_event_id,
         reversal_completed_at = now(),
         shekels_reversed = shekels_actual,
         boost_tokens_reversed = tokens_actual,
         active_shields_reversed = active_shields_deactivated,
         founder_reversed = founder_revoked,
         promo_shekels_remaining = GREATEST(promo_shekels_remaining - shekels_actual, 0),
         promo_boost_tokens_remaining = GREATEST(promo_boost_tokens_remaining - tokens_actual, 0),
         unrecovered_promotional_shekels = unrec_shekels,
         unrecovered_promotional_boost_tokens = unrec_tokens,
         needs_reconciliation = reconcile,
         reconciliation_reason = CASE WHEN reconcile THEN array_to_string(reconcile_reasons, ',') ELSE NULL END
   WHERE id = grant_row.id;

  -- Insert immutable reversal row (unique on grant_id + event_kind + stripe_event_id).
  INSERT INTO public.royal_pass_reversals (
    royal_pass_grant_id, user_id, event_kind, stripe_event_id, stripe_event_type,
    stripe_dispute_id, reason,
    shields_delta, shekels_delta, boost_tokens_delta,
    active_shields_delta, founder_touched, boost_ids,
    unrecovered_promotional_shekels, unrecovered_promotional_boost_tokens,
    details
  ) VALUES (
    grant_row.id, grant_row.user_id, 'reversal', _stripe_event_id, _new_status,
    grant_row.stripe_dispute_id, _reason,
    active_shields_deactivated, shekels_actual, tokens_actual,
    active_shields_deactivated, founder_revoked, active_shield_ids,
    unrec_shekels, unrec_tokens,
    jsonb_build_object(
      'shekels_intended', shekels_intended,
      'tokens_intended',  tokens_intended,
      'wallet_balance_shekels', wallet_balance,
      'wallet_balance_boost_tokens', bt_balance,
      'reconcile', reconcile,
      'reasons', reconcile_reasons))
  ON CONFLICT (royal_pass_grant_id, event_kind, stripe_event_id) DO NOTHING
  RETURNING id INTO reversal_id;

  -- Audit trail.
  INSERT INTO public.admin_audit_log (actor_id, action, target_type, target_id, details)
  VALUES (
    NULL, 'royal_grant_reversed', 'royal_pass_grant', grant_row.id::text,
    jsonb_build_object(
      'actor_type','stripe_webhook',
      'stripe_event_id', _stripe_event_id,
      'reason', _reason,
      'new_status', _new_status,
      'user_id', grant_row.user_id,
      'shekels_intended', shekels_intended,
      'shekels_actual', shekels_actual,
      'tokens_intended', tokens_intended,
      'tokens_actual', tokens_actual,
      'active_shields_reversed', active_shields_deactivated,
      'founder_reversed', founder_revoked,
      'needs_reconciliation', reconcile,
      'reversal_id', reversal_id
    )
  );

  IF reconcile THEN
    INSERT INTO public.admin_alerts (category, severity, title, body, metadata)
    VALUES (
      'royal_grant_needs_reconciliation',
      'critical',
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
        'reasons', reconcile_reasons));
  END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'grant_id', grant_row.id,
    'reversal_id', reversal_id,
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


-- 2) Rebuild handle_royal_dispute_reinstated with reconciliation gate and canonical shield resync.
CREATE OR REPLACE FUNCTION public.handle_royal_dispute_reinstated(
  _stripe_event_id text,
  _stripe_invoice_id text DEFAULT NULL,
  _stripe_payment_intent_id text DEFAULT NULL,
  _stripe_charge_id text DEFAULT NULL,
  _stripe_dispute_id text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  grant_row record; cfg record; fg record;
  reversal_row record;
  shields_to_restore int := 0;
  shekels_to_restore int := 0;
  tokens_to_restore  int := 0;
  bid uuid; b record;
  reactivated_ids uuid[] := ARRAY[]::uuid[];
  allowance_credits_restored int := 0;
  restored_founder boolean := false;
  affected_posts uuid[] := ARRAY[]::uuid[];
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

  -- Refunded rows never auto-restore.
  IF grant_row.status = 'refunded' THEN
    RETURN jsonb_build_object('ok', true, 'skipped_refunded', true, 'grant_id', grant_row.id);
  END IF;

  -- Strict dispute-ID match whenever grant has a known dispute.
  IF grant_row.stripe_dispute_id IS NOT NULL THEN
    IF _stripe_dispute_id IS NULL OR _stripe_dispute_id <> grant_row.stripe_dispute_id THEN
      RETURN jsonb_build_object('ok', true, 'dispute_mismatch', true, 'grant_id', grant_row.id);
    END IF;
  END IF;

  -- Block automatic restore when a shortage reversal flagged manual reconciliation.
  IF COALESCE(grant_row.needs_reconciliation, false) = true THEN
    INSERT INTO public.admin_alerts (category, severity, title, body, metadata)
    VALUES (
      'royal_grant_reinstate_blocked',
      'critical',
      'Automatic Royal reinstatement blocked',
      format('Grant %s cannot auto-restore: needs manual reconciliation.', grant_row.id),
      jsonb_build_object(
        'grant_id', grant_row.id,
        'user_id', grant_row.user_id,
        'stripe_event_id', _stripe_event_id,
        'stripe_dispute_id', _stripe_dispute_id));
    RETURN jsonb_build_object('ok', true, 'needs_manual_reconciliation', true, 'grant_id', grant_row.id);
  END IF;

  -- Duplicate-event guard: no two restorations with same event_id.
  IF EXISTS (
    SELECT 1 FROM public.royal_pass_reversals
     WHERE royal_pass_grant_id = grant_row.id
       AND event_kind = 'restoration'
       AND stripe_event_id = _stripe_event_id
  ) THEN
    RETURN jsonb_build_object('ok', true, 'already_restored', true, 'grant_id', grant_row.id);
  END IF;

  -- Locate the matching un-restored reversal: strict by dispute_id, else most recent un-restored.
  IF _stripe_dispute_id IS NOT NULL THEN
    SELECT * INTO reversal_row FROM public.royal_pass_reversals r
     WHERE r.royal_pass_grant_id = grant_row.id
       AND r.event_kind = 'reversal'
       AND r.stripe_dispute_id = _stripe_dispute_id
       AND NOT EXISTS (
         SELECT 1 FROM public.royal_pass_reversals r2
          WHERE r2.event_kind = 'restoration'
            AND r2.source_reversal_id = r.id)
     ORDER BY r.created_at DESC LIMIT 1;
  END IF;
  IF reversal_row.id IS NULL THEN
    SELECT * INTO reversal_row FROM public.royal_pass_reversals r
     WHERE r.royal_pass_grant_id = grant_row.id
       AND r.event_kind = 'reversal'
       AND (r.stripe_dispute_id IS NULL OR _stripe_dispute_id IS NULL
            OR r.stripe_dispute_id = _stripe_dispute_id)
       AND NOT EXISTS (
         SELECT 1 FROM public.royal_pass_reversals r2
          WHERE r2.event_kind = 'restoration'
            AND r2.source_reversal_id = r.id)
     ORDER BY r.created_at DESC LIMIT 1;
  END IF;

  IF reversal_row.id IS NULL THEN
    RETURN jsonb_build_object('ok', true, 'no_matching_reversal', true, 'grant_id', grant_row.id);
  END IF;

  -- Restore only the exact amounts actually debited.
  shields_to_restore := COALESCE(reversal_row.active_shields_delta, 0);
  shekels_to_restore := COALESCE(reversal_row.shekels_delta, 0);
  tokens_to_restore  := COALESCE(reversal_row.boost_tokens_delta, 0);

  -- Reactivate original shield rows if still unexpired; convert expired to allowance credits.
  IF array_length(reversal_row.boost_ids, 1) > 0 THEN
    FOREACH bid IN ARRAY reversal_row.boost_ids LOOP
      SELECT * INTO b FROM public.boosts WHERE id = bid;
      IF b.id IS NULL THEN CONTINUE; END IF;
      IF b.expires_at IS NOT NULL AND b.expires_at > now() THEN
        PERFORM set_config('lovable.boost_sync', '1', true);
        UPDATE public.boosts SET active = true WHERE id = bid;
        PERFORM set_config('lovable.boost_sync', '0', true);
        IF b.post_id IS NOT NULL THEN
          affected_posts := affected_posts || b.post_id;
        END IF;
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

  -- Canonical post shield resync.
  FOREACH bid IN ARRAY (SELECT COALESCE(array_agg(DISTINCT p),ARRAY[]::uuid[]) FROM unnest(affected_posts) p) LOOP
    PERFORM public.recalculate_post_crown_shield_until(bid);
  END LOOP;

  IF shekels_to_restore > 0 THEN
    INSERT INTO public.wallets (user_id, shekel_balance)
    VALUES (grant_row.user_id, shekels_to_restore)
    ON CONFLICT (user_id) DO UPDATE
       SET shekel_balance = public.wallets.shekel_balance + EXCLUDED.shekel_balance,
           updated_at = now();
    INSERT INTO public.shekel_ledger (user_id, kind, shekels_delta, label, stripe_event_id, reference_id, metadata)
    VALUES (grant_row.user_id, 'royal_reinstate', shekels_to_restore,
            'Royal Pass reinstatement', _stripe_event_id, grant_row.id,
            jsonb_build_object('grant_id', grant_row.id, 'source_reversal_id', reversal_row.id));
  END IF;

  IF tokens_to_restore > 0 THEN
    UPDATE public.profiles
       SET boost_tokens_balance = COALESCE(boost_tokens_balance,0) + tokens_to_restore
     WHERE id = grant_row.user_id;
    INSERT INTO public.boost_tokens_ledger (user_id, delta, reason, reference_id, metadata)
    VALUES (grant_row.user_id, tokens_to_restore, 'royal_reinstate', grant_row.id,
            jsonb_build_object('label','Royal reinstate',
                               'stripe_event_id', _stripe_event_id,
                               'source_reversal_id', reversal_row.id));
  END IF;

  -- Restore grant state; keep unrecovered_* untouched by design when no shortage was recorded.
  UPDATE public.royal_pass_grants
     SET status = COALESCE(pre_dispute_status, 'granted'),
         dispute_status = 'funds_reinstated',
         dispute_resolved_at = now(),
         reversed_at = NULL,
         reversed_reason = NULL,
         restoration_completed_at = now(),
         restoration_source_event_id = _stripe_event_id,
         promo_shekels_remaining = LEAST(promo_shekels_remaining + shekels_to_restore, shekels_granted),
         promo_boost_tokens_remaining = LEAST(promo_boost_tokens_remaining + tokens_to_restore, boost_tokens_granted)
   WHERE id = grant_row.id;

  -- Reactivate the ORIGINAL Founder row. Never insert a replacement.
  IF grant_row.founder_granted THEN
    SELECT * INTO fg FROM public.founder_grants
     WHERE user_id = grant_row.user_id
       AND (
         (stripe_dispute_id IS NOT NULL AND stripe_dispute_id = _stripe_dispute_id)
         OR qualifying_invoice_id = grant_row.stripe_invoice_id
         OR stripe_invoice_id     = grant_row.stripe_invoice_id
       )
     ORDER BY (status = 'disputed') DESC, granted_at DESC LIMIT 1;

    IF fg.id IS NOT NULL AND fg.status IN ('disputed','revoked') THEN
      SELECT * INTO cfg FROM public.founder_program_config WHERE id = 1;
      UPDATE public.founder_grants
         SET status = 'active',
             revoked_at = NULL, revoked_reason = NULL, revoked_stripe_event_id = NULL,
             dispute_resolved_at = now(),
             -- Preserve original values explicitly.
             original_granted_at = COALESCE(original_granted_at, granted_at),
             original_paid_amount_cents = COALESCE(original_paid_amount_cents, paid_amount_cents),
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
    active_shields_delta, founder_touched, boost_ids, source_reversal_id, details)
  VALUES (
    grant_row.id, grant_row.user_id, 'restoration', _stripe_event_id, 'reinstated',
    _stripe_dispute_id, 'dispute_reinstated',
    shields_to_restore, shekels_to_restore, tokens_to_restore,
    COALESCE(array_length(reactivated_ids, 1), 0), restored_founder, reactivated_ids,
    reversal_row.id,
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
      'source_reversal_id', reversal_row.id,
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
    'source_reversal_id', reversal_row.id,
    'active_shields_reactivated', COALESCE(array_length(reactivated_ids, 1), 0),
    'expired_shields_converted_to_credits', allowance_credits_restored);
END;
$function$;

REVOKE ALL ON FUNCTION public.handle_royal_dispute_reinstated(text,text,text,text,text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.handle_royal_dispute_reinstated(text,text,text,text,text) TO service_role;


-- 3) Harden handle_royal_dispute_lost so it also short-circuits when already refunded.
CREATE OR REPLACE FUNCTION public.handle_royal_dispute_lost(
  _stripe_event_id text,
  _stripe_dispute_id text,
  _reason text DEFAULT 'dispute_lost',
  _stripe_invoice_id text DEFAULT NULL,
  _stripe_payment_intent_id text DEFAULT NULL,
  _stripe_charge_id text DEFAULT NULL
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

  -- Lifecycle short-circuit: once reversed or refunded, another lost event is a no-op.
  IF grant_row.status IN ('reversed','refunded') AND grant_row.reversal_completed_at IS NOT NULL THEN
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
END;
$function$;

REVOKE ALL ON FUNCTION public.handle_royal_dispute_lost(text,text,text,text,text,text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.handle_royal_dispute_lost(text,text,text,text,text,text) TO service_role;
