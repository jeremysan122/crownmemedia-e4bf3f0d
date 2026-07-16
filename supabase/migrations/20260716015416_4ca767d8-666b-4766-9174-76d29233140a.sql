CREATE OR REPLACE FUNCTION public.royal_pass_finance_metrics()
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  _caller uuid := auth.uid();
  _active_monthly int;
  _active_annual int;
  _mrr numeric;
  _arr numeric;
  _canceled_30d int;
  _active_30d_ago int;
  _churn numeric;
  _ltv numeric;
  _monthly_price numeric;
  _annual_price numeric;
BEGIN
  IF _caller IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;
  IF NOT (public.has_role(_caller, 'admin') OR public.has_role(_caller, 'super_admin') OR public.has_role(_caller, 'finance_admin')) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  SELECT COALESCE(usd, 9.99) INTO _monthly_price
  FROM public.royal_pass_plans
  WHERE stripe_price_id = 'royal_pass_monthly' OR interval = 'month'
  ORDER BY (stripe_price_id = 'royal_pass_monthly') DESC
  LIMIT 1;
  _monthly_price := COALESCE(_monthly_price, 9.99);

  SELECT COALESCE(usd, 79.99) INTO _annual_price
  FROM public.royal_pass_plans
  WHERE stripe_price_id LIKE '%annual%' OR interval = 'year'
  ORDER BY (stripe_price_id LIKE '%annual%') DESC
  LIMIT 1;
  _annual_price := COALESCE(_annual_price, 79.99);

  SELECT
    COUNT(*) FILTER (WHERE COALESCE(plan_id::text, '') NOT LIKE '%annual%'),
    COUNT(*) FILTER (WHERE plan_id::text LIKE '%annual%')
    INTO _active_monthly, _active_annual
  FROM public.royal_pass_subscriptions
  WHERE status IN ('active','trialing')
    AND (current_period_end IS NULL OR current_period_end > now());

  _mrr := (_active_monthly * _monthly_price) + (_active_annual * _annual_price / 12.0);
  _arr := _mrr * 12;

  SELECT COUNT(*) INTO _canceled_30d
  FROM public.royal_pass_subscriptions
  WHERE status = 'canceled' AND updated_at > now() - interval '30 days';

  _active_30d_ago := GREATEST(_active_monthly + _active_annual + _canceled_30d, 1);
  _churn := _canceled_30d::numeric / _active_30d_ago;
  _ltv := CASE WHEN _churn > 0 THEN _monthly_price / _churn ELSE _monthly_price * 24 END;

  RETURN jsonb_build_object(
    'mrr_usd', round(_mrr::numeric, 2),
    'arr_usd', round(_arr::numeric, 2),
    'active_monthly', _active_monthly,
    'active_annual', _active_annual,
    'active_total', _active_monthly + _active_annual,
    'canceled_30d', _canceled_30d,
    'churn_rate_30d', round(_churn::numeric, 4),
    'ltv_usd', round(_ltv::numeric, 2),
    'monthly_price_usd', _monthly_price,
    'annual_price_usd', _annual_price,
    'computed_at', now()
  );
END;
$$;
REVOKE ALL ON FUNCTION public.royal_pass_finance_metrics() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.royal_pass_finance_metrics() TO authenticated, service_role;