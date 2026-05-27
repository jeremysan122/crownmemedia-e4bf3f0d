
-- 1. Track which users have already received today's streak-break reminder
CREATE TABLE IF NOT EXISTS public.streak_reminders_sent (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  sent_for_date date NOT NULL,
  channel text NOT NULL DEFAULT 'notification',
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, sent_for_date, channel)
);

GRANT SELECT, INSERT ON public.streak_reminders_sent TO authenticated;
GRANT ALL ON public.streak_reminders_sent TO service_role;

ALTER TABLE public.streak_reminders_sent ENABLE ROW LEVEL SECURITY;

CREATE POLICY "streak reminders admin read"
  ON public.streak_reminders_sent FOR SELECT
  TO authenticated
  USING (is_any_admin(auth.uid()));

-- 2. Award +1 bonus spin to the inviter when an invite is redeemed
CREATE OR REPLACE FUNCTION public.redeem_invite_code(_code text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_inviter uuid;
  v_existing public.invite_redemptions%ROWTYPE;
  v_signup_bonus numeric := 200;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF _code IS NULL OR length(trim(_code)) < 4 THEN
    RAISE EXCEPTION 'Invalid invite code';
  END IF;

  SELECT user_id INTO v_inviter FROM public.invite_codes WHERE code = upper(trim(_code));
  IF v_inviter IS NULL THEN RAISE EXCEPTION 'Invite code not found'; END IF;
  IF v_inviter = v_uid THEN RAISE EXCEPTION 'You cannot invite yourself'; END IF;

  SELECT * INTO v_existing FROM public.invite_redemptions WHERE invitee_id = v_uid;
  IF FOUND THEN
    RETURN jsonb_build_object('ok', true, 'already_redeemed', true);
  END IF;

  INSERT INTO public.invite_redemptions (inviter_id, invitee_id, code, signup_rewarded)
  VALUES (v_inviter, v_uid, upper(trim(_code)), true);

  PERFORM private.ensure_my_wallet(v_inviter);
  PERFORM private.ensure_my_wallet(v_uid);

  UPDATE public.wallets
     SET shekel_balance = shekel_balance + v_signup_bonus,
         total_earned   = total_earned   + v_signup_bonus,
         updated_at     = now()
   WHERE user_id = v_inviter;
  UPDATE public.wallets
     SET shekel_balance = shekel_balance + v_signup_bonus,
         total_earned   = total_earned   + v_signup_bonus,
         updated_at     = now()
   WHERE user_id = v_uid;

  INSERT INTO public.shekel_ledger (user_id, kind, shekels_delta, label, metadata)
  VALUES
    (v_inviter, 'invite_bonus', v_signup_bonus, 'Invite signup bonus', jsonb_build_object('invitee_id', v_uid)),
    (v_uid,     'invite_bonus', v_signup_bonus, 'Welcome invite bonus', jsonb_build_object('inviter_id', v_inviter));

  -- NEW: grant inviter +1 bonus spin on the daily wheel
  INSERT INTO public.daily_streaks (user_id, bonus_spins)
    VALUES (v_inviter, 1)
  ON CONFLICT (user_id) DO UPDATE
    SET bonus_spins = public.daily_streaks.bonus_spins + 1,
        updated_at = now();

  INSERT INTO public.notifications (user_id, type, title, body, payload) VALUES
    (v_inviter, 'system', 'Invite redeemed 👑', 'A friend you invited just joined CrownMe — +200 shekels and a bonus spin for you.', jsonb_build_object('event','invite_signup','invitee_id', v_uid)),
    (v_uid,     'system', 'Welcome bonus 👑', 'You joined via an invite — +200 shekels added to your wallet.', jsonb_build_object('event','invite_welcome','inviter_id', v_inviter));

  RETURN jsonb_build_object('ok', true, 'shekels_awarded', v_signup_bonus, 'inviter_bonus_spin', 1);
END;
$function$;

-- 3. Schedule daily streak reminder at 18:00 UTC
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'streak-reminder-daily') THEN
    PERFORM cron.unschedule('streak-reminder-daily');
  END IF;

  PERFORM cron.schedule(
    'streak-reminder-daily',
    '0 18 * * *',
    $cron$
    SELECT net.http_post(
      url := 'https://bailrqskqpmzvsgivhvm.supabase.co/functions/v1/streak-reminder',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || current_setting('app.settings.service_role_key', true)
      ),
      body := jsonb_build_object('source','cron')
    );
    $cron$
  );
END $$;
