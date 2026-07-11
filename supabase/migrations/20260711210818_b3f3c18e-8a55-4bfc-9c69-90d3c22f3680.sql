
-- =====================================================================
-- Wave 8.2a follow-up — explicit service_role grants
-- =====================================================================
GRANT EXECUTE ON FUNCTION public.handle_royal_dispute_created(text,text,text,text,text,text) TO service_role;
GRANT EXECUTE ON FUNCTION public.handle_royal_dispute_funds_withdrawn(text,text,text,text,text) TO service_role;
GRANT EXECUTE ON FUNCTION public.handle_royal_dispute_lost(text,text,text,text,text,text) TO service_role;
GRANT EXECUTE ON FUNCTION public.handle_royal_dispute_won(text,text,text,text,text) TO service_role;
GRANT EXECUTE ON FUNCTION public.handle_royal_dispute_reinstated(text,text,text,text,text) TO service_role;
GRANT EXECUTE ON FUNCTION public.revoke_royal_founder(uuid,text,text,uuid,text,text) TO service_role;
GRANT EXECUTE ON FUNCTION public.grant_royal_monthly_benefits(uuid,text,text,timestamptz,timestamptz,integer,text,text,text) TO service_role;
GRANT EXECUTE ON FUNCTION public.handle_royal_refund(text,text,text,text,text,text) TO service_role;

-- =====================================================================
-- Link shield allowances to their originating grant (item 3)
-- =====================================================================
ALTER TABLE public.royal_pass_shield_allowances
  ADD COLUMN IF NOT EXISTS royal_pass_grant_id uuid;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conname = 'royal_pass_shield_allowances_grant_fk'
  ) THEN
    ALTER TABLE public.royal_pass_shield_allowances
      ADD CONSTRAINT royal_pass_shield_allowances_grant_fk
      FOREIGN KEY (royal_pass_grant_id)
      REFERENCES public.royal_pass_grants(id)
      ON DELETE RESTRICT;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_shield_allowances_grant
  ON public.royal_pass_shield_allowances(royal_pass_grant_id);

-- Backfill by matching (user_id, period_start).
UPDATE public.royal_pass_shield_allowances a
   SET royal_pass_grant_id = g.id
  FROM public.royal_pass_grants g
 WHERE a.royal_pass_grant_id IS NULL
   AND g.user_id = a.user_id
   AND g.period_start = a.period_start;

-- =====================================================================
-- grant_royal_monthly_benefits — populate grant<->allowance link
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
  user_exists boolean; new_grant_id uuid;
BEGIN
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

  -- Insert grant FIRST so we can link the allowance to it.
  INSERT INTO public.royal_pass_grants
    (user_id, stripe_event_id, stripe_invoice_id, period_start, period_end,
     shields_granted, shekels_granted, boost_tokens_granted, founder_granted,
     stripe_payment_intent_id, stripe_charge_id, stripe_subscription_id, status)
  VALUES (_user_id, _stripe_event_id, _stripe_invoice_id, _period_start, _period_end,
          5, 500, 3, new_founder,
          _stripe_payment_intent_id, _stripe_charge_id, _stripe_subscription_id, 'granted')
  RETURNING id INTO new_grant_id;

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

GRANT EXECUTE ON FUNCTION public.grant_royal_monthly_benefits(uuid,text,text,timestamptz,timestamptz,integer,text,text,text) TO service_role;

-- =====================================================================
-- use_royal_shield — reject non-granted linked grants (item 2)
-- =====================================================================
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

  -- NEW: enforce linked-grant status. Reject disputed / withdrawn / reversed / refunded.
  IF allow.royal_pass_grant_id IS NOT NULL THEN
    SELECT status INTO linked_grant_status
      FROM public.royal_pass_grants
     WHERE id = allow.royal_pass_grant_id;
    IF linked_grant_status IS NOT NULL AND linked_grant_status <> 'granted' THEN
      RETURN jsonb_build_object(
        'error','royal_benefits_temporarily_suspended',
        'grant_status', linked_grant_status
      );
    END IF;
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
