
CREATE OR REPLACE FUNCTION public.admin_royal_pass_reconciliation_snapshot()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  _uid uuid := auth.uid();
  _snap jsonb;
  _flag jsonb;
  _grants jsonb;
  _agg jsonb;
BEGIN
  IF _uid IS NULL OR NOT public.has_role(_uid, 'admin'::app_role) THEN
    RAISE EXCEPTION 'admin_only';
  END IF;

  SELECT to_jsonb(f) INTO _flag
    FROM (
      SELECT key, enabled, rollout_percentage, updated_at
        FROM public.feature_flags
       WHERE key IN ('royal_pass_debits_paused','royal_pass_public_launch')
    ) f;

  SELECT jsonb_agg(row_to_json(r)) INTO _grants
    FROM (
      SELECT id, user_id, status, needs_reconciliation, reconciliation_reason,
             unrecovered_promotional_shekels, unrecovered_promotional_boost_tokens,
             shekels_reversed, boost_tokens_reversed, active_shields_reversed,
             reversed_at, reversal_stripe_event_id
        FROM public.royal_pass_grants
       WHERE needs_reconciliation = true
       ORDER BY reversed_at DESC NULLS LAST
       LIMIT 200
    ) r;

  SELECT jsonb_build_object(
    'grants_needing_reconciliation',
      (SELECT count(*) FROM public.royal_pass_grants WHERE needs_reconciliation = true),
    'unrecovered_shekels_total',
      COALESCE((SELECT sum(unrecovered_promotional_shekels)::bigint
                  FROM public.royal_pass_grants WHERE needs_reconciliation = true), 0),
    'unrecovered_boost_tokens_total',
      COALESCE((SELECT sum(unrecovered_promotional_boost_tokens)::bigint
                  FROM public.royal_pass_grants WHERE needs_reconciliation = true), 0),
    'shekel_allocation_reversals_total',
      (SELECT count(*) FROM public.shekel_spend_reversals),
    'boost_token_allocation_reversals_total',
      (SELECT count(*) FROM public.boost_token_spend_reversals),
    'refunded_grants_total',
      (SELECT count(*) FROM public.royal_pass_grants WHERE status IN ('refunded','reversed')),
    'disputed_grants_total',
      (SELECT count(*) FROM public.royal_pass_grants WHERE status = 'disputed')
  ) INTO _agg;

  SELECT jsonb_build_object(
    'flags', (SELECT COALESCE(jsonb_agg(row_to_json(f)), '[]'::jsonb)
                FROM public.feature_flags f
               WHERE key IN ('royal_pass_debits_paused','royal_pass_public_launch')),
    'aggregate', _agg,
    'grants', COALESCE(_grants, '[]'::jsonb),
    'generated_at', now()
  ) INTO _snap;

  RETURN _snap;
END;
$fn$;

REVOKE EXECUTE ON FUNCTION public.admin_royal_pass_reconciliation_snapshot() FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.admin_royal_pass_reconciliation_snapshot() TO authenticated;
