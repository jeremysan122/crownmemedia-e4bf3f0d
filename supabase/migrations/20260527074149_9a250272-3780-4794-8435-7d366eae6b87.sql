
-- 1) Relax check constraint to allow new prize types
ALTER TABLE public.spin_wheel_prizes DROP CONSTRAINT IF EXISTS spin_wheel_prizes_prize_type_check;
ALTER TABLE public.spin_wheel_prizes ADD CONSTRAINT spin_wheel_prizes_prize_type_check
  CHECK (prize_type = ANY (ARRAY['shekels','battle_tickets','royal_pass_days','profile_boost_hours','bonus_spin','nothing']));

-- 2) Update admin RPC validator
CREATE OR REPLACE FUNCTION public.admin_upsert_spin_prize(_id uuid, _label text, _prize_type text, _prize_value integer, _weight integer, _color_hex text, _active boolean, _sort_order integer)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_id UUID;
BEGIN
  IF NOT is_any_admin(auth.uid()) THEN RAISE EXCEPTION 'Forbidden'; END IF;
  IF _prize_type NOT IN ('shekels','battle_tickets','royal_pass_days','profile_boost_hours','bonus_spin','nothing') THEN
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
$function$;

-- 3) Update spin RPC to credit the new prize types via notifications
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

  -- Mark spin used (except bonus_spin: still consumes today's spin, grants an extra one tomorrow via notification)
  UPDATE public.daily_streaks SET last_spin_date = v_today, updated_at = now() WHERE user_id = v_uid;

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
    INSERT INTO public.notifications (user_id, type, title, body, payload)
    VALUES (v_uid, 'system', 'Royal Pass days won 👑',
            v_chosen.prize_value || ' days of Royal Pass — our team will apply it shortly.',
            jsonb_build_object('source','spin_wheel','days', v_chosen.prize_value, 'prize_id', v_chosen.id));
  ELSIF v_chosen.prize_type = 'profile_boost_hours' AND v_chosen.prize_value > 0 THEN
    INSERT INTO public.notifications (user_id, type, title, body, payload)
    VALUES (v_uid, 'system', 'Profile Boost won 🚀',
            v_chosen.prize_value || 'h of profile boost — our team will apply it shortly.',
            jsonb_build_object('source','spin_wheel','hours', v_chosen.prize_value, 'prize_id', v_chosen.id));
  ELSIF v_chosen.prize_type = 'bonus_spin' THEN
    INSERT INTO public.notifications (user_id, type, title, body, payload)
    VALUES (v_uid, 'system', 'Bonus Spin earned ✨',
            'You earned a bonus spin — check back tomorrow for two spins!',
            jsonb_build_object('source','spin_wheel','bonus_spin', true, 'prize_id', v_chosen.id));
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
$function$;

-- 4) Replace the prize lineup: no Shekels on the wheel anymore
DELETE FROM public.spin_wheel_prizes;
INSERT INTO public.spin_wheel_prizes (label, prize_type, prize_value, weight, color_hex, active, sort_order) VALUES
  ('1 Battle Ticket',    'battle_tickets',      1, 28, '#7C3AED', true, 1),
  ('6h Profile Boost',   'profile_boost_hours', 6, 18, '#38BDF8', true, 2),
  ('Bonus Spin',         'bonus_spin',          1, 14, '#F59E0B', true, 3),
  ('3 Battle Tickets',   'battle_tickets',      3, 12, '#9333EA', true, 4),
  ('24h Profile Boost',  'profile_boost_hours',24,  5, '#0EA5E9', true, 5),
  ('1-Day Royal Pass',   'royal_pass_days',     1,  3, '#DC2626', true, 6),
  ('Try Again',          'nothing',             0, 20, '#475569', true, 7);
