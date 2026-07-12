
DROP FUNCTION IF EXISTS public.royal_wave82a_dispute_match_selftest();
CREATE FUNCTION public.royal_wave82a_dispute_match_selftest()
RETURNS TABLE(scenario text, result jsonb, ok boolean)
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public','auth'
AS $$
DECLARE
  uid uuid := gen_random_uuid();
  gid uuid;
  res jsonb;
  audit_before_ok int;
  audit_after_ok int;
BEGIN
  INSERT INTO auth.users(id, aud, role, email, instance_id, created_at, updated_at,
    email_confirmed_at, raw_user_meta_data)
  VALUES (uid,'authenticated','authenticated','dm-'||uid||'@selftest.local',
          '00000000-0000-0000-0000-000000000000', now(), now(), now(),
          jsonb_build_object('policies_accepted', true, 'dob','1990-01-01',
                             'username','dm_'||replace(uid::text,'-','')));

  INSERT INTO public.royal_pass_grants(user_id, stripe_event_id, stripe_charge_id,
    stripe_payment_intent_id, stripe_invoice_id, stripe_dispute_id,
    period_start, period_end, shields_granted, shekels_granted, boost_tokens_granted, status)
  VALUES (uid, 'evt_dm_'||uid, 'ch_dm_ok', 'pi_dm_ok', 'in_dm_ok', 'dp_dm_correct',
          now()-interval '1 day', now()+interval '30 days', 5, 500, 3, 'funds_withdrawn')
  RETURNING id INTO gid;

  res := public.handle_royal_dispute_reinstated('evt_dm_r1', NULL, NULL, 'ch_dm_ok', 'dp_dm_wrong');
  scenario:='ch_wrong_dispute'; result:=res; ok:=(res->>'error'='dispute_mismatch'); RETURN NEXT;

  res := public.handle_royal_dispute_reinstated('evt_dm_r2', NULL, 'pi_dm_ok', NULL, NULL);
  scenario:='pi_missing_dispute'; result:=res; ok:=(res->>'error'='dispute_mismatch'); RETURN NEXT;

  res := public.handle_royal_dispute_reinstated('evt_dm_r3','in_dm_ok', NULL, NULL, 'dp_dm_wrong');
  scenario:='inv_wrong_dispute'; result:=res; ok:=(res->>'error'='dispute_mismatch'); RETURN NEXT;

  UPDATE public.royal_pass_grants SET status='refunded' WHERE id = gid;
  res := public.handle_royal_dispute_reinstated('evt_dm_r4', NULL, NULL, 'ch_dm_ok','dp_dm_correct');
  scenario:='refunded_never_restores'; result:=res;
  ok:=(COALESCE(res->>'result','') IN ('skipped_refunded','no_op') OR res ? 'skipped');
  RETURN NEXT;

  UPDATE public.royal_pass_grants SET status='funds_withdrawn' WHERE id = gid;
  SELECT count(*) INTO audit_before_ok FROM public.admin_audit_log
   WHERE target_id = uid::text AND action ILIKE '%reinstat%';
  res := public.handle_royal_dispute_reinstated('evt_dm_r5', NULL, NULL, 'ch_dm_ok','dp_dm_correct');
  SELECT count(*) INTO audit_after_ok FROM public.admin_audit_log
   WHERE target_id = uid::text AND action ILIKE '%reinstat%';
  scenario:='correct_dispute_restores'; result:=res;
  ok:=((res->>'ok' IS NOT NULL OR COALESCE(res->>'result','') IN ('reinstated','restored'))
       AND (SELECT status FROM public.royal_pass_grants WHERE id = gid) = 'granted'
       AND audit_after_ok > audit_before_ok);
  RETURN NEXT;

  BEGIN DELETE FROM public.royal_pass_grants WHERE user_id = uid; EXCEPTION WHEN others THEN NULL; END;
  BEGIN DELETE FROM public.profiles WHERE id = uid; EXCEPTION WHEN others THEN NULL; END;
  BEGIN DELETE FROM auth.users WHERE id = uid; EXCEPTION WHEN others THEN NULL; END;
END; $$;
