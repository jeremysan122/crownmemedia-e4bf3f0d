-- ============ TABLES ============

-- Per-user streak state
CREATE TABLE public.daily_streaks (
  user_id UUID PRIMARY KEY,
  current_streak INTEGER NOT NULL DEFAULT 0,
  longest_streak INTEGER NOT NULL DEFAULT 0,
  last_claimed_date DATE,
  total_claims INTEGER NOT NULL DEFAULT 0,
  last_spin_date DATE,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT ON public.daily_streaks TO authenticated;
GRANT ALL ON public.daily_streaks TO service_role;
ALTER TABLE public.daily_streaks ENABLE ROW LEVEL SECURITY;
CREATE POLICY "daily_streaks self read" ON public.daily_streaks
  FOR SELECT TO authenticated USING (auth.uid() = user_id);

-- One row per daily claim (unique per user per day)
CREATE TABLE public.daily_reward_claims (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  claim_date DATE NOT NULL,
  day_in_streak INTEGER NOT NULL,
  shekels_awarded NUMERIC NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, claim_date)
);
GRANT SELECT ON public.daily_reward_claims TO authenticated;
GRANT ALL ON public.daily_reward_claims TO service_role;
ALTER TABLE public.daily_reward_claims ENABLE ROW LEVEL SECURITY;
CREATE POLICY "daily_reward_claims self read" ON public.daily_reward_claims
  FOR SELECT TO authenticated USING (auth.uid() = user_id);

-- Wheel prize catalog (admin-managed)
CREATE TABLE public.spin_wheel_prizes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  label TEXT NOT NULL,
  prize_type TEXT NOT NULL CHECK (prize_type IN ('shekels','battle_tickets','royal_pass_days','nothing')),
  prize_value INTEGER NOT NULL DEFAULT 0,
  weight INTEGER NOT NULL DEFAULT 1 CHECK (weight >= 0),
  color_hex TEXT,
  active BOOLEAN NOT NULL DEFAULT true,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT ON public.spin_wheel_prizes TO authenticated;
GRANT ALL ON public.spin_wheel_prizes TO service_role;
ALTER TABLE public.spin_wheel_prizes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "wheel prizes readable to authed" ON public.spin_wheel_prizes
  FOR SELECT TO authenticated USING (active = true OR is_any_admin(auth.uid()));
CREATE POLICY "wheel prizes admin write" ON public.spin_wheel_prizes
  FOR ALL TO authenticated USING (is_any_admin(auth.uid())) WITH CHECK (is_any_admin(auth.uid()));

-- Audit log of every spin
CREATE TABLE public.spin_wheel_spins (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  prize_id UUID,
  prize_type TEXT NOT NULL,
  prize_value INTEGER NOT NULL,
  source TEXT NOT NULL DEFAULT 'daily' CHECK (source IN ('daily','bonus','admin')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_spin_spins_user_date ON public.spin_wheel_spins (user_id, created_at DESC);
GRANT SELECT ON public.spin_wheel_spins TO authenticated;
GRANT ALL ON public.spin_wheel_spins TO service_role;
ALTER TABLE public.spin_wheel_spins ENABLE ROW LEVEL SECURITY;
CREATE POLICY "spins self read" ON public.spin_wheel_spins
  FOR SELECT TO authenticated USING (auth.uid() = user_id OR is_any_admin(auth.uid()));

-- Battle ticket wallet
CREATE TABLE public.battle_tickets (
  user_id UUID PRIMARY KEY,
  balance INTEGER NOT NULL DEFAULT 0 CHECK (balance >= 0),
  total_earned INTEGER NOT NULL DEFAULT 0,
  total_spent INTEGER NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT ON public.battle_tickets TO authenticated;
GRANT ALL ON public.battle_tickets TO service_role;
ALTER TABLE public.battle_tickets ENABLE ROW LEVEL SECURITY;
CREATE POLICY "battle_tickets self read" ON public.battle_tickets
  FOR SELECT TO authenticated USING (auth.uid() = user_id);

-- ============ RPCs ============

-- claim_daily_reward(): atomic; one claim per UTC day, grows streak, returns details.
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
  v_day_for_bonus INTEGER;
  v_base NUMERIC := 50;
  v_bonus NUMERIC;
  v_total NUMERIC;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;

  -- Lock or create streak row
  SELECT * INTO v_streak_row FROM public.daily_streaks WHERE user_id = v_uid FOR UPDATE;
  IF NOT FOUND THEN
    INSERT INTO public.daily_streaks (user_id) VALUES (v_uid)
      RETURNING * INTO v_streak_row;
  END IF;

  -- Already claimed today?
  IF v_streak_row.last_claimed_date = v_today THEN
    RETURN jsonb_build_object('ok', false, 'already_claimed', true,
      'current_streak', v_streak_row.current_streak,
      'next_claim_at', (v_today + 1)::timestamp AT TIME ZONE 'utc');
  END IF;

  -- Grow or reset streak
  IF v_streak_row.last_claimed_date = v_today - 1 THEN
    v_new_streak := v_streak_row.current_streak + 1;
  ELSE
    v_new_streak := 1;
  END IF;

  -- Bonus: cap streak bonus at day 7 (base + 10*min(day,7))
  v_day_for_bonus := LEAST(v_new_streak, 7);
  v_bonus := v_day_for_bonus * 10;
  v_total := v_base + v_bonus;

  -- Record claim (unique constraint protects against races)
  INSERT INTO public.daily_reward_claims (user_id, claim_date, day_in_streak, shekels_awarded)
  VALUES (v_uid, v_today, v_new_streak, v_total);

  -- Update streak state
  UPDATE public.daily_streaks
     SET current_streak = v_new_streak,
         longest_streak = GREATEST(longest_streak, v_new_streak),
         last_claimed_date = v_today,
         total_claims = total_claims + 1,
         updated_at = now()
   WHERE user_id = v_uid;

  -- Credit wallet (ensure exists)
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
    'current_streak', v_new_streak,
    'longest_streak', GREATEST(v_streak_row.longest_streak, v_new_streak),
    'spin_available', true
  );
END;
$$;
REVOKE EXECUTE ON FUNCTION public.claim_daily_reward() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.claim_daily_reward() TO authenticated;

-- spin_daily_wheel(): requires today's claim, max one spin per UTC day, picks weighted prize.
CREATE OR REPLACE FUNCTION public.spin_daily_wheel()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid UUID := auth.uid();
  v_today DATE := (now() AT TIME ZONE 'utc')::date;
  v_streak public.daily_streaks%ROWTYPE;
  v_total_weight BIGINT;
  v_pick BIGINT;
  v_cum BIGINT := 0;
  v_chosen public.spin_wheel_prizes%ROWTYPE;
  p RECORD;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;

  SELECT * INTO v_streak FROM public.daily_streaks WHERE user_id = v_uid FOR UPDATE;
  IF NOT FOUND OR v_streak.last_claimed_date <> v_today THEN
    RAISE EXCEPTION 'Claim your daily reward before spinning';
  END IF;
  IF v_streak.last_spin_date = v_today THEN
    RAISE EXCEPTION 'You already spun today — come back tomorrow';
  END IF;

  -- Pick a prize using weighted random.
  SELECT COALESCE(sum(weight)::bigint, 0) INTO v_total_weight
    FROM public.spin_wheel_prizes WHERE active = true AND weight > 0;
  IF v_total_weight = 0 THEN RAISE EXCEPTION 'No prizes configured'; END IF;

  v_pick := floor(random() * v_total_weight)::bigint;

  FOR p IN
    SELECT * FROM public.spin_wheel_prizes
     WHERE active = true AND weight > 0
     ORDER BY sort_order, id
  LOOP
    v_cum := v_cum + p.weight;
    IF v_pick < v_cum THEN
      v_chosen := p;
      EXIT;
    END IF;
  END LOOP;

  -- Mark spin used
  UPDATE public.daily_streaks SET last_spin_date = v_today, updated_at = now() WHERE user_id = v_uid;

  -- Credit the prize
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
    -- Notification only; backend pass-extension is owned by Stripe/Royal Pass flow.
    INSERT INTO public.notifications (user_id, type, title, body, payload)
    VALUES (v_uid, 'system', 'Royal Pass days won 👑',
            v_chosen.prize_value || ' days of Royal Pass — our team will apply it shortly.',
            jsonb_build_object('source','spin_wheel','days', v_chosen.prize_value, 'prize_id', v_chosen.id));
  END IF;

  INSERT INTO public.spin_wheel_spins (user_id, prize_id, prize_type, prize_value, source)
  VALUES (v_uid, v_chosen.id, v_chosen.prize_type, v_chosen.prize_value, 'daily');

  RETURN jsonb_build_object(
    'ok', true,
    'prize_id', v_chosen.id,
    'label', v_chosen.label,
    'prize_type', v_chosen.prize_type,
    'prize_value', v_chosen.prize_value
  );
END;
$$;
REVOKE EXECUTE ON FUNCTION public.spin_daily_wheel() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.spin_daily_wheel() TO authenticated;

-- Admin upsert / toggle for prizes (parameterized; no raw SQL)
CREATE OR REPLACE FUNCTION public.admin_upsert_spin_prize(
  _id UUID,
  _label TEXT,
  _prize_type TEXT,
  _prize_value INTEGER,
  _weight INTEGER,
  _color_hex TEXT,
  _active BOOLEAN,
  _sort_order INTEGER
) RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_id UUID;
BEGIN
  IF NOT is_any_admin(auth.uid()) THEN RAISE EXCEPTION 'Forbidden'; END IF;
  IF _prize_type NOT IN ('shekels','battle_tickets','royal_pass_days','nothing') THEN
    RAISE EXCEPTION 'Invalid prize_type';
  END IF;
  IF _label IS NULL OR length(trim(_label)) = 0 OR length(_label) > 80 THEN
    RAISE EXCEPTION 'Invalid label';
  END IF;
  IF _weight < 0 OR _prize_value < 0 THEN RAISE EXCEPTION 'Negative values not allowed'; END IF;

  IF _id IS NULL THEN
    INSERT INTO public.spin_wheel_prizes (label, prize_type, prize_value, weight, color_hex, active, sort_order)
    VALUES (_label, _prize_type, _prize_value, _weight, _color_hex, COALESCE(_active, true), COALESCE(_sort_order, 0))
    RETURNING id INTO v_id;
  ELSE
    UPDATE public.spin_wheel_prizes
       SET label = _label, prize_type = _prize_type, prize_value = _prize_value,
           weight = _weight, color_hex = _color_hex,
           active = COALESCE(_active, active), sort_order = COALESCE(_sort_order, sort_order),
           updated_at = now()
     WHERE id = _id
     RETURNING id INTO v_id;
    IF v_id IS NULL THEN RAISE EXCEPTION 'Prize not found'; END IF;
  END IF;
  RETURN v_id;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.admin_upsert_spin_prize(UUID,TEXT,TEXT,INTEGER,INTEGER,TEXT,BOOLEAN,INTEGER) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_upsert_spin_prize(UUID,TEXT,TEXT,INTEGER,INTEGER,TEXT,BOOLEAN,INTEGER) TO authenticated;

-- Seed initial prizes
INSERT INTO public.spin_wheel_prizes (label, prize_type, prize_value, weight, color_hex, sort_order) VALUES
  ('+25 Shekels',        'shekels',          25, 28, '#D4AF37', 1),
  ('+100 Shekels',       'shekels',         100, 18, '#F7E58A', 2),
  ('+500 Shekels',       'shekels',         500,  5, '#F59E0B', 3),
  ('1 Battle Ticket',    'battle_tickets',    1, 20, '#7C3AED', 4),
  ('3 Battle Tickets',   'battle_tickets',    3,  7, '#9333EA', 5),
  ('1-Day Royal Pass',   'royal_pass_days',   1,  3, '#DC2626', 6),
  ('Better luck next time','nothing',         0, 19, '#374151', 7);