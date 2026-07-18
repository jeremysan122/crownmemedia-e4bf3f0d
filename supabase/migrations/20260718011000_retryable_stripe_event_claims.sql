-- Track Stripe webhook processing separately from receipt. A primary-key row
-- is not proof that fulfillment completed; failures must remain retryable.

ALTER TABLE public.stripe_events
  ADD COLUMN IF NOT EXISTS processing_started_at timestamptz,
  ADD COLUMN IF NOT EXISTS processed_at timestamptz,
  ADD COLUMN IF NOT EXISTS last_error text,
  ADD COLUMN IF NOT EXISTS attempt_count integer NOT NULL DEFAULT 1;

-- Rows written before this migration represented successfully acknowledged
-- events, so preserve their duplicate behavior.
UPDATE public.stripe_events
SET processed_at = COALESCE(processed_at, received_at),
    processing_started_at = COALESCE(processing_started_at, received_at)
WHERE processed_at IS NULL
  AND processing_started_at IS NULL;

CREATE OR REPLACE FUNCTION public.claim_stripe_event(
  _event_id text,
  _event_type text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_row public.stripe_events%ROWTYPE;
BEGIN
  IF NULLIF(btrim(_event_id), '') IS NULL OR NULLIF(btrim(_event_type), '') IS NULL THEN
    RAISE EXCEPTION 'Stripe event id and type are required';
  END IF;

  INSERT INTO public.stripe_events (
    id, type, processing_started_at, processed_at, last_error, attempt_count
  ) VALUES (
    _event_id, _event_type, now(), NULL, NULL, 1
  ) ON CONFLICT (id) DO NOTHING;

  IF FOUND THEN
    RETURN jsonb_build_object('claimed', true, 'attempt', 1);
  END IF;

  SELECT * INTO v_row
  FROM public.stripe_events
  WHERE id = _event_id
  FOR UPDATE;

  IF v_row.processed_at IS NOT NULL THEN
    RETURN jsonb_build_object('claimed', false, 'duplicate', true);
  END IF;

  -- A concurrent delivery must not run the same non-Store handler twice. A
  -- recorded failure can retry immediately; an abandoned claim can retry
  -- after five minutes even when the failure marker itself could not persist.
  IF v_row.last_error IS NULL
     AND v_row.processing_started_at > now() - interval '5 minutes' THEN
    RETURN jsonb_build_object('claimed', false, 'in_progress', true);
  END IF;

  UPDATE public.stripe_events
  SET type = _event_type,
      processing_started_at = now(),
      last_error = NULL,
      attempt_count = attempt_count + 1
  WHERE id = _event_id
  RETURNING * INTO v_row;

  RETURN jsonb_build_object('claimed', true, 'attempt', v_row.attempt_count);
END;
$$;

CREATE OR REPLACE FUNCTION public.complete_stripe_event(_event_id text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  UPDATE public.stripe_events
  SET processed_at = now(), last_error = NULL
  WHERE id = _event_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Stripe event claim not found'; END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.fail_stripe_event(_event_id text, _error text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  UPDATE public.stripe_events
  SET last_error = left(COALESCE(_error, 'unknown webhook error'), 2000)
  WHERE id = _event_id
    AND processed_at IS NULL;
END;
$$;

REVOKE ALL ON FUNCTION public.claim_stripe_event(text, text)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.complete_stripe_event(text)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.fail_stripe_event(text, text)
  FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.claim_stripe_event(text, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.complete_stripe_event(text) TO service_role;
GRANT EXECUTE ON FUNCTION public.fail_stripe_event(text, text) TO service_role;
