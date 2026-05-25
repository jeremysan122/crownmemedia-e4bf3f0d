CREATE OR REPLACE FUNCTION public.redeem_invite_code(_code text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
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

  INSERT INTO public.notifications (user_id, type, title, body, payload) VALUES
    (v_inviter, 'system', 'Invite redeemed 👑', 'A friend you invited just joined CrownMe — +200 shekels for both of you.', jsonb_build_object('event','invite_signup','invitee_id', v_uid)),
    (v_uid,     'system', 'Welcome bonus 👑', 'You joined via an invite — +200 shekels added to your wallet.', jsonb_build_object('event','invite_welcome','inviter_id', v_inviter));

  RETURN jsonb_build_object('ok', true, 'shekels_awarded', v_signup_bonus);
END;
$$;

REVOKE ALL ON FUNCTION public.redeem_invite_code(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.redeem_invite_code(text) TO authenticated;

CREATE OR REPLACE FUNCTION public.grant_pass_invite_bonus(_user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_red public.invite_redemptions%ROWTYPE;
  v_inviter_active boolean;
  v_invitee_active boolean;
  v_extend interval := interval '30 days';
BEGIN
  SELECT * INTO v_red FROM public.invite_redemptions WHERE invitee_id = _user_id;
  IF NOT FOUND OR v_red.pass_rewarded THEN RETURN; END IF;

  v_inviter_active := private.is_royal_pass_active(v_red.inviter_id);
  v_invitee_active := private.is_royal_pass_active(v_red.invitee_id);
  IF NOT (v_inviter_active AND v_invitee_active) THEN RETURN; END IF;

  UPDATE public.royal_pass_subscriptions
     SET current_period_end = COALESCE(current_period_end, now()) + v_extend,
         updated_at = now()
   WHERE user_id IN (v_red.inviter_id, v_red.invitee_id)
     AND status IN ('active','trialing');

  UPDATE public.invite_redemptions SET pass_rewarded = true WHERE id = v_red.id;

  INSERT INTO public.notifications (user_id, type, title, body, payload) VALUES
    (v_red.inviter_id, 'system', 'Royal Pass bonus 👑', 'Your invitee activated Royal Pass — both of you got +30 free days.', jsonb_build_object('event','invite_pass_bonus','days',30)),
    (v_red.invitee_id, 'system', 'Royal Pass bonus 👑', 'You and your inviter both got +30 free Royal Pass days.', jsonb_build_object('event','invite_pass_bonus','days',30));
END;
$$;

REVOKE ALL ON FUNCTION public.grant_pass_invite_bonus(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.grant_pass_invite_bonus(uuid) TO service_role;