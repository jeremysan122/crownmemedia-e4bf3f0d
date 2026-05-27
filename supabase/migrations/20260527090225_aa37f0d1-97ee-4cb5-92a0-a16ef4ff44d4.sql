
-- Add wallets to realtime publication so balance updates propagate to clients
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname='supabase_realtime' AND schemaname='public' AND tablename='wallets'
  ) THEN
    EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.wallets';
  END IF;
END $$;

ALTER TABLE public.wallets REPLICA IDENTITY FULL;

-- Update reward formula: 10 daily flat + random bonus every 7th consistent day
CREATE OR REPLACE FUNCTION public.claim_daily_reward()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid UUID := auth.uid();
  v_today DATE := (now() AT TIME ZONE 'utc')::date;
  v_streak_row public.daily_streaks%ROWTYPE;
  v_new_streak INTEGER;
  v_base NUMERIC := 10;
  v_bonus NUMERIC := 0;
  v_total NUMERIC;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;

  SELECT * INTO v_streak_row FROM public.daily_streaks WHERE user_id = v_uid FOR UPDATE;
  IF NOT FOUND THEN
    INSERT INTO public.daily_streaks (user_id) VALUES (v_uid)
      RETURNING * INTO v_streak_row;
  END IF;

  IF v_streak_row.last_claimed_date = v_today THEN
    RETURN jsonb_build_object('ok', false, 'already_claimed', true,
      'current_streak', v_streak_row.current_streak,
      'next_claim_at', (v_today + 1)::timestamp AT TIME ZONE 'utc');
  END IF;

  IF v_streak_row.last_claimed_date = v_today - 1 THEN
    v_new_streak := v_streak_row.current_streak + 1;
  ELSE
    v_new_streak := 1;
  END IF;

  -- Random extra bonus (50-200 shekels) every 7th consistent day
  IF v_new_streak > 0 AND v_new_streak % 7 = 0 THEN
    v_bonus := 50 + floor(random() * 151)::int; -- 50..200 inclusive
  END IF;

  v_total := v_base + v_bonus;

  INSERT INTO public.daily_reward_claims (user_id, claim_date, day_in_streak, shekels_awarded)
  VALUES (v_uid, v_today, v_new_streak, v_total);

  UPDATE public.daily_streaks
     SET current_streak = v_new_streak,
         longest_streak = GREATEST(longest_streak, v_new_streak),
         last_claimed_date = v_today,
         total_claims = total_claims + 1,
         updated_at = now()
   WHERE user_id = v_uid;

  PERFORM private.ensure_my_wallet(v_uid);
  UPDATE public.wallets
     SET shekel_balance = shekel_balance + v_total,
         total_earned   = total_earned   + v_total,
         updated_at     = now()
   WHERE user_id = v_uid;

  INSERT INTO public.shekel_ledger (user_id, kind, shekels_delta, label, metadata)
  VALUES (v_uid, 'daily_reward', v_total,
          'Daily check-in day ' || v_new_streak,
          jsonb_build_object('day', v_new_streak, 'base', v_base, 'bonus', v_bonus));

  RETURN jsonb_build_object(
    'ok', true,
    'shekels_awarded', v_total,
    'base', v_base,
    'bonus', v_bonus,
    'current_streak', v_new_streak,
    'longest_streak', GREATEST(v_streak_row.longest_streak, v_new_streak),
    'spin_available', true
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.claim_daily_reward() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.claim_daily_reward() TO authenticated;
