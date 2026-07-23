ALTER TABLE public.stripe_store_reversals
  DROP CONSTRAINT IF EXISTS stripe_store_reversals_stripe_session_id_key;

CREATE INDEX IF NOT EXISTS stripe_store_reversals_session_id_idx
  ON public.stripe_store_reversals (stripe_session_id);

ALTER TABLE public.stripe_store_reversals
  DROP CONSTRAINT IF EXISTS stripe_store_reversals_status_check;
ALTER TABLE public.stripe_store_reversals
  ADD  CONSTRAINT stripe_store_reversals_status_check
  CHECK (status = ANY (ARRAY['reversed'::text,'partially_reversed'::text,'needs_reconciliation'::text]));

CREATE OR REPLACE FUNCTION public.handle_store_partial_refund(
  _stripe_event_id text,
  _stripe_session_id text,
  _refunded_cents integer,
  _original_cents integer,
  _reason text DEFAULT 'charge.refunded.partial'
) RETURNS jsonb
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public'
AS $$
DECLARE
  purchase_user_id uuid;
  shekels_intended numeric := 0;
  shekels_to_reverse numeric := 0;
  already_reversed numeric := 0;
  remaining numeric := 0;
  reversal_id uuid;
BEGIN
  IF NULLIF(trim(_stripe_event_id), '') IS NULL THEN
    RAISE EXCEPTION 'partial_refund: event id required' USING ERRCODE = '22023';
  END IF;
  IF NULLIF(trim(_stripe_session_id), '') IS NULL THEN
    RAISE EXCEPTION 'partial_refund: session id required' USING ERRCODE = '22023';
  END IF;
  IF _refunded_cents IS NULL OR _original_cents IS NULL OR _original_cents <= 0 THEN
    RAISE EXCEPTION 'partial_refund: invalid amounts' USING ERRCODE = '22023';
  END IF;

  IF EXISTS (SELECT 1 FROM public.stripe_store_reversals WHERE stripe_event_id = _stripe_event_id) THEN
    RETURN jsonb_build_object('ok', true, 'already_processed', true);
  END IF;

  SELECT (array_agg(DISTINCT user_id))[1],
         COALESCE(sum(shekels_delta) FILTER (WHERE kind = 'bundle_purchase' AND shekels_delta > 0), 0)
    INTO purchase_user_id, shekels_intended
    FROM public.shekel_ledger
   WHERE stripe_session_id = _stripe_session_id
     AND kind IN ('bundle_purchase','boost_stripe');

  IF purchase_user_id IS NULL OR shekels_intended <= 0 THEN
    RETURN jsonb_build_object('ok', true, 'no_store_purchase_found', true);
  END IF;

  SELECT COALESCE(-sum(shekels_delta), 0) INTO already_reversed
    FROM public.shekel_ledger
   WHERE stripe_session_id = _stripe_session_id
     AND kind = 'bundle_refund';

  shekels_to_reverse := round(shekels_intended * (_refunded_cents::numeric / _original_cents::numeric));
  remaining := shekels_intended - already_reversed;
  IF shekels_to_reverse > remaining THEN shekels_to_reverse := remaining; END IF;
  IF shekels_to_reverse < 0 THEN shekels_to_reverse := 0; END IF;

  IF shekels_to_reverse > 0 THEN
    UPDATE public.wallets
       SET shekel_balance = shekel_balance - shekels_to_reverse,
           updated_at = now()
     WHERE user_id = purchase_user_id;

    INSERT INTO public.shekel_ledger (
      user_id, kind, shekels_delta, usd_amount, label,
      stripe_session_id, stripe_event_id, metadata
    ) VALUES (
      purchase_user_id, 'bundle_refund', -shekels_to_reverse, 0,
      'Shekel bundle partial refund', _stripe_session_id, _stripe_event_id,
      jsonb_build_object(
        'reason', _reason,
        'refunded_cents', _refunded_cents,
        'original_cents', _original_cents,
        'shekels_intended', shekels_intended,
        'already_reversed', already_reversed
      )
    );
  END IF;

  INSERT INTO public.stripe_store_reversals (
    stripe_session_id, stripe_event_id, user_id, reason, status,
    shekels_intended, shekels_reversed, boosts_intended, boosts_deactivated, metadata
  ) VALUES (
    _stripe_session_id, _stripe_event_id, purchase_user_id, _reason,
    'partially_reversed', shekels_intended, shekels_to_reverse, 0, 0,
    jsonb_build_object(
      'refunded_cents', _refunded_cents,
      'original_cents', _original_cents,
      'already_reversed_before', already_reversed
    )
  ) RETURNING id INTO reversal_id;

  RETURN jsonb_build_object(
    'ok', true,
    'reversal_id', reversal_id,
    'shekels_intended', shekels_intended,
    'shekels_reversed_this_event', shekels_to_reverse,
    'shekels_reversed_total', already_reversed + shekels_to_reverse
  );
END;
$$;

REVOKE ALL ON FUNCTION public.handle_store_partial_refund(text,text,integer,integer,text) FROM public;
GRANT EXECUTE ON FUNCTION public.handle_store_partial_refund(text,text,integer,integer,text) TO service_role;