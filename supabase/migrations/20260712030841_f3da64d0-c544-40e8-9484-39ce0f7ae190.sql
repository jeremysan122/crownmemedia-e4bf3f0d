
-- =========================================================================
-- Wave 8.2b patch — blockers 1-11
-- =========================================================================

-- 1) Legacy backfill safety: track reconciliation state
ALTER TABLE public.royal_pass_grants
  ADD COLUMN IF NOT EXISTS legacy_unreconciled boolean NOT NULL DEFAULT false;
COMMENT ON COLUMN public.royal_pass_grants.legacy_unreconciled IS
  'True when promo_*_remaining could not be trustworthy-reconciled from pre-Wave-8.2b ledger history. Blocks reversal.';

-- 2) Unrecovered / source-reversal columns
ALTER TABLE public.royal_pass_grants
  ADD COLUMN IF NOT EXISTS unrecovered_promotional_shekels integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS unrecovered_promotional_boost_tokens integer NOT NULL DEFAULT 0;

ALTER TABLE public.royal_pass_reversals
  ADD COLUMN IF NOT EXISTS unrecovered_promotional_shekels integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS unrecovered_promotional_boost_tokens integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS source_reversal_id uuid REFERENCES public.royal_pass_reversals(id) ON DELETE RESTRICT;

-- Retention integrity: user_id must resolve to a profile
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='royal_pass_reversals_user_fk') THEN
    ALTER TABLE public.royal_pass_reversals
      ADD CONSTRAINT royal_pass_reversals_user_fk
      FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE RESTRICT;
  END IF;
END $$;

-- Only one restoration allowed per source reversal.
CREATE UNIQUE INDEX IF NOT EXISTS ux_royal_pass_reversals_source_reversal
  ON public.royal_pass_reversals(source_reversal_id)
  WHERE source_reversal_id IS NOT NULL;

-- =========================================================================
-- 3) Cross-path ledger bridge: gifts write shekel_ledger so the source-aware
--    promo-consumption trigger fires. Sender debit + receiver earnings.
-- =========================================================================
CREATE OR REPLACE FUNCTION public.trg_gift_transactions_to_shekel_ledger()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Sender debit: negative delta. The Royal promo trigger consumes
  -- promo_shekels_remaining oldest-first for this negative row.
  IF NEW.total_shekels IS NOT NULL AND NEW.total_shekels > 0 THEN
    INSERT INTO public.shekel_ledger (user_id, kind, shekels_delta, label, metadata)
    VALUES (
      NEW.sender_id, 'gift_send', -NEW.total_shekels,
      COALESCE('Gift: ' || NEW.gift_name, 'Gift sent'),
      jsonb_build_object(
        'gift_transaction_id', NEW.id,
        'gift_id', NEW.gift_id,
        'recipient_id', NEW.receiver_id,
        'quantity', NEW.quantity));
  END IF;
  -- Receiver credit: positive delta (visibility only; promo trigger ignores +).
  IF NEW.receiver_earnings_shekels IS NOT NULL AND NEW.receiver_earnings_shekels > 0 THEN
    INSERT INTO public.shekel_ledger (user_id, kind, shekels_delta, label, metadata)
    VALUES (
      NEW.receiver_id, 'gift_receive', NEW.receiver_earnings_shekels,
      COALESCE('Gift earnings: ' || NEW.gift_name, 'Gift received'),
      jsonb_build_object(
        'gift_transaction_id', NEW.id,
        'gift_id', NEW.gift_id,
        'sender_id', NEW.sender_id,
        'quantity', NEW.quantity));
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS gift_transactions_bridge_ledger ON public.gift_transactions;
CREATE TRIGGER gift_transactions_bridge_ledger
  AFTER INSERT ON public.gift_transactions
  FOR EACH ROW EXECUTE FUNCTION public.trg_gift_transactions_to_shekel_ledger();

REVOKE ALL ON FUNCTION public.trg_gift_transactions_to_shekel_ledger() FROM PUBLIC, anon, authenticated;

-- =========================================================================
-- 4) Lock down promo-consumption trigger functions
--    (Postgres bypasses EXECUTE checks for trigger firing, so this is safe.)
-- =========================================================================
REVOKE ALL ON FUNCTION public.trg_consume_royal_promo_shekels() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.trg_consume_royal_promo_boost_tokens() FROM PUBLIC, anon, authenticated;

-- =========================================================================
-- 5) handle_royal_refund — wallet-locked, actual-debit accounting,
--    shield resync, unrecovered tracking.
-- =========================================================================
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

  -- Refuse to debit legacy unreconciled grants.
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

    -- Shield allowance unused credits
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

    -- Active Royal shields linked to this grant. Capture posts for resync.
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

      -- Resync posts.crown_shield_until from remaining still-active shields
      -- (leaves paid 12h shields intact).
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

    -- Intended amounts (promo remaining).
    shekels_intended := grant_row.promo_shekels_remaining;
    tokens_intended  := grant_row.promo_boost_tokens_remaining;

    -- Lock wallet, compute actual debit (cap at current balance).
    IF shekels_intended > 0 THEN
      SELECT shekel_balance INTO wallet_balance FROM public.wallets
       WHERE user_id = grant_row.user_id FOR UPDATE;
      wallet_balance := COALESCE(wallet_balance, 0);
      shekels_actual := LEAST(shekels_intended, GREATEST(wallet_balance, 0));
      unrec_shekels  := shekels_intended - shekels_actual;

      IF shekels_actual > 0 THEN
        UPDATE public.wallets
           SET shekel_balance = shekel_balance - shekels_actual,
               updated_at = now()
         WHERE user_id = grant_row.user_id;
        INSERT INTO public.shekel_ledger (user_id, kind, shekels_delta, label, stripe_event_id, metadata)
        VALUES (grant_row.user_id, 'royal_reversal', -shekels_actual,
                'Royal Pass reversal', _stripe_event_id,
                jsonb_build_object('grant_id', grant_row.id, 'reason', _reason,
                                   'intended', shekels_intended, 'unrecovered', unrec_shekels));
      END IF;
    END IF;

    IF tokens_intended > 0 THEN
      SELECT COALESCE(boost_tokens_balance,0) INTO bt_balance FROM public.profiles
       WHERE id = grant_row.user_id FOR UPDATE;
      tokens_actual := LEAST(tokens_intended, GREATEST(bt_balance, 0));
      unrec_tokens  := tokens_intended - tokens_actual;
      IF tokens_actual > 0 THEN
        UPDATE public.profiles
           SET boost_tokens_balance = boost_tokens_balance - tokens_actual
         WHERE id = grant_row.user_id;
        INSERT INTO public.boost_tokens_ledger (user_id, delta, reason, metadata)
        VALUES (grant_row.user_id, -tokens_actual, 'royal_reversal',
                jsonb_build_object('grant_id', grant_row.id,
                                   'stripe_event_id', _stripe_event_id,
                                   'reason', _reason,
                                   'intended', tokens_intended,
                                   'unrecovered', unrec_tokens));
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
           promo_boost_tokens_remaining = promo_boost_tokens_remaining - tokens_intended
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
        'intended_boost_tokens', tokens_intended));
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
      'founder_revoked', founder_revoked));

  RETURN jsonb_build_object('ok', true, 'grant_id', grant_row.id, 'new_status', _new_status,
    'shields_disabled', shields_disabled,
    'active_shields_deactivated', active_shields_deactivated,
    'shekels_debited', shekels_actual,
    'boost_tokens_debited', tokens_actual,
    'unrecovered_shekels', unrec_shekels,
    'unrecovered_boost_tokens', unrec_tokens,
    'founder_revoked', founder_revoked);
END; $function$;

REVOKE ALL ON FUNCTION public.handle_royal_refund(text,text,text,text,text,text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.handle_royal_refund(text,text,text,text,text,text) TO service_role;

-- =========================================================================
-- 6) handle_royal_dispute_reinstated — strict source-reversal pairing,
--    wallet upsert, expired→credit conversion, exact restoration.
-- =========================================================================
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

  -- Idempotent: no double restoration for the same event.
  IF EXISTS (
    SELECT 1 FROM public.royal_pass_reversals
     WHERE royal_pass_grant_id = grant_row.id
       AND event_kind = 'restoration'
       AND stripe_event_id = _stripe_event_id
  ) THEN
    RETURN jsonb_build_object('ok', true, 'already_restored', true, 'grant_id', grant_row.id);
  END IF;

  -- Locate the reversal to undo: strict match by dispute_id first,
  -- otherwise most-recent un-restored reversal for this grant.
  IF _stripe_dispute_id IS NOT NULL THEN
    SELECT * INTO reversal_row FROM public.royal_pass_reversals
     WHERE royal_pass_grant_id = grant_row.id
       AND event_kind = 'reversal'
       AND stripe_dispute_id = _stripe_dispute_id
       AND NOT EXISTS (
         SELECT 1 FROM public.royal_pass_reversals r2
          WHERE r2.event_kind = 'restoration'
            AND r2.source_reversal_id = royal_pass_reversals.id)
     ORDER BY created_at DESC LIMIT 1;
  END IF;
  IF reversal_row.id IS NULL THEN
    SELECT * INTO reversal_row FROM public.royal_pass_reversals
     WHERE royal_pass_grant_id = grant_row.id
       AND event_kind = 'reversal'
       AND (stripe_dispute_id IS NULL OR _stripe_dispute_id IS NULL
            OR stripe_dispute_id = _stripe_dispute_id)
       AND NOT EXISTS (
         SELECT 1 FROM public.royal_pass_reversals r2
          WHERE r2.event_kind = 'restoration'
            AND r2.source_reversal_id = royal_pass_reversals.id)
     ORDER BY created_at DESC LIMIT 1;
  END IF;

  IF reversal_row.id IS NULL THEN
    RETURN jsonb_build_object('ok', true, 'no_matching_reversal', true, 'grant_id', grant_row.id);
  END IF;

  shields_to_restore := reversal_row.shields_delta;
  shekels_to_restore := reversal_row.shekels_delta;
  tokens_to_restore  := reversal_row.boost_tokens_delta;

  IF shields_to_restore > 0 THEN
    UPDATE public.royal_pass_shield_allowances
       SET shields_used = GREATEST(shields_used - shields_to_restore, 0),
           updated_at = now()
     WHERE royal_pass_grant_id = grant_row.id;
  END IF;

  IF array_length(reversal_row.boost_ids, 1) > 0 THEN
    FOREACH bid IN ARRAY reversal_row.boost_ids LOOP
      SELECT * INTO b FROM public.boosts WHERE id = bid;
      IF b.id IS NULL THEN CONTINUE; END IF;
      IF b.expires_at IS NOT NULL AND b.expires_at > now() THEN
        PERFORM set_config('lovable.boost_sync', '1', true);
        UPDATE public.boosts SET active = true WHERE id = bid;
        PERFORM set_config('lovable.boost_sync', '0', true);
        -- Resync canonical post shield state.
        IF b.post_id IS NOT NULL THEN
          UPDATE public.posts p
             SET crown_shield_until = GREATEST(COALESCE(p.crown_shield_until,'epoch'::timestamptz), b.expires_at)
           WHERE p.id = b.post_id;
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

  IF shekels_to_restore > 0 THEN
    INSERT INTO public.wallets (user_id, shekel_balance)
    VALUES (grant_row.user_id, shekels_to_restore)
    ON CONFLICT (user_id) DO UPDATE
       SET shekel_balance = public.wallets.shekel_balance + EXCLUDED.shekel_balance,
           updated_at = now();
    INSERT INTO public.shekel_ledger (user_id, kind, shekels_delta, label, stripe_event_id, metadata)
    VALUES (grant_row.user_id, 'royal_reinstate', shekels_to_restore,
            'Royal Pass reinstatement', _stripe_event_id,
            jsonb_build_object('grant_id', grant_row.id, 'source_reversal_id', reversal_row.id));
  END IF;

  IF tokens_to_restore > 0 THEN
    UPDATE public.profiles
       SET boost_tokens_balance = COALESCE(boost_tokens_balance,0) + tokens_to_restore
     WHERE id = grant_row.user_id;
    INSERT INTO public.boost_tokens_ledger (user_id, delta, reason, metadata)
    VALUES (grant_row.user_id, tokens_to_restore, 'royal_reinstate',
            jsonb_build_object('grant_id', grant_row.id, 'stripe_event_id', _stripe_event_id,
                               'source_reversal_id', reversal_row.id));
  END IF;

  UPDATE public.royal_pass_grants
     SET status = COALESCE(pre_dispute_status, 'granted'),
         dispute_status = 'funds_reinstated',
         dispute_resolved_at = now(),
         reversed_at = NULL,
         reversed_reason = NULL,
         restoration_completed_at = now(),
         restoration_source_event_id = _stripe_event_id,
         unrecovered_promotional_shekels = 0,
         unrecovered_promotional_boost_tokens = 0,
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
END; $function$;

REVOKE ALL ON FUNCTION public.handle_royal_dispute_reinstated(text,text,text,text,text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.handle_royal_dispute_reinstated(text,text,text,text,text) TO service_role;

-- =========================================================================
-- 7) Owner-safe reversal view via RPC; revoke raw ledger owner access.
-- =========================================================================
DROP POLICY IF EXISTS "Users view own royal reversals" ON public.royal_pass_reversals;
REVOKE SELECT ON public.royal_pass_reversals FROM authenticated;
-- admin policy remains; service_role retains ALL.

CREATE OR REPLACE FUNCTION public.my_royal_benefit_history(_limit int DEFAULT 50)
RETURNS TABLE(
  occurred_at timestamptz,
  event_kind text,
  status_summary text,
  shields_changed integer,
  shekels_changed integer,
  boost_tokens_changed integer)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE uid uuid := auth.uid();
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'not authenticated' USING ERRCODE='42501'; END IF;
  RETURN QUERY
    SELECT r.created_at,
           r.event_kind,
           CASE r.event_kind
             WHEN 'reversal'    THEN 'Royal Pass benefits removed'
             WHEN 'restoration' THEN 'Royal Pass benefits restored'
             ELSE r.event_kind END,
           CASE WHEN r.event_kind = 'reversal' THEN -r.shields_delta      ELSE r.shields_delta      END,
           CASE WHEN r.event_kind = 'reversal' THEN -r.shekels_delta      ELSE r.shekels_delta      END,
           CASE WHEN r.event_kind = 'reversal' THEN -r.boost_tokens_delta ELSE r.boost_tokens_delta END
      FROM public.royal_pass_reversals r
     WHERE r.user_id = uid
     ORDER BY r.created_at DESC
     LIMIT GREATEST(LEAST(_limit, 200), 1);
END $$;

REVOKE ALL ON FUNCTION public.my_royal_benefit_history(int) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.my_royal_benefit_history(int) TO authenticated;
