CREATE OR REPLACE FUNCTION public.admin_user_growth_summary()
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_goal bigint := 1000000;
  v_total bigint := 0;
  v_24h bigint := 0;
  v_7d bigint := 0;
  v_30d bigint := 0;
  v_avg numeric := 0;
  v_remaining bigint := 0;
  v_pct numeric := 0;
  v_eta numeric := NULL;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '42501';
  END IF;
  IF NOT public.has_role(auth.uid(), 'admin'::app_role) THEN
    RAISE EXCEPTION 'not_authorized' USING ERRCODE = '42501';
  END IF;

  SELECT COUNT(*) INTO v_total FROM public.profiles;
  SELECT COUNT(*) INTO v_24h FROM public.profiles WHERE created_at >= now() - interval '24 hours';
  SELECT COUNT(*) INTO v_7d  FROM public.profiles WHERE created_at >= now() - interval '7 days';
  SELECT COUNT(*) INTO v_30d FROM public.profiles WHERE created_at >= now() - interval '30 days';

  v_avg := ROUND((v_7d::numeric) / 7.0, 2);
  v_remaining := GREATEST(v_goal - v_total, 0);
  v_pct := LEAST(ROUND((v_total::numeric / v_goal::numeric) * 100.0, 4), 100);

  IF v_avg > 0 AND v_remaining > 0 THEN
    v_eta := ROUND(v_remaining::numeric / v_avg, 1);
  END IF;

  RETURN jsonb_build_object(
    'total_users', v_total,
    'goal_users', v_goal,
    'percent_complete', v_pct,
    'users_remaining', v_remaining,
    'signups_24h', v_24h,
    'signups_7d', v_7d,
    'signups_30d', v_30d,
    'avg_daily_signups_7d', v_avg,
    'estimated_days_to_goal', v_eta,
    'captured_at', now()
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.admin_user_growth_summary() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_user_growth_summary() TO authenticated;