
DO $$
DECLARE
  v_user uuid := '83cd9e7d-9173-4248-95a3-91e2e08fe403';
  v_plan uuid;
  v_grant_id uuid;
BEGIN
  SELECT id INTO v_plan FROM public.royal_pass_plans ORDER BY created_at LIMIT 1;

  INSERT INTO public.royal_pass_subscriptions
    (user_id, plan_id, status, current_period_start, current_period_end, cancel_at_period_end, stripe_customer_id, stripe_subscription_id)
  VALUES
    (v_user, v_plan, 'active', now(), now() + interval '30 days', false, 'cus_qa_tcdotworld', 'sub_qa_tcdotworld')
  ON CONFLICT (user_id) DO UPDATE SET
    status='active', current_period_start=now(),
    current_period_end=now() + interval '30 days',
    cancel_at_period_end=false, updated_at=now();

  INSERT INTO public.royal_pass_grants
    (user_id, stripe_event_id, stripe_invoice_id, period_start, period_end,
     shields_granted, shekels_granted, boost_tokens_granted, founder_granted, status)
  VALUES
    (v_user, 'evt_qa_tcdotworld', 'in_qa_tcdotworld', now(), now() + interval '30 days',
     5, 500, 4, true, 'granted')
  RETURNING id INTO v_grant_id;

  INSERT INTO public.royal_pass_shield_allowances
    (user_id, royal_pass_grant_id, period_start, period_end, shields_granted, shields_used)
  VALUES (v_user, v_grant_id, now(), now() + interval '30 days', 5, 0);

  INSERT INTO public.founder_grants
    (user_id, stripe_invoice_id, qualifying_invoice_id, paid_amount_cents, original_paid_amount_cents, status)
  VALUES (v_user, 'in_qa_tcdotworld', 'in_qa_tcdotworld', 999, 999, 'active')
  ON CONFLICT DO NOTHING;
END $$;
