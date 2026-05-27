
-- 1) bonus spin balance + per-prize stock
ALTER TABLE public.daily_streaks ADD COLUMN IF NOT EXISTS bonus_spins integer NOT NULL DEFAULT 0;
ALTER TABLE public.spin_wheel_prizes ADD COLUMN IF NOT EXISTS remaining_stock integer;

-- 2) Updated spin RPC with full auto-redemption + stock decrement + bonus spin support
CREATE OR REPLACE FUNCTION public.spin_daily_wheel()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_uid UUID := auth.uid();
  v_today DATE := (now() AT TIME ZONE 'utc')::date;
  v_streak public.daily_streaks%ROWTYPE;
  v_total_weight BIGINT;
  v_pick BIGINT;
  v_cum BIGINT := 0;
  v_chosen public.spin_wheel_prizes%ROWTYPE;
  v_use_bonus BOOLEAN := false;
  v_expires TIMESTAMPTZ;
  p RECORD;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;

  SELECT * INTO v_streak FROM public.daily_streaks WHERE user_id = v_uid FOR UPDATE;
  IF NOT FOUND OR v_streak.last_claimed_date <> v_today THEN
    RAISE EXCEPTION 'Claim your daily reward before spinning';
  END IF;

  IF v_streak.last_spin_date = v_today THEN
    IF COALESCE(v_streak.bonus_spins, 0) > 0 THEN
      v_use_bonus := true;
    ELSE
      RAISE EXCEPTION 'You already spun today — come back tomorrow';
    END IF;
  END IF;

  SELECT COALESCE(sum(weight)::bigint, 0) INTO v_total_weight
    FROM public.spin_wheel_prizes
   WHERE active = true AND weight > 0
     AND (remaining_stock IS NULL OR remaining_stock > 0);
  IF v_total_weight = 0 THEN RAISE EXCEPTION 'No prizes available'; END IF;

  v_pick := floor(random() * v_total_weight)::bigint;

  FOR p IN
    SELECT * FROM public.spin_wheel_prizes
     WHERE active = true AND weight > 0
       AND (remaining_stock IS NULL OR remaining_stock > 0)
     ORDER BY sort_order, id
  LOOP
    v_cum := v_cum + p.weight;
    IF v_pick < v_cum THEN v_chosen := p; EXIT; END IF;
  END LOOP;

  -- Consume spin (bonus first, otherwise daily)
  IF v_use_bonus THEN
    UPDATE public.daily_streaks
       SET bonus_spins = GREATEST(0, COALESCE(bonus_spins,0) - 1),
           updated_at = now()
     WHERE user_id = v_uid;
  ELSE
    UPDATE public.daily_streaks
       SET last_spin_date = v_today, updated_at = now()
     WHERE user_id = v_uid;
  END IF;

  -- Redeem prize
  IF v_chosen.prize_type = 'shekels' AND v_chosen.prize_value > 0 THEN
    PERFORM private.ensure_my_wallet(v_uid);
    UPDATE public.wallets
       SET shekel_balance = shekel_balance + v_chosen.prize_value,
           total_earned   = total_earned   + v_chosen.prize_value,
           updated_at     = now()
     WHERE user_id = v_uid;
    INSERT INTO public.shekel_ledger (user_id, kind, shekels_delta, label, metadata)
    VALUES (v_uid, 'spin_wheel', v_chosen.prize_value, 'Spin wheel: ' || v_chosen.label,
            jsonb_build_object('prize_id', v_chosen.id));

  ELSIF v_chosen.prize_type = 'battle_tickets' AND v_chosen.prize_value > 0 THEN
    INSERT INTO public.battle_tickets (user_id, balance, total_earned)
    VALUES (v_uid, v_chosen.prize_value, v_chosen.prize_value)
    ON CONFLICT (user_id) DO UPDATE
      SET balance = battle_tickets.balance + EXCLUDED.balance,
          total_earned = battle_tickets.total_earned + EXCLUDED.total_earned,
          updated_at = now();

  ELSIF v_chosen.prize_type = 'royal_pass_days' AND v_chosen.prize_value > 0 THEN
    -- Extend (or create) the user's Royal Pass by N days
    INSERT INTO public.royal_pass_subscriptions (user_id, status, current_period_start, current_period_end)
    VALUES (v_uid, 'active', now(), now() + make_interval(days => v_chosen.prize_value))
    ON CONFLICT (user_id) DO UPDATE
      SET status = 'active',
          current_period_end = GREATEST(COALESCE(royal_pass_subscriptions.current_period_end, now()), now())
                               + make_interval(days => v_chosen.prize_value),
          updated_at = now();

  ELSIF v_chosen.prize_type = 'profile_boost_hours' AND v_chosen.prize_value > 0 THEN
    v_expires := now() + make_interval(hours => v_chosen.prize_value);
    INSERT INTO public.boosts (user_id, boost_type, active, started_at, expires_at)
    VALUES (v_uid, 'profile_glow', true, now(), v_expires);

  ELSIF v_chosen.prize_type = 'bonus_spin' THEN
    UPDATE public.daily_streaks
       SET bonus_spins = COALESCE(bonus_spins,0) + GREATEST(1, v_chosen.prize_value),
           updated_at = now()
     WHERE user_id = v_uid;
  END IF;

  -- Decrement stock if limited
  IF v_chosen.remaining_stock IS NOT NULL THEN
    UPDATE public.spin_wheel_prizes
       SET remaining_stock = GREATEST(0, remaining_stock - 1),
           active = CASE WHEN remaining_stock - 1 <= 0 THEN false ELSE active END,
           updated_at = now()
     WHERE id = v_chosen.id;
  END IF;

  INSERT INTO public.spin_wheel_spins (user_id, prize_id, prize_type, prize_value, source)
  VALUES (v_uid, v_chosen.id, v_chosen.prize_type, v_chosen.prize_value,
          CASE WHEN v_use_bonus THEN 'bonus' ELSE 'daily' END);

  RETURN jsonb_build_object(
    'ok', true,
    'prize_id', v_chosen.id,
    'label', v_chosen.label,
    'prize_type', v_chosen.prize_type,
    'prize_value', v_chosen.prize_value,
    'used_bonus', v_use_bonus,
    'bonus_spins_remaining', (SELECT bonus_spins FROM public.daily_streaks WHERE user_id = v_uid)
  );
END;
$function$;

-- 3) Admin upsert: accept optional remaining_stock via a thin wrapper (keep existing signature working)
CREATE OR REPLACE FUNCTION public.admin_set_prize_stock(_id uuid, _stock integer)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT is_any_admin(auth.uid()) THEN RAISE EXCEPTION 'Forbidden'; END IF;
  UPDATE public.spin_wheel_prizes
     SET remaining_stock = _stock,
         active = CASE WHEN _stock IS NOT NULL AND _stock <= 0 THEN false ELSE active END,
         updated_at = now()
   WHERE id = _id;
END;
$function$;
