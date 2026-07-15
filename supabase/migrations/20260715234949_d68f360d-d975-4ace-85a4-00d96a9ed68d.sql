-- Wave 4 — Ops & Exclusivity: royal-only assets, quest multiplier, admin grant, finance metrics

-- 1) royal-only flags on cosmetics
ALTER TABLE public.achievement_crowns
  ADD COLUMN IF NOT EXISTS royal_pass_required boolean NOT NULL DEFAULT false;

ALTER TABLE public.avatar_frames
  ADD COLUMN IF NOT EXISTS royal_pass_required boolean NOT NULL DEFAULT false;

-- 2) royal multiplier on weekly quests
ALTER TABLE public.weekly_quest_definitions
  ADD COLUMN IF NOT EXISTS royal_multiplier numeric NOT NULL DEFAULT 1.0
  CHECK (royal_multiplier >= 1.0 AND royal_multiplier <= 10.0);

-- 3) royal-active helper (shared by equip guards + quest boost)
CREATE OR REPLACE FUNCTION public.is_royal_active(_uid uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.royal_pass_subscriptions
    WHERE user_id = _uid
      AND status IN ('active','trialing','past_due')
      AND (current_period_end IS NULL OR current_period_end > now())
  );
$$;
REVOKE ALL ON FUNCTION public.is_royal_active(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_royal_active(uuid) TO authenticated, service_role;

-- 4) gate equip_achievement_crown by royal_pass_required
CREATE OR REPLACE FUNCTION public.equip_achievement_crown(_crown_id uuid)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  _uid uuid := auth.uid();
  _royal_required boolean;
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'not authenticated' USING ERRCODE = '42501'; END IF;
  IF _crown_id IS NULL THEN
    UPDATE public.profiles SET equipped_achievement_crown_id = NULL WHERE id = _uid;
    RETURN;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.user_achievement_crowns WHERE user_id = _uid AND crown_id = _crown_id) THEN
    RAISE EXCEPTION 'crown not owned' USING ERRCODE = '42501';
  END IF;
  SELECT royal_pass_required INTO _royal_required FROM public.achievement_crowns WHERE id = _crown_id;
  IF COALESCE(_royal_required, false) AND NOT public.is_royal_active(_uid) THEN
    RAISE EXCEPTION 'royal_pass_required' USING ERRCODE = '42501';
  END IF;
  UPDATE public.profiles SET equipped_achievement_crown_id = _crown_id WHERE id = _uid;
END;
$$;

-- 5) gate equip_frame by royal_pass_required
CREATE OR REPLACE FUNCTION public.equip_frame(_frame_key text)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  uid uuid := auth.uid();
  is_unlocked boolean;
  _royal_required boolean;
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;
  IF _frame_key IS NULL OR _frame_key = '' THEN
    UPDATE public.profiles SET equipped_frame_key = NULL WHERE id = uid;
    RETURN jsonb_build_object('success', true, 'equipped', null);
  END IF;

  SELECT EXISTS(
    SELECT 1 FROM public.avatar_frame_unlocks WHERE user_id = uid AND frame_key = _frame_key
  ) INTO is_unlocked;
  IF NOT is_unlocked THEN RAISE EXCEPTION 'frame_not_unlocked'; END IF;

  SELECT royal_pass_required INTO _royal_required
  FROM public.avatar_frames WHERE frame_key = _frame_key;
  IF COALESCE(_royal_required, false) AND NOT public.is_royal_active(uid) THEN
    RAISE EXCEPTION 'royal_pass_required';
  END IF;

  UPDATE public.profiles SET equipped_frame_key = _frame_key WHERE id = uid;
  RETURN jsonb_build_object('success', true, 'equipped', _frame_key);
END;
$$;

-- 6) admin_grant_royal_pass — comp N days to a user, audited
CREATE OR REPLACE FUNCTION public.admin_grant_royal_pass(
  _target_user_id uuid,
  _days integer,
  _reason text
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  _caller uuid := auth.uid();
  _existing record;
  _base_ts timestamptz;
  _new_end timestamptz;
BEGIN
  IF _caller IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;
  IF NOT (public.has_role(_caller, 'admin') OR public.has_role(_caller, 'super_admin') OR public.has_role(_caller, 'finance_admin')) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;
  IF _target_user_id IS NULL THEN RAISE EXCEPTION 'target_required'; END IF;
  IF _days IS NULL OR _days <= 0 OR _days > 3650 THEN RAISE EXCEPTION 'days_out_of_range'; END IF;
  IF _reason IS NULL OR length(btrim(_reason)) < 3 THEN RAISE EXCEPTION 'reason_required'; END IF;

  SELECT * INTO _existing FROM public.royal_pass_subscriptions WHERE user_id = _target_user_id;
  _base_ts := GREATEST(COALESCE(_existing.current_period_end, now()), now());
  _new_end := _base_ts + make_interval(days => _days);

  IF _existing IS NULL THEN
    INSERT INTO public.royal_pass_subscriptions(
      user_id, status, current_period_start, current_period_end, cancel_at_period_end, plan_id
    ) VALUES (
      _target_user_id, 'active', now(), _new_end, true, 'admin_grant'
    );
  ELSE
    UPDATE public.royal_pass_subscriptions
       SET status = CASE WHEN status IN ('canceled','incomplete_expired','unpaid') THEN 'active' ELSE status END,
           current_period_end = _new_end,
           updated_at = now()
     WHERE user_id = _target_user_id;
  END IF;

  BEGIN
    INSERT INTO public.royal_pass_grants(user_id, source, granted_by, months, expires_at, note)
    VALUES (_target_user_id, 'admin_grant', _caller,
            GREATEST(1, ceil(_days::numeric / 30)::int),
            _new_end,
            left('Admin grant: ' || _reason, 500));
  EXCEPTION WHEN others THEN NULL;
  END;

  BEGIN
    INSERT INTO public.admin_audit_log(actor_user_id, action, target_kind, target_id, meta)
    VALUES (_caller, 'royal_pass_manual_grant', 'user', _target_user_id::text,
            jsonb_build_object('days', _days, 'reason', _reason, 'new_period_end', _new_end));
  EXCEPTION WHEN others THEN NULL;
  END;

  RETURN jsonb_build_object('ok', true, 'new_period_end', _new_end, 'days', _days);
END;
$$;
REVOKE ALL ON FUNCTION public.admin_grant_royal_pass(uuid, integer, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_grant_royal_pass(uuid, integer, text) TO authenticated, service_role;

-- 7) royal_pass_finance_metrics — MRR/ARR/active/churn/LTV
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
BEGIN
  IF _caller IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;
  IF NOT (public.has_role(_caller, 'admin') OR public.has_role(_caller, 'super_admin') OR public.has_role(_caller, 'finance_admin')) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  SELECT COALESCE(price_usd, 9.99) INTO _monthly_price
  FROM public.royal_pass_plans WHERE plan_id = 'royal_pass_monthly' LIMIT 1;
  _monthly_price := COALESCE(_monthly_price, 9.99);

  SELECT
    COUNT(*) FILTER (WHERE COALESCE(plan_id,'royal_pass_monthly') NOT LIKE '%annual%'),
    COUNT(*) FILTER (WHERE plan_id LIKE '%annual%')
    INTO _active_monthly, _active_annual
  FROM public.royal_pass_subscriptions
  WHERE status IN ('active','trialing')
    AND (current_period_end IS NULL OR current_period_end > now());

  _mrr := (_active_monthly * _monthly_price)
        + (_active_annual * COALESCE(
            (SELECT price_usd FROM public.royal_pass_plans WHERE plan_id LIKE '%annual%' LIMIT 1),
            79.99) / 12.0);
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
    'computed_at', now()
  );
END;
$$;
REVOKE ALL ON FUNCTION public.royal_pass_finance_metrics() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.royal_pass_finance_metrics() TO authenticated, service_role;
