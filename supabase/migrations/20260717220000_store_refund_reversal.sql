-- Atomically reverse Stripe-funded Store entitlements after a full refund or
-- terminal dispute. The webhook resolves the Checkout Session from the
-- PaymentIntent, then this RPC uses the immutable Store ledger as its source
-- of truth. One Checkout Session can be reversed only once, even when Stripe
-- emits multiple terminal events.

CREATE TABLE IF NOT EXISTS public.stripe_store_reversals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  stripe_session_id text NOT NULL UNIQUE,
  stripe_event_id text NOT NULL UNIQUE,
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  reason text NOT NULL,
  status text NOT NULL CHECK (status IN ('reversed', 'needs_reconciliation')),
  shekels_intended numeric NOT NULL DEFAULT 0 CHECK (shekels_intended >= 0),
  shekels_reversed numeric NOT NULL DEFAULT 0 CHECK (shekels_reversed >= 0),
  boosts_intended integer NOT NULL DEFAULT 0 CHECK (boosts_intended >= 0),
  boosts_deactivated integer NOT NULL DEFAULT 0 CHECK (boosts_deactivated >= 0),
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.stripe_store_reversals ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.stripe_store_reversals FROM PUBLIC, anon, authenticated;

CREATE INDEX IF NOT EXISTS stripe_store_reversals_user_created_idx
  ON public.stripe_store_reversals (user_id, created_at DESC);

CREATE OR REPLACE FUNCTION public.handle_store_refund(
  _stripe_event_id text,
  _stripe_session_id text,
  _reason text DEFAULT 'charge.refunded'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  existing_reversal public.stripe_store_reversals%ROWTYPE;
  purchase_user_id uuid;
  purchase_user_count integer := 0;
  shekels_intended numeric := 0;
  shekels_reversed numeric := 0;
  wallet_balance numeric := 0;
  boost_ids uuid[] := ARRAY[]::uuid[];
  boosts_intended integer := 0;
  boosts_deactivated integer := 0;
  needs_reconciliation boolean := false;
  reversal_id uuid;
BEGIN
  IF NULLIF(trim(_stripe_event_id), '') IS NULL THEN
    RAISE EXCEPTION 'handle_store_refund: stripe_event_id is required' USING ERRCODE = '22023';
  END IF;
  IF NULLIF(trim(_stripe_session_id), '') IS NULL THEN
    RAISE EXCEPTION 'handle_store_refund: stripe_session_id is required' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO existing_reversal
    FROM public.stripe_store_reversals
   WHERE stripe_session_id = _stripe_session_id
   FOR UPDATE;
  IF FOUND THEN
    RETURN jsonb_build_object(
      'ok', true,
      'already_processed', true,
      'reversal_id', existing_reversal.id,
      'status', existing_reversal.status,
      'shekels_reversed', existing_reversal.shekels_reversed,
      'boosts_deactivated', existing_reversal.boosts_deactivated
    );
  END IF;

  -- The purchase ledger is immutable to application users. Lock its rows so a
  -- concurrent terminal Stripe event observes one stable entitlement set.
  PERFORM id
    FROM public.shekel_ledger
   WHERE stripe_session_id = _stripe_session_id
     AND kind IN ('bundle_purchase', 'boost_stripe')
   FOR UPDATE;

  SELECT
    count(DISTINCT user_id),
    (array_agg(DISTINCT user_id))[1],
    COALESCE(sum(shekels_delta) FILTER (WHERE kind = 'bundle_purchase' AND shekels_delta > 0), 0),
    COALESCE(
      array_agg(DISTINCT reference_id) FILTER (WHERE kind = 'boost_stripe' AND reference_id IS NOT NULL),
      ARRAY[]::uuid[]
    )
  INTO purchase_user_count, purchase_user_id, shekels_intended, boost_ids
  FROM public.shekel_ledger
  WHERE stripe_session_id = _stripe_session_id
    AND kind IN ('bundle_purchase', 'boost_stripe');

  IF purchase_user_count = 0 OR purchase_user_id IS NULL THEN
    RETURN jsonb_build_object('ok', true, 'no_store_purchase_found', true);
  END IF;
  IF purchase_user_count <> 1 THEN
    RAISE EXCEPTION 'handle_store_refund: session maps to multiple users' USING ERRCODE = '23514';
  END IF;

  boosts_intended := COALESCE(array_length(boost_ids, 1), 0);

  SELECT COALESCE(shekel_balance, 0) INTO wallet_balance
    FROM public.wallets
   WHERE user_id = purchase_user_id
   FOR UPDATE;

  -- Do not consume unrelated earned or promotional currency when the credited
  -- Store currency has already been spent. Record a critical reconciliation
  -- item instead, matching the Royal Pass reversal shortage policy.
  IF shekels_intended > 0 THEN
    IF FOUND AND wallet_balance >= shekels_intended THEN
      shekels_reversed := shekels_intended;
      UPDATE public.wallets
         SET shekel_balance = shekel_balance - shekels_reversed,
             updated_at = now()
       WHERE user_id = purchase_user_id;

      INSERT INTO public.shekel_ledger (
        user_id, kind, shekels_delta, usd_amount, label,
        stripe_session_id, stripe_event_id, metadata
      ) VALUES (
        purchase_user_id, 'bundle_refund', -shekels_reversed, 0,
        'Shekel bundle refund', _stripe_session_id, _stripe_event_id,
        jsonb_build_object(
          'reason', COALESCE(NULLIF(trim(_reason), ''), 'charge.refunded'),
          'original_session_id', _stripe_session_id,
          'stripe_event_id', _stripe_event_id
        )
      );
    ELSE
      needs_reconciliation := true;
    END IF;
  END IF;

  IF boosts_intended > 0 THEN
    UPDATE public.boosts
       SET active = false
     WHERE id = ANY(boost_ids)
       AND active = true;
    GET DIAGNOSTICS boosts_deactivated = ROW_COUNT;
  END IF;

  INSERT INTO public.stripe_store_reversals (
    stripe_session_id, stripe_event_id, user_id, reason, status,
    shekels_intended, shekels_reversed,
    boosts_intended, boosts_deactivated, metadata
  ) VALUES (
    _stripe_session_id,
    _stripe_event_id,
    purchase_user_id,
    COALESCE(NULLIF(trim(_reason), ''), 'charge.refunded'),
    CASE WHEN needs_reconciliation THEN 'needs_reconciliation' ELSE 'reversed' END,
    shekels_intended,
    shekels_reversed,
    boosts_intended,
    boosts_deactivated,
    jsonb_build_object(
      'wallet_balance_before', wallet_balance,
      'unrecovered_shekels', shekels_intended - shekels_reversed,
      'boost_ids', boost_ids
    )
  )
  RETURNING id INTO reversal_id;

  INSERT INTO public.admin_audit_log (actor_id, action, target_type, target_id, details)
  VALUES (
    NULL,
    'stripe_store_purchase_reversed',
    'stripe_checkout_session',
    _stripe_session_id,
    jsonb_build_object(
      'actor_type', 'stripe_webhook',
      'stripe_event_id', _stripe_event_id,
      'user_id', purchase_user_id,
      'reason', COALESCE(NULLIF(trim(_reason), ''), 'charge.refunded'),
      'shekels_intended', shekels_intended,
      'shekels_reversed', shekels_reversed,
      'boosts_intended', boosts_intended,
      'boosts_deactivated', boosts_deactivated,
      'needs_reconciliation', needs_reconciliation,
      'reversal_id', reversal_id
    )
  );

  IF needs_reconciliation THEN
    INSERT INTO public.admin_alerts (category, severity, title, body, metadata)
    VALUES (
      'stripe_store_refund_needs_reconciliation',
      'critical',
      'Store refund needs reconciliation',
      format(
        'Session %s for user %s was refunded but %s of %s Shekels could not be recovered.',
        _stripe_session_id,
        purchase_user_id,
        shekels_intended - shekels_reversed,
        shekels_intended
      ),
      jsonb_build_object(
        'stripe_session_id', _stripe_session_id,
        'stripe_event_id', _stripe_event_id,
        'user_id', purchase_user_id,
        'wallet_balance_before', wallet_balance,
        'unrecovered_shekels', shekels_intended - shekels_reversed,
        'reversal_id', reversal_id
      )
    );
  END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'reversal_id', reversal_id,
    'status', CASE WHEN needs_reconciliation THEN 'needs_reconciliation' ELSE 'reversed' END,
    'shekels_intended', shekels_intended,
    'shekels_reversed', shekels_reversed,
    'boosts_intended', boosts_intended,
    'boosts_deactivated', boosts_deactivated,
    'needs_reconciliation', needs_reconciliation
  );
EXCEPTION WHEN unique_violation THEN
  SELECT * INTO existing_reversal
    FROM public.stripe_store_reversals
   WHERE stripe_session_id = _stripe_session_id;
  IF FOUND THEN
    RETURN jsonb_build_object(
      'ok', true,
      'already_processed', true,
      'concurrent', true,
      'reversal_id', existing_reversal.id,
      'status', existing_reversal.status,
      'shekels_reversed', existing_reversal.shekels_reversed,
      'boosts_deactivated', existing_reversal.boosts_deactivated
    );
  END IF;
  RAISE;
END;
$function$;

REVOKE ALL ON FUNCTION public.handle_store_refund(text, text, text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.handle_store_refund(text, text, text)
  TO service_role;
