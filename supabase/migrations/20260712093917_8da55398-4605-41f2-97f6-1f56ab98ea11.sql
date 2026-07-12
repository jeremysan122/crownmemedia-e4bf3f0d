
DO $harness$
DECLARE
  test_user  uuid := '00000000-0000-0000-0000-0000000099e1';
  test_user2 uuid := '00000000-0000-0000-0000-0000000099e2';
  test_user4 uuid := '00000000-0000-0000-0000-0000000099e4';
  test_user5 uuid := '00000000-0000-0000-0000-0000000099e5';
  test_user6 uuid := '00000000-0000-0000-0000-0000000099e6';
  grant_id uuid; allowance_id uuid;
  royal_shield_id uuid; paid_shield_id uuid; expired_shield_id uuid;
  test_post_id uuid;
  refund_result jsonb; refund_result2 jsonb;
  rein_result jsonb; rein_result2 jsonb;
  founder_before record; founder_after record;
  wallet_bal numeric; bt_bal int; grant_row record;
BEGIN
  SET LOCAL session_replication_role = 'replica';

  INSERT INTO public.profiles (id, boost_tokens_balance, username, is_founder) VALUES
    (test_user,20,'harness_a',false),(test_user2,20,'harness_b',false),
    (test_user4,5,'harness_d',false),(test_user5,20,'harness_e',false),
    (test_user6,20,'harness_f',false);
  INSERT INTO public.wallets (user_id, shekel_balance) VALUES
    (test_user,1000),(test_user2,1000),(test_user4,500),(test_user5,1000),(test_user6,1000);

  -- A
  INSERT INTO public.royal_pass_grants (user_id, stripe_event_id, stripe_invoice_id, stripe_payment_intent_id, stripe_charge_id, stripe_dispute_id, period_start, period_end, shields_granted, shekels_granted, boost_tokens_granted, founder_granted, promo_shekels_remaining, promo_boost_tokens_remaining, status)
  VALUES (test_user,'evt_A_grant','in_A','pi_A','ch_A','dp_A',now(),now()+interval '30 days',5,500,10,true,500,10,'granted') RETURNING id INTO grant_id;
  INSERT INTO public.royal_pass_shield_allowances(user_id,period_start,period_end,shields_granted,shields_used,royal_pass_grant_id)
  VALUES (test_user,now(),now()+interval '30 days',5,1,grant_id);
  INSERT INTO public.founder_grants(user_id,stripe_invoice_id,qualifying_invoice_id,stripe_dispute_id,status,paid_amount_cents,original_paid_amount_cents,granted_at,original_granted_at)
  VALUES (test_user,'in_A','in_A','dp_A','disputed',2999,2999,now()-interval '5 days',now()-interval '5 days');

  refund_result := public.handle_royal_refund('evt_A_lost','dispute_lost','in_A','pi_A','ch_A','reversed');
  RAISE NOTICE 'A=%', refund_result;
  ASSERT (refund_result->>'shekels_reversed')::int=500,'A shekels';
  ASSERT (refund_result->>'boost_tokens_reversed')::int=10,'A tokens';
  ASSERT (refund_result->>'founder_reversed')::boolean,'A founder';
  ASSERT EXISTS(SELECT 1 FROM public.boost_tokens_ledger WHERE user_id=test_user AND reason='royal_reversal' AND delta=-10),'A bt';
  ASSERT EXISTS(SELECT 1 FROM public.shekel_ledger WHERE user_id=test_user AND kind='royal_reversal'),'A shekel';
  ASSERT EXISTS(SELECT 1 FROM public.founder_grants WHERE user_id=test_user AND status='revoked'),'A founder rv';
  ASSERT EXISTS(SELECT 1 FROM public.admin_audit_log WHERE action='royal_grant_reversed' AND target_id=grant_id::text),'A audit';

  -- B
  SELECT shekel_balance INTO wallet_bal FROM public.wallets WHERE user_id=test_user;
  SELECT boost_tokens_balance INTO bt_bal FROM public.profiles WHERE id=test_user;
  refund_result2 := public.handle_royal_refund('evt_A_lost_dup','dispute_lost_dup','in_A','pi_A','ch_A','reversed');
  ASSERT (refund_result2->>'already_processed')::boolean,'B already';
  ASSERT (SELECT COUNT(*) FROM public.royal_pass_reversals WHERE royal_pass_grant_id=grant_id AND event_kind='reversal')=1,'B count';
  ASSERT (SELECT shekel_balance FROM public.wallets WHERE user_id=test_user)=wallet_bal,'B wallet';
  ASSERT (SELECT boost_tokens_balance FROM public.profiles WHERE id=test_user)=bt_bal,'B tokens';

  -- C
  INSERT INTO public.royal_pass_grants (user_id, stripe_event_id, stripe_invoice_id, stripe_payment_intent_id, stripe_charge_id, stripe_dispute_id, period_start, period_end, shields_granted, shekels_granted, boost_tokens_granted, founder_granted, promo_shekels_remaining, promo_boost_tokens_remaining, status)
  VALUES (test_user2,'evt_C_grant','in_C','pi_C','ch_C','dp_C',now(),now()+interval '30 days',5,300,8,true,300,8,'granted') RETURNING id INTO grant_id;
  INSERT INTO public.royal_pass_shield_allowances(user_id,period_start,period_end,shields_granted,shields_used,royal_pass_grant_id)
  VALUES (test_user2,now(),now()+interval '30 days',5,0,grant_id);
  INSERT INTO public.founder_grants(user_id,stripe_invoice_id,qualifying_invoice_id,stripe_dispute_id,status,paid_amount_cents,original_paid_amount_cents,granted_at,original_granted_at)
  VALUES (test_user2,'in_C','in_C','dp_C','disputed',2999,2999,now()-interval '5 days',now()-interval '5 days');
  PERFORM public.handle_royal_refund('evt_C_lost','dispute_lost','in_C','pi_C','ch_C','reversed');

  rein_result := public.handle_royal_dispute_reinstated('evt_C_wrong','in_C','pi_C','ch_C','dp_WRONG');
  ASSERT (rein_result->>'dispute_mismatch')::boolean,'C wrong';
  rein_result := public.handle_royal_dispute_reinstated('evt_C_win','in_C','pi_C','ch_C','dp_C');
  ASSERT (rein_result->>'shekels_restored')::int=300,'C shekels';
  ASSERT (rein_result->>'boost_tokens_restored')::int=8,'C tokens';
  ASSERT (rein_result->>'restored_founder')::boolean,'C founder';
  rein_result2 := public.handle_royal_dispute_reinstated('evt_C_win','in_C','pi_C','ch_C','dp_C');
  ASSERT (rein_result2->>'already_restored')::boolean,'C dup';
  rein_result2 := public.handle_royal_dispute_reinstated('evt_C_win_2','in_C','pi_C','ch_C','dp_C');
  ASSERT COALESCE((rein_result2->>'no_matching_reversal')::boolean,false) OR COALESCE((rein_result2->>'already_restored')::boolean,false),'C alt';
  ASSERT (SELECT COUNT(*) FROM public.royal_pass_reversals WHERE royal_pass_grant_id=grant_id AND event_kind='restoration')=1,'C one';

  -- D
  INSERT INTO public.royal_pass_grants (user_id, stripe_event_id, stripe_invoice_id, stripe_payment_intent_id, stripe_charge_id, stripe_dispute_id, period_start, period_end, shields_granted, shekels_granted, boost_tokens_granted, founder_granted, promo_shekels_remaining, promo_boost_tokens_remaining, status)
  VALUES (test_user4,'evt_D_grant','in_D','pi_D','ch_D','dp_D',now(),now()+interval '30 days',5,1000,10,false,1000,10,'granted') RETURNING id INTO grant_id;
  INSERT INTO public.royal_pass_shield_allowances(user_id,period_start,period_end,shields_granted,shields_used,royal_pass_grant_id)
  VALUES (test_user4,now(),now()+interval '30 days',5,0,grant_id);
  refund_result := public.handle_royal_refund('evt_D_lost','dispute_lost','in_D','pi_D','ch_D','reversed');
  ASSERT (refund_result->>'shekels_reversed')::int=0,'D no debit';
  ASSERT (refund_result->>'needs_reconciliation')::boolean,'D reconcile';
  SELECT * INTO grant_row FROM public.royal_pass_grants WHERE id=grant_id;
  ASSERT grant_row.needs_reconciliation,'D flag';
  ASSERT grant_row.unrecovered_promotional_shekels=1000,'D unrec';
  ASSERT (SELECT shekel_balance FROM public.wallets WHERE user_id=test_user4)=500,'D wallet';
  rein_result := public.handle_royal_dispute_reinstated('evt_D_win','in_D','pi_D','ch_D','dp_D');
  ASSERT (rein_result->>'needs_manual_reconciliation')::boolean,'D blocked';
  ASSERT (SELECT shekel_balance FROM public.wallets WHERE user_id=test_user4)=500,'D wallet2';

  -- E
  INSERT INTO public.royal_pass_grants (user_id, stripe_event_id, stripe_invoice_id, stripe_payment_intent_id, stripe_charge_id, stripe_dispute_id, period_start, period_end, shields_granted, shekels_granted, boost_tokens_granted, founder_granted, promo_shekels_remaining, promo_boost_tokens_remaining, status)
  VALUES (test_user5,'evt_E_grant','in_E','pi_E','ch_E','dp_E',now(),now()+interval '30 days',5,100,5,true,100,5,'granted') RETURNING id INTO grant_id;
  INSERT INTO public.royal_pass_shield_allowances(user_id,period_start,period_end,shields_granted,shields_used,royal_pass_grant_id)
  VALUES (test_user5,now(),now()+interval '30 days',5,0,grant_id);
  INSERT INTO public.founder_grants(user_id,stripe_invoice_id,qualifying_invoice_id,stripe_dispute_id,status,paid_amount_cents,original_paid_amount_cents,granted_at,original_granted_at)
  VALUES (test_user5,'in_E','in_E','dp_E','disputed',4200,4200,'2026-01-01','2026-01-01');
  SELECT * INTO founder_before FROM public.founder_grants WHERE user_id=test_user5;
  PERFORM public.handle_royal_refund('evt_E_lost','dispute_lost','in_E','pi_E','ch_E','reversed');
  PERFORM public.handle_royal_dispute_reinstated('evt_E_win','in_E','pi_E','ch_E','dp_E');
  SELECT * INTO founder_after FROM public.founder_grants WHERE user_id=test_user5;
  ASSERT founder_after.id=founder_before.id,'E id';
  ASSERT founder_after.original_paid_amount_cents=4200,'E paid';
  ASSERT founder_after.original_granted_at=founder_before.original_granted_at,'E granted_at';
  ASSERT founder_after.status='active','E active';
  ASSERT (SELECT COUNT(*) FROM public.founder_grants WHERE user_id=test_user5)=1,'E one';

  -- F
  INSERT INTO public.royal_pass_grants (user_id, stripe_event_id, stripe_invoice_id, stripe_payment_intent_id, stripe_charge_id, stripe_dispute_id, period_start, period_end, shields_granted, shekels_granted, boost_tokens_granted, founder_granted, promo_shekels_remaining, promo_boost_tokens_remaining, status)
  VALUES (test_user6,'evt_F_grant','in_F','pi_F','ch_F','dp_F',now(),now()+interval '30 days',5,100,0,false,100,0,'granted') RETURNING id INTO grant_id;
  INSERT INTO public.royal_pass_shield_allowances(user_id,period_start,period_end,shields_granted,shields_used,royal_pass_grant_id)
  VALUES (test_user6,now(),now()+interval '30 days',5,2,grant_id) RETURNING id INTO allowance_id;

  test_post_id := gen_random_uuid();
  INSERT INTO public.posts (id, user_id, caption, image_url, created_at)
  VALUES (test_post_id, test_user6, 'harness', 'https://placeholder/harness.jpg', now());

  INSERT INTO public.boosts (user_id, post_id, boost_type, active, started_at, expires_at, source, royal_pass_grant_id, royal_pass_shield_allowance_id)
  VALUES (test_user6,test_post_id,'crown_shield',true,now(),now()+interval '20 hours','royal_pass',grant_id,allowance_id) RETURNING id INTO royal_shield_id;
  INSERT INTO public.boosts (user_id, post_id, boost_type, active, started_at, expires_at, source, royal_pass_grant_id, royal_pass_shield_allowance_id)
  VALUES (test_user6,test_post_id,'crown_shield',true,now()-interval '2 days',now()+interval '1 hour','royal_pass',grant_id,allowance_id) RETURNING id INTO expired_shield_id;
  INSERT INTO public.boosts (user_id, post_id, boost_type, active, started_at, expires_at, source, royal_pass_grant_id)
  VALUES (test_user6,test_post_id,'crown_shield',true,now(),now()+interval '12 hours','purchase',NULL) RETURNING id INTO paid_shield_id;

  PERFORM public.handle_royal_refund('evt_F_lost','dispute_lost','in_F','pi_F','ch_F','reversed');
  ASSERT (SELECT active FROM public.boosts WHERE id=royal_shield_id)=false,'F royal off';
  ASSERT (SELECT active FROM public.boosts WHERE id=expired_shield_id)=false,'F 2 off';
  ASSERT (SELECT active FROM public.boosts WHERE id=paid_shield_id)=true,'F paid';

  UPDATE public.boosts SET expires_at = now()-interval '1 hour' WHERE id=expired_shield_id;

  rein_result := public.handle_royal_dispute_reinstated('evt_F_win','in_F','pi_F','ch_F','dp_F');
  ASSERT (SELECT active FROM public.boosts WHERE id=royal_shield_id)=true,'F royal on';
  ASSERT (SELECT active FROM public.boosts WHERE id=expired_shield_id)=false,'F exp off';
  ASSERT (rein_result->>'expired_shields_converted_to_credits')::int>=1,'F conv';

  -- CLEANUP
  DELETE FROM public.royal_pass_reversals WHERE user_id IN (test_user,test_user2,test_user4,test_user5,test_user6);
  DELETE FROM public.boost_tokens_ledger  WHERE user_id IN (test_user,test_user2,test_user4,test_user5,test_user6);
  DELETE FROM public.shekel_ledger        WHERE user_id IN (test_user,test_user2,test_user4,test_user5,test_user6);
  DELETE FROM public.admin_alerts         WHERE (metadata->>'user_id')::uuid IN (test_user,test_user2,test_user4,test_user5,test_user6);
  DELETE FROM public.admin_audit_log
   WHERE target_id IN (SELECT id::text FROM public.royal_pass_grants WHERE user_id IN (test_user,test_user2,test_user4,test_user5,test_user6))
      OR target_id IN (SELECT id::text FROM public.founder_grants    WHERE user_id IN (test_user,test_user2,test_user4,test_user5,test_user6));
  DELETE FROM public.boosts                       WHERE user_id IN (test_user,test_user2,test_user4,test_user5,test_user6);
  DELETE FROM public.royal_pass_shield_allowances WHERE user_id IN (test_user,test_user2,test_user4,test_user5,test_user6);
  DELETE FROM public.founder_grants               WHERE user_id IN (test_user,test_user2,test_user4,test_user5,test_user6);
  DELETE FROM public.royal_pass_grants            WHERE user_id IN (test_user,test_user2,test_user4,test_user5,test_user6);
  DELETE FROM public.posts                        WHERE user_id IN (test_user,test_user2,test_user4,test_user5,test_user6);
  DELETE FROM public.wallets                      WHERE user_id IN (test_user,test_user2,test_user4,test_user5,test_user6);
  DELETE FROM public.profiles                     WHERE id      IN (test_user,test_user2,test_user4,test_user5,test_user6);

  RAISE NOTICE 'ROYAL REPAIR RUNTIME A-F: ALL PASSED';
END;
$harness$;
