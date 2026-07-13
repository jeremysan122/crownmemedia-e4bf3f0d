
-- I) debit_boost_token: admin_audit_log column is target_type, not target_kind
DO $mig$
DECLARE src text; patched text;
BEGIN
  SELECT pg_get_functiondef(oid) INTO src FROM pg_proc
   WHERE proname='debit_boost_token' AND pronamespace='public'::regnamespace;
  patched := replace(src, 'admin_audit_log(actor_id, action, target_kind, target_id, metadata)',
                          'admin_audit_log(actor_id, action, target_type, target_id, details)');
  IF patched = src THEN
    -- alt naming
    patched := replace(src, 'target_kind', 'target_type');
    patched := replace(patched, ', metadata)', ', details)');
  END IF;
  IF patched = src THEN RAISE EXCEPTION 'debit_boost_token: target_kind not found'; END IF;
  EXECUTE patched;
END $mig$;

-- C) handle_royal_dispute_reinstated: if no matching reversal exists (no funds were debited on dispute),
-- still restore the grant status so lifecycle completes correctly.
CREATE OR REPLACE FUNCTION public.__reinstate_status_only(_grant_id uuid, _event_id text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  UPDATE public.royal_pass_grants
     SET status = COALESCE(pre_dispute_status, 'granted'),
         dispute_status = 'funds_reinstated',
         dispute_resolved_at = now(),
         reversed_at = NULL, reversed_reason = NULL,
         restoration_completed_at = now(),
         restoration_source_event_id = _event_id
   WHERE id = _grant_id
     AND status = 'disputed';
END; $$;
REVOKE EXECUTE ON FUNCTION public.__reinstate_status_only(uuid,text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.__reinstate_status_only(uuid,text) TO service_role;

DO $mig$
DECLARE src text; patched text;
BEGIN
  SELECT pg_get_functiondef(oid) INTO src FROM pg_proc
   WHERE proname='handle_royal_dispute_reinstated' AND pronamespace='public'::regnamespace;
  patched := replace(
    src,
    E'IF reversal_row.id IS NULL THEN\n    RETURN jsonb_build_object(''ok'', true, ''no_matching_reversal'', true, ''grant_id'', grant_row.id);\n  END IF;',
    E'IF reversal_row.id IS NULL THEN\n    PERFORM public.__reinstate_status_only(grant_row.id, _stripe_event_id);\n    RETURN jsonb_build_object(''ok'', true, ''no_matching_reversal'', true, ''status_restored'', true, ''grant_id'', grant_row.id);\n  END IF;'
  );
  IF patched = src THEN RAISE EXCEPTION 'reinstate patch: fragment not found'; END IF;
  EXECUTE patched;
END $mig$;
