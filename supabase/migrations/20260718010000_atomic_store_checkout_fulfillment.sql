-- Atomically fulfill a paid Store Checkout Session.
--
-- The webhook previously inserted a ledger row, created boosts, and updated
-- the wallet in separate HTTP operations. A failure between those operations
-- could leave an immutable receipt without the purchased balance, causing a
-- retry to be treated as a duplicate. One SECURITY DEFINER transaction now
-- owns the complete state change and serializes retries by Checkout Session.

CREATE OR REPLACE FUNCTION public.fulfill_store_checkout(
  _user_id uuid,
  _stripe_session_id text,
  _stripe_event_id text,
  _shekels numeric,
  _usd_amount numeric,
  _label text,
  _boosts jsonb DEFAULT '[]'::jsonb,
  _metadata jsonb DEFAULT '{}'::jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_boost jsonb;
  v_boost_id uuid;
  v_boost_ids uuid[] := ARRAY[]::uuid[];
  v_boost_type text;
  v_duration_hours integer;
  v_post_id uuid;
  v_ledger_id uuid;
  v_existing_id uuid;
  v_kind text;
BEGIN
  IF _user_id IS NULL OR NULLIF(btrim(_stripe_session_id), '') IS NULL
     OR NULLIF(btrim(_stripe_event_id), '') IS NULL THEN
    RAISE EXCEPTION 'Missing Store fulfillment identity';
  END IF;
  IF COALESCE(_shekels, 0) < 0 OR COALESCE(_usd_amount, 0) < 0 THEN
    RAISE EXCEPTION 'Store fulfillment amounts cannot be negative';
  END IF;
  IF jsonb_typeof(COALESCE(_boosts, '[]'::jsonb)) <> 'array' THEN
    RAISE EXCEPTION 'Store boosts must be a JSON array';
  END IF;
  IF COALESCE(_shekels, 0) = 0 AND jsonb_array_length(COALESCE(_boosts, '[]'::jsonb)) = 0 THEN
    RAISE EXCEPTION 'Store checkout has no fulfillable items';
  END IF;
  -- create-checkout intentionally creates exactly one quantity-one line item.
  -- Reject dashboard-created mixed carts instead of inventing ambiguous refund
  -- semantics for a session that did not originate in CrownMe.
  IF (COALESCE(_shekels, 0) > 0 AND jsonb_array_length(COALESCE(_boosts, '[]'::jsonb)) > 0)
     OR jsonb_array_length(COALESCE(_boosts, '[]'::jsonb)) > 1 THEN
    RAISE EXCEPTION 'Store checkout must contain exactly one product';
  END IF;

  -- Serialize separate Stripe deliveries that refer to the same session.
  PERFORM pg_advisory_xact_lock(hashtextextended(_stripe_session_id, 0));

  SELECT id INTO v_existing_id
  FROM public.shekel_ledger
  WHERE stripe_session_id = _stripe_session_id
    AND kind <> 'bundle_refund'
  LIMIT 1;

  IF v_existing_id IS NOT NULL THEN
    RETURN jsonb_build_object(
      'success', true,
      'duplicate', true,
      'ledger_id', v_existing_id
    );
  END IF;

  IF COALESCE(_shekels, 0) > 0 THEN
    INSERT INTO public.wallets (user_id, shekel_balance, updated_at)
    VALUES (_user_id, _shekels, now())
    ON CONFLICT (user_id) DO UPDATE
      SET shekel_balance = public.wallets.shekel_balance + EXCLUDED.shekel_balance,
          updated_at = now();
  END IF;

  FOR v_boost IN SELECT value FROM jsonb_array_elements(COALESCE(_boosts, '[]'::jsonb))
  LOOP
    v_boost_type := v_boost ->> 'boost_type';
    v_duration_hours := COALESCE((v_boost ->> 'duration_hours')::integer, 0);
    IF v_boost_type NOT IN (
      'royal_boost', 'vote_boost', 'crown_spotlight', 'profile_glow', 'crown_shield'
    ) OR v_duration_hours < 1 OR v_duration_hours > 720 THEN
      RAISE EXCEPTION 'Invalid Store boost configuration';
    END IF;

    v_post_id := NULL;
    IF NULLIF(v_boost ->> 'post_id', '') IS NOT NULL THEN
      SELECT p.id INTO v_post_id
      FROM public.posts p
      WHERE p.id = (v_boost ->> 'post_id')::uuid
        AND p.user_id = _user_id
        AND COALESCE(p.is_removed, false) = false;
      IF v_post_id IS NULL THEN
        RAISE EXCEPTION 'Invalid Store boost target';
      END IF;
    END IF;

    IF v_boost_type IN ('royal_boost', 'vote_boost', 'crown_spotlight', 'crown_shield')
       AND v_post_id IS NULL THEN
      RAISE EXCEPTION 'Post-targeted Store boost requires a valid post';
    END IF;

    INSERT INTO public.boosts (
      user_id, post_id, boost_type, active, expires_at, source
    ) VALUES (
      _user_id,
      v_post_id,
      v_boost_type::public.boost_type,
      true,
      now() + make_interval(hours => v_duration_hours),
      'stripe'
    ) RETURNING id INTO v_boost_id;
    v_boost_ids := array_append(v_boost_ids, v_boost_id);
  END LOOP;

  v_kind := CASE WHEN COALESCE(_shekels, 0) > 0 THEN 'bundle_purchase' ELSE 'boost_stripe' END;

  INSERT INTO public.shekel_ledger (
    user_id,
    kind,
    shekels_delta,
    usd_amount,
    label,
    stripe_session_id,
    stripe_event_id,
    reference_id,
    metadata
  ) VALUES (
    _user_id,
    v_kind,
    COALESCE(_shekels, 0),
    COALESCE(_usd_amount, 0),
    COALESCE(NULLIF(btrim(_label), ''), 'CrownMe Store purchase'),
    _stripe_session_id,
    _stripe_event_id,
    v_boost_ids[1],
    COALESCE(_metadata, '{}'::jsonb) || jsonb_build_object('boost_ids', to_jsonb(v_boost_ids))
  ) RETURNING id INTO v_ledger_id;

  RETURN jsonb_build_object(
    'success', true,
    'duplicate', false,
    'ledger_id', v_ledger_id,
    'boost_ids', to_jsonb(v_boost_ids),
    'shekels', COALESCE(_shekels, 0)
  );
END;
$$;

REVOKE ALL ON FUNCTION public.fulfill_store_checkout(
  uuid, text, text, numeric, numeric, text, jsonb, jsonb
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fulfill_store_checkout(
  uuid, text, text, numeric, numeric, text, jsonb, jsonb
) TO service_role;

COMMENT ON FUNCTION public.fulfill_store_checkout(
  uuid, text, text, numeric, numeric, text, jsonb, jsonb
) IS 'Service-role-only, atomic and idempotent Stripe Store fulfillment.';
