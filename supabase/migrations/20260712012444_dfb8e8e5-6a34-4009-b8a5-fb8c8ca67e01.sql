
-- 1) Enforce NOT NULL on allowance -> grant link (backfill already left 0 unlinked).
ALTER TABLE public.royal_pass_shield_allowances
  ALTER COLUMN royal_pass_grant_id SET NOT NULL;

-- 2) Reinstated: strict dispute-ID match for any dispute-linked grant.
CREATE OR REPLACE FUNCTION public.handle_royal_dispute_reinstated(
  _stripe_event_id text,
  _stripe_invoice_id text DEFAULT NULL,
  _stripe_payment_intent_id text DEFAULT NULL,
  _stripe_charge_id text DEFAULT NULL,
  _stripe_dispute_id text DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
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

  -- Refunded rows are NEVER auto-restored.
  IF grant_row.status = 'refunded' THEN
    RETURN jsonb_build_object('ok', true, 'skipped_refunded', true, 'grant_id', grant_row.id);
  END IF;

  -- STRICT dispute-ID match for any dispute-linked grant, regardless of current lifecycle state.
  -- Applies to 'disputed', 'funds_withdrawn', and 'reversed' (when reversal came from a dispute).
  IF grant_row.stripe_dispute_id IS NOT NULL THEN
    IF _stripe_dispute_id IS NULL OR _stripe_dispute_id <> grant_row.stripe_dispute_id THEN
      RETURN jsonb_build_object('ok', true, 'dispute_mismatch', true, 'grant_id', grant_row.id);
    END IF;
  END IF;

  -- Idempotent no-op if already fully restored.
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
      'restored_founder',restored_founder
    )
  );

  RETURN jsonb_build_object('ok', true, 'restored_founder', restored_founder,
                            'grant_id', grant_row.id,
                            'balance_restoration_pending_wave_8_2b', true);
END; $function$;

REVOKE ALL ON FUNCTION public.handle_royal_dispute_reinstated(text,text,text,text,text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.handle_royal_dispute_reinstated(text,text,text,text,text) TO service_role;

-- 3) use_royal_shield: reject null allowance->grant linkage.
CREATE OR REPLACE FUNCTION public.use_royal_shield(_post_id uuid)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  uid uuid := auth.uid();
  active bool;
  post_owner uuid;
  post_removed bool;
  crown_row_id uuid;
  allow record;
  linked_grant_status text;
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

  -- Require verifiable grant linkage: refuse activation on legacy/unlinked rows.
  IF allow.royal_pass_grant_id IS NULL THEN
    RETURN jsonb_build_object('error','royal_allowance_not_linked');
  END IF;

  SELECT status INTO linked_grant_status
    FROM public.royal_pass_grants
   WHERE id = allow.royal_pass_grant_id;
  IF linked_grant_status IS NULL THEN
    RETURN jsonb_build_object('error','royal_allowance_not_linked');
  END IF;
  IF linked_grant_status <> 'granted' THEN
    RETURN jsonb_build_object(
      'error','royal_benefits_temporarily_suspended',
      'grant_status', linked_grant_status
    );
  END IF;

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
    'shields_used', allow.shields_used + 1,
    'shields_granted', allow.shields_granted,
    'expires_at', (now() + interval '24 hours')
  );
END; $function$;

-- 4) Concurrency-safe grant RPC: catch unique_violation from simultaneous webhook deliveries.
CREATE OR REPLACE FUNCTION public.grant_royal_monthly_benefits(
  _user_id uuid,
  _stripe_event_id text,
  _stripe_invoice_id text,
  _period_start timestamptz,
  _period_end timestamptz,
  _paid_amount_cents integer,
  _stripe_payment_intent_id text DEFAULT NULL,
  _stripe_charge_id text DEFAULT NULL,
  _stripe_subscription_id text DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
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

  -- Concurrency-safe insert. Under contention, one call wins; loser hits ux_royal_pass_grants_event
  -- or ux_royal_pass_grants_user_period and returns already_processed instead of throwing.
  BEGIN
    INSERT INTO public.royal_pass_grants
      (user_id, stripe_event_id, stripe_invoice_id, period_start, period_end,
       shields_granted, shekels_granted, boost_tokens_granted, founder_granted,
       stripe_payment_intent_id, stripe_charge_id, stripe_subscription_id, status)
    VALUES (_user_id, _stripe_event_id, _stripe_invoice_id, _period_start, _period_end,
            5, 500, 3, new_founder,
            _stripe_payment_intent_id, _stripe_charge_id, _stripe_subscription_id, 'granted')
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
          jsonb_build_object('invoice_id', _stripe_invoice_id, 'source', 'royal_pass'));

  INSERT INTO public.wallets (user_id, shekel_balance)
  VALUES (_user_id, 500)
  ON CONFLICT (user_id) DO UPDATE
     SET shekel_balance = public.wallets.shekel_balance + 500,
         updated_at = now();

  INSERT INTO public.boost_tokens_ledger (user_id, delta, reason, metadata)
  VALUES (_user_id, 3, 'royal_monthly',
          jsonb_build_object('invoice_id', _stripe_invoice_id, 'event_id', _stripe_event_id));
  UPDATE public.profiles
     SET boost_tokens_balance = COALESCE(boost_tokens_balance,0) + 3
   WHERE id = _user_id;

  RETURN jsonb_build_object('ok', true, 'new_founder', new_founder, 'grant_id', new_grant_id);
END; $function$;

REVOKE ALL ON FUNCTION public.grant_royal_monthly_benefits(uuid,text,text,timestamptz,timestamptz,integer,text,text,text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.grant_royal_monthly_benefits(uuid,text,text,timestamptz,timestamptz,integer,text,text,text) TO service_role;
