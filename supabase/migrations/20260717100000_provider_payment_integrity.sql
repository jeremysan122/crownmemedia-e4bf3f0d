-- Atomic/idempotent provider crediting and durable RevenueCat events.

CREATE TABLE IF NOT EXISTS public.revenuecat_events (
  event_id text PRIMARY KEY,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.revenuecat_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.revenuecat_events FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.revenuecat_events TO service_role;

ALTER TABLE public.shekel_ledger
  ADD COLUMN IF NOT EXISTS provider_event_id text;

-- The earlier session-wide index made a legitimate checkout containing more
-- than one line item impossible to record. Idempotency is now scoped to the
-- provider event and ledger kind instead.
DROP INDEX IF EXISTS public.shekel_ledger_stripe_session_unique;

CREATE UNIQUE INDEX IF NOT EXISTS shekel_ledger_provider_event_unique
  ON public.shekel_ledger(kind, provider_event_id);

ALTER TABLE public.boosts ADD COLUMN IF NOT EXISTS provider_event_id text;
ALTER TABLE public.boosts ADD COLUMN IF NOT EXISTS provider_line_key text;

CREATE UNIQUE INDEX IF NOT EXISTS boosts_provider_line_unique
  ON public.boosts(provider_event_id, provider_line_key);

ALTER TABLE public.royal_pass_subscriptions
  ADD COLUMN IF NOT EXISTS provider text NOT NULL DEFAULT 'stripe';
ALTER TABLE public.royal_pass_subscriptions
  ADD COLUMN IF NOT EXISTS provider_subscription_id text;
CREATE UNIQUE INDEX IF NOT EXISTS royal_pass_provider_subscription_unique
  ON public.royal_pass_subscriptions(provider, provider_subscription_id);

ALTER TABLE public.shekel_bundles
  ADD COLUMN IF NOT EXISTS revenuecat_product_id text;
CREATE UNIQUE INDEX IF NOT EXISTS shekel_bundles_revenuecat_product_unique
  ON public.shekel_bundles(revenuecat_product_id);

CREATE UNIQUE INDEX IF NOT EXISTS payment_transactions_provider_event_unique
  ON public.payment_transactions(provider, provider_event_id)
  WHERE provider_event_id IS NOT NULL;

ALTER TABLE public.payment_transactions
  ADD COLUMN IF NOT EXISTS external_reference_id text;

ALTER TABLE public.payment_transactions DROP CONSTRAINT IF EXISTS payment_transactions_provider_check;
ALTER TABLE public.payment_transactions
  ADD CONSTRAINT payment_transactions_provider_check
  CHECK (provider IN ('stripe', 'internal', 'revenuecat'));

ALTER TABLE public.payment_transactions DROP CONSTRAINT IF EXISTS payment_transactions_intent_check;
ALTER TABLE public.payment_transactions
  ADD CONSTRAINT payment_transactions_intent_check
  CHECK (intent IN ('shekel_purchase','boost','royal_pass','verification','gift','payout','refund','adjustment'));

ALTER TABLE public.payment_transactions DROP CONSTRAINT IF EXISTS payment_transactions_status_check;
ALTER TABLE public.payment_transactions
  ADD CONSTRAINT payment_transactions_status_check
  CHECK (status IN ('pending','succeeded','failed','refunded','canceled','scheduled_cancel','past_due'));

CREATE OR REPLACE FUNCTION public.credit_provider_shekels(
  _user_id uuid,
  _provider text,
  _provider_event_id text,
  _amount integer,
  _label text,
  _metadata jsonb DEFAULT '{}'::jsonb,
  _usd_amount numeric DEFAULT NULL,
  _stripe_event_id text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_ledger_id uuid;
BEGIN
  IF _provider NOT IN ('revenuecat', 'stripe') THEN RAISE EXCEPTION 'unsupported provider'; END IF;
  IF _provider_event_id IS NULL OR length(_provider_event_id) < 3 THEN RAISE EXCEPTION 'provider event required'; END IF;
  IF _amount IS NULL OR _amount <= 0 OR _amount > 1000000 THEN RAISE EXCEPTION 'invalid credit amount'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = _user_id) THEN RAISE EXCEPTION 'user not found'; END IF;

  INSERT INTO public.shekel_ledger(
    user_id, kind, shekels_delta, usd_amount, label, provider_event_id,
    stripe_session_id, stripe_event_id, metadata
  ) VALUES (
    _user_id,
    CASE WHEN _provider = 'stripe' THEN 'bundle_purchase' ELSE 'bundle_purchase_revenuecat' END,
    _amount,
    _usd_amount,
    left(COALESCE(_label, initcap(_provider) || ' purchase'), 160),
    _provider_event_id,
    CASE WHEN _provider = 'stripe' THEN _provider_event_id ELSE NULL END,
    CASE WHEN _provider = 'stripe' THEN _stripe_event_id ELSE NULL END,
    COALESCE(_metadata, '{}'::jsonb) || jsonb_build_object('provider', _provider)
  )
  ON CONFLICT (kind, provider_event_id)
  DO NOTHING
  RETURNING id INTO v_ledger_id;

  IF v_ledger_id IS NULL THEN
    RETURN jsonb_build_object('ok', true, 'already_credited', true);
  END IF;

  INSERT INTO public.wallets(user_id, shekel_balance)
  VALUES (_user_id, _amount)
  ON CONFLICT (user_id) DO UPDATE
    SET shekel_balance = public.wallets.shekel_balance + EXCLUDED.shekel_balance,
        updated_at = now();

  RETURN jsonb_build_object('ok', true, 'already_credited', false, 'ledger_id', v_ledger_id);
END;
$$;

REVOKE ALL ON FUNCTION public.credit_provider_shekels(uuid, text, text, integer, text, jsonb, numeric, text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.credit_provider_shekels(uuid, text, text, integer, text, jsonb, numeric, text)
  TO service_role;

CREATE OR REPLACE FUNCTION public.reverse_provider_shekel_purchase(
  _user_id uuid,
  _provider text,
  _purchase_event_id text,
  _reversal_event_id text,
  _reason text DEFAULT 'provider refund'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_purchase public.shekel_ledger%ROWTYPE;
  v_reversal_id uuid;
BEGIN
  IF _provider <> 'revenuecat' THEN RAISE EXCEPTION 'unsupported provider reversal'; END IF;
  IF _purchase_event_id IS NULL OR _reversal_event_id IS NULL THEN
    RAISE EXCEPTION 'purchase and reversal events are required';
  END IF;

  SELECT * INTO v_purchase
    FROM public.shekel_ledger
   WHERE user_id = _user_id
     AND kind = 'bundle_purchase_revenuecat'
     AND provider_event_id = _purchase_event_id
     AND shekels_delta > 0
   FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'credited provider purchase not found'; END IF;

  INSERT INTO public.shekel_ledger(
    user_id, kind, shekels_delta, usd_amount, label, provider_event_id, metadata
  ) VALUES (
    _user_id,
    'bundle_refund_revenuecat',
    -v_purchase.shekels_delta,
    -COALESCE(v_purchase.usd_amount, 0),
    left(COALESCE(_reason, 'RevenueCat refund'), 160),
    _reversal_event_id,
    jsonb_build_object(
      'provider', _provider,
      'purchase_event_id', _purchase_event_id,
      'purchase_ledger_id', v_purchase.id
    )
  )
  ON CONFLICT (kind, provider_event_id)
  DO NOTHING
  RETURNING id INTO v_reversal_id;

  IF v_reversal_id IS NULL THEN
    RETURN jsonb_build_object('ok', true, 'already_reversed', true);
  END IF;

  -- Keep the debt visible if refunded currency has already been spent. All
  -- normal debit RPCs reject insufficient balances, and later credits repay it.
  UPDATE public.wallets
     SET shekel_balance = shekel_balance - v_purchase.shekels_delta,
         updated_at = now()
   WHERE user_id = _user_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'wallet not found'; END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'already_reversed', false,
    'ledger_id', v_reversal_id,
    'shekels_reversed', v_purchase.shekels_delta
  );
END;
$$;

REVOKE ALL ON FUNCTION public.reverse_provider_shekel_purchase(uuid, text, text, text, text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.reverse_provider_shekel_purchase(uuid, text, text, text, text)
  TO service_role;

CREATE OR REPLACE FUNCTION public.reverse_stripe_one_time_purchase(
  _stripe_payment_intent_id text,
  _provider_event_id text,
  _refund_fraction numeric DEFAULT 1,
  _reason text DEFAULT 'Stripe refund or lost dispute'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_purchase public.shekel_ledger%ROWTYPE;
  v_target numeric;
  v_already numeric;
  v_to_reverse numeric;
  v_reversal_id uuid;
  v_matches integer := 0;
  v_shekels numeric := 0;
  v_boosts integer := 0;
BEGIN
  IF _stripe_payment_intent_id IS NULL OR _provider_event_id IS NULL THEN
    RAISE EXCEPTION 'payment intent and provider event are required';
  END IF;
  IF _refund_fraction IS NULL OR _refund_fraction <= 0 OR _refund_fraction > 1 THEN
    RAISE EXCEPTION 'refund fraction must be greater than 0 and at most 1';
  END IF;

  FOR v_purchase IN
    SELECT *
      FROM public.shekel_ledger
     WHERE kind IN ('bundle_purchase','boost_stripe')
       AND metadata->>'stripe_payment_intent_id' = _stripe_payment_intent_id
     FOR UPDATE
  LOOP
    v_matches := v_matches + 1;
    IF v_purchase.kind = 'bundle_purchase' THEN
      v_target := round(v_purchase.shekels_delta * _refund_fraction);
      SELECT COALESCE(sum(-l.shekels_delta), 0) INTO v_already
        FROM public.shekel_ledger l
       WHERE l.kind = 'provider_refund_stripe'
         AND l.metadata->>'source_ledger_id' = v_purchase.id::text;
      v_to_reverse := GREATEST(v_target - v_already, 0);
      IF v_to_reverse > 0 THEN
        v_reversal_id := NULL;
        INSERT INTO public.shekel_ledger(
          user_id, kind, shekels_delta, usd_amount, label, provider_event_id, metadata
        ) VALUES (
          v_purchase.user_id,
          'provider_refund_stripe',
          -v_to_reverse,
          -round(
            COALESCE(v_purchase.usd_amount, 0)
            * (v_to_reverse / NULLIF(v_purchase.shekels_delta, 0)),
            2
          ),
          left(COALESCE(_reason, 'Stripe refund'), 160),
          _provider_event_id || ':' || v_purchase.id::text,
          jsonb_build_object(
            'provider', 'stripe',
            'stripe_payment_intent_id', _stripe_payment_intent_id,
            'source_ledger_id', v_purchase.id,
            'refund_fraction', _refund_fraction
          )
        )
        ON CONFLICT (kind, provider_event_id) DO NOTHING
        RETURNING id INTO v_reversal_id;

        IF v_reversal_id IS NOT NULL THEN
          UPDATE public.wallets
             SET shekel_balance = shekel_balance - v_to_reverse,
                 updated_at = now()
           WHERE user_id = v_purchase.user_id;
          IF NOT FOUND THEN RAISE EXCEPTION 'wallet not found'; END IF;
          v_shekels := v_shekels + v_to_reverse;
        END IF;
      END IF;
    ELSIF _refund_fraction = 1 THEN
      UPDATE public.boosts
         SET active = false
       WHERE id = v_purchase.reference_id
         AND user_id = v_purchase.user_id
         AND active = true;
      IF FOUND THEN v_boosts := v_boosts + 1; END IF;

      INSERT INTO public.shekel_ledger(
        user_id, kind, shekels_delta, usd_amount, label,
        provider_event_id, reference_id, metadata
      ) VALUES (
        v_purchase.user_id, 'provider_refund_stripe', 0,
        -COALESCE(v_purchase.usd_amount, 0),
        left(COALESCE(_reason, 'Stripe refund'), 160),
        _provider_event_id || ':' || v_purchase.id::text,
        v_purchase.reference_id,
        jsonb_build_object(
          'provider', 'stripe',
          'stripe_payment_intent_id', _stripe_payment_intent_id,
          'source_ledger_id', v_purchase.id,
          'boost_revoked', true
        )
      )
      ON CONFLICT (kind, provider_event_id) DO NOTHING;
    END IF;
  END LOOP;

  RETURN jsonb_build_object(
    'ok', true,
    'matched_ledger_rows', v_matches,
    'shekels_reversed', v_shekels,
    'boosts_revoked', v_boosts
  );
END;
$$;

REVOKE ALL ON FUNCTION public.reverse_stripe_one_time_purchase(text, text, numeric, text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.reverse_stripe_one_time_purchase(text, text, numeric, text)
  TO service_role;

NOTIFY pgrst, 'reload schema';
