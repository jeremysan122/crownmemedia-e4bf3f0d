
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

  SELECT * INTO grant_row FROM public.royal_pass_grants
   WHERE (_stripe_invoice_id        IS NOT NULL AND stripe_invoice_id        = _stripe_invoice_id)
      OR (_stripe_payment_intent_id IS NOT NULL AND stripe_payment_intent_id = _stripe_payment_intent_id)
      OR (_stripe_charge_id         IS NOT NULL AND stripe_charge_id         = _stripe_charge_id)
   ORDER BY created_at DESC LIMIT 1
   FOR UPDATE;

  IF grant_row.id IS NULL THEN
    RETURN jsonb_build_object('ok', true, 'no_grant_found', true, 'stripe_event_id', _stripe_event_id);
  END IF;

  IF grant_row.reversal_completed_at IS NOT NULL
     AND grant_row.status IN ('reversed','refunded') THEN
    RETURN jsonb_build_object('ok', true, 'already_processed', true,
                              'grant_id', grant_row.id, 'status', grant_row.status);
  END IF;

  IF _new_status = 'disputed' THEN
    UPDATE public.royal_pass_grants
       SET status = CASE WHEN status IN ('reversed','refunded') THEN status ELSE 'disputed' END,
           pre_dispute_status = COALESCE(pre_dispute_status, grant_row.status),
           disputed_at = COALESCE(disputed_at, now()),
           dispute_status = COALESCE(dispute_status, 'under_review')
     WHERE id = grant_row.id;
    RETURN jsonb_build_object('ok', true, 'suspended', true, 'grant_id', grant_row.id);
  END IF;

  SELECT COALESCE(shekel_balance, 0) INTO wallet_balance
    FROM public.wallets WHERE user_id = grant_row.user_id FOR UPDATE;
  SELECT COALESCE(boost_tokens_balance, 0) INTO bt_balance
    FROM public.profiles WHERE id = grant_row.user_id FOR UPDATE;

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
      reconcile_reasons := array_append(reconcile_reasons, 'wallet_shortage_shekels');
    END IF;
  END IF;

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
      reconcile_reasons := array_append(reconcile_reasons, 'wallet_shortage_boost_tokens');
    END IF;
  END IF;

  IF COALESCE(grant_row.founder_granted, false) = true THEN
    PERFORM public.revoke_royal_founder(
      grant_row.user_id, _reason, _stripe_event_id,
      NULL::uuid, 'revoke', grant_row.stripe_dispute_id);
    founder_revoked := true;
  END IF;

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

  INSERT INTO public.royal_pass_reversals (
    royal_pass_grant_id, user_id, event_kind, stripe_event_id, stripe_event_type,
    stripe_dispute_id, reason,
    shields_delta, shekels_delta, boost_tokens_delta,
    active_shields_delta, founder_touched, boost_ids,
    unrecovered_promotional_shekels, unrecovered_promotional_boost_tokens,
    details)
  VALUES (
    grant_row.id, grant_row.user_id, 'reversal', _stripe_event_id, _new_status,
    grant_row.stripe_dispute_id, _reason,
    active_shields_deactivated, shekels_actual, tokens_actual,
    active_shields_deactivated, founder_revoked, active_shield_ids,
    unrec_shekels, unrec_tokens,
    jsonb_build_object(
      'shekels_intended', shekels_intended,
      'tokens_intended', tokens_intended,
      'wallet_balance_shekels', wallet_balance,
      'wallet_balance_boost_tokens', bt_balance,
      'reconcile', reconcile,
      'reasons', to_jsonb(reconcile_reasons)))
  ON CONFLICT (royal_pass_grant_id, event_kind, stripe_event_id) DO NOTHING
  RETURNING id INTO reversal_id;

  INSERT INTO public.admin_audit_log (actor_id, action, target_type, target_id, details)
  VALUES (
    NULL, 'royal_grant_reversed', 'royal_pass_grant', grant_row.id::text,
    jsonb_build_object(
      'actor_type','stripe_webhook',
      'stripe_event_id', _stripe_event_id,
      'reason', _reason, 'new_status', _new_status,
      'user_id', grant_row.user_id,
      'shekels_intended', shekels_intended, 'shekels_actual', shekels_actual,
      'tokens_intended', tokens_intended, 'tokens_actual', tokens_actual,
      'active_shields_reversed', active_shields_deactivated,
      'founder_reversed', founder_revoked,
      'needs_reconciliation', reconcile,
      'reversal_id', reversal_id));

  IF reconcile THEN
    INSERT INTO public.admin_alerts (category, severity, title, body, metadata)
    VALUES (
      'royal_grant_needs_reconciliation', 'critical',
      'Royal grant needs reconciliation',
      format('Grant %s user %s unrecovered: %s shekels, %s tokens.',
             grant_row.id, grant_row.user_id, unrec_shekels, unrec_tokens),
      jsonb_build_object(
        'grant_id', grant_row.id, 'user_id', grant_row.user_id,
        'stripe_event_id', _stripe_event_id,
        'unrecovered_shekels', unrec_shekels,
        'unrecovered_boost_tokens', unrec_tokens,
        'wallet_balance_shekels', wallet_balance,
        'wallet_balance_boost_tokens', bt_balance,
        'reasons', to_jsonb(reconcile_reasons)));
  END IF;

  RETURN jsonb_build_object(
    'ok', true, 'grant_id', grant_row.id, 'reversal_id', reversal_id,
    'new_status', _new_status,
    'shekels_reversed', shekels_actual, 'boost_tokens_reversed', tokens_actual,
    'active_shields_reversed', active_shields_deactivated,
    'founder_reversed', founder_revoked,
    'unrecovered_shekels', unrec_shekels, 'unrecovered_boost_tokens', unrec_tokens,
    'needs_reconciliation', reconcile);
END;
$function$;

REVOKE ALL ON FUNCTION public.handle_royal_refund(text,text,text,text,text,text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.handle_royal_refund(text,text,text,text,text,text) TO service_role;
