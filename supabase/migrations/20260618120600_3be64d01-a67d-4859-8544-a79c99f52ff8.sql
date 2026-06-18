ALTER TABLE public.daily_streaks
  ADD COLUMN IF NOT EXISTS last_claimed_at TIMESTAMPTZ;

UPDATE public.daily_streaks
   SET last_claimed_at = COALESCE(last_claimed_at,
                                  updated_at,
                                  (last_claimed_date::timestamp AT TIME ZONE 'utc'))
 WHERE last_claimed_date IS NOT NULL
   AND last_claimed_at IS NULL;

CREATE OR REPLACE FUNCTION public.claim_daily_reward()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_uid UUID := auth.uid();
  v_now TIMESTAMPTZ := now();
  v_today DATE := (v_now AT TIME ZONE 'utc')::date;
  v_streak_row public.daily_streaks%ROWTYPE;
  v_hours_since NUMERIC;
  v_new_streak INTEGER;
  v_cycle_day INTEGER;
  v_base NUMERIC := 0;
  v_bonus NUMERIC := 0;
  v_total NUMERIC;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;

  SELECT * INTO v_streak_row FROM public.daily_streaks WHERE user_id = v_uid FOR UPDATE;
  IF NOT FOUND THEN
    INSERT INTO public.daily_streaks (user_id) VALUES (v_uid)
      RETURNING * INTO v_streak_row;
  END IF;

  IF v_streak_row.last_claimed_at IS NOT NULL
     AND v_streak_row.last_claimed_at + INTERVAL '24 hours' > v_now THEN
    RETURN jsonb_build_object('ok', false, 'already_claimed', true,
      'current_streak', v_streak_row.current_streak,
      'next_claim_at', v_streak_row.last_claimed_at + INTERVAL '24 hours');
  END IF;

  v_hours_since := CASE
    WHEN v_streak_row.last_claimed_at IS NULL THEN NULL
    ELSE EXTRACT(EPOCH FROM (v_now - v_streak_row.last_claimed_at)) / 3600.0
  END;

  IF v_hours_since IS NOT NULL AND v_hours_since < 48 THEN
    v_new_streak := v_streak_row.current_streak + 1;
  ELSE
    v_new_streak := 1;
  END IF;

  v_cycle_day := ((v_new_streak - 1) % 7) + 1;
  IF v_cycle_day = 7 THEN
    v_bonus := 10 + floor(random() * 91)::int;
    v_base := 0;
  ELSE
    v_base := 10;
    v_bonus := 0;
  END IF;

  v_total := v_base + v_bonus;

  INSERT INTO public.daily_reward_claims (user_id, claim_date, day_in_streak, shekels_awarded)
  VALUES (v_uid, v_today, v_new_streak, v_total);

  UPDATE public.daily_streaks
     SET current_streak = v_new_streak,
         longest_streak = GREATEST(longest_streak, v_new_streak),
         last_claimed_date = v_today,
         last_claimed_at = v_now,
         total_claims = total_claims + 1,
         updated_at = v_now
   WHERE user_id = v_uid;

  PERFORM private.ensure_my_wallet(v_uid);
  UPDATE public.wallets
     SET shekel_balance = shekel_balance + v_total,
         total_earned   = total_earned   + v_total,
         updated_at     = v_now
   WHERE user_id = v_uid;

  INSERT INTO public.shekel_ledger (user_id, kind, shekels_delta, label, metadata)
  VALUES (v_uid, 'daily_reward', v_total,
          'Daily check-in day ' || v_new_streak,
          jsonb_build_object('day', v_new_streak, 'cycle_day', v_cycle_day, 'base', v_base, 'bonus', v_bonus));

  RETURN jsonb_build_object(
    'ok', true,
    'shekels_awarded', v_total,
    'base', v_base,
    'bonus', v_bonus,
    'cycle_day', v_cycle_day,
    'current_streak', v_new_streak,
    'longest_streak', GREATEST(v_streak_row.longest_streak, v_new_streak),
    'next_claim_at', v_now + INTERVAL '24 hours',
    'spin_available', true
  );
END;
$function$;