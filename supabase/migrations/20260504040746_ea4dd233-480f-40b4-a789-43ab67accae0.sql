-- Invite codes: one stable code per user
CREATE TABLE IF NOT EXISTS public.invite_codes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL UNIQUE,
  code text NOT NULL UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.invite_codes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users view own invite code"
  ON public.invite_codes FOR SELECT
  USING (auth.uid() = user_id);

-- Codes are only created by the SECURITY DEFINER RPC below
CREATE POLICY "invite_codes deny direct writes"
  ON public.invite_codes AS RESTRICTIVE FOR ALL
  TO anon, authenticated
  USING (false) WITH CHECK (false);

-- Redemptions: who invited whom + reward state
CREATE TABLE IF NOT EXISTS public.invite_redemptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  inviter_id uuid NOT NULL,
  invitee_id uuid NOT NULL UNIQUE,  -- a user can only be invited once
  code text NOT NULL,
  signup_rewarded boolean NOT NULL DEFAULT false,
  pass_rewarded boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (inviter_id <> invitee_id)
);

ALTER TABLE public.invite_redemptions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users view own redemptions"
  ON public.invite_redemptions FOR SELECT
  USING (auth.uid() = inviter_id OR auth.uid() = invitee_id);

CREATE POLICY "invite_redemptions deny direct writes"
  ON public.invite_redemptions AS RESTRICTIVE FOR ALL
  TO anon, authenticated
  USING (false) WITH CHECK (false);

CREATE INDEX IF NOT EXISTS invite_redemptions_inviter_idx ON public.invite_redemptions(inviter_id);

-- RPC: get-or-create my invite code
CREATE OR REPLACE FUNCTION public.get_or_create_my_invite_code()
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_code text;
  v_uid uuid := auth.uid();
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  SELECT code INTO v_code FROM public.invite_codes WHERE user_id = v_uid;
  IF v_code IS NOT NULL THEN RETURN v_code; END IF;

  -- Generate 8-char base32 code from random bytes; retry on collision
  FOR i IN 1..5 LOOP
    v_code := upper(substr(translate(encode(gen_random_bytes(8), 'base64'), '+/=', 'XYZ'), 1, 8));
    BEGIN
      INSERT INTO public.invite_codes (user_id, code) VALUES (v_uid, v_code);
      RETURN v_code;
    EXCEPTION WHEN unique_violation THEN
      -- collision, try again
      NULL;
    END;
  END LOOP;
  RAISE EXCEPTION 'Could not allocate invite code';
END;
$$;

REVOKE ALL ON FUNCTION public.get_or_create_my_invite_code() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_or_create_my_invite_code() TO authenticated;

-- RPC: redeem invite code (called by invitee after signup)
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

  -- Grant 200 shekels to both sides, idempotent via unique invitee_id above
  PERFORM private.ensure_my_wallet(v_inviter);
  PERFORM private.ensure_my_wallet(v_uid);

  UPDATE public.wallets SET shekel_balance = shekel_balance + v_signup_bonus, lifetime_purchased = lifetime_purchased + 0 WHERE user_id = v_inviter;
  UPDATE public.wallets SET shekel_balance = shekel_balance + v_signup_bonus, lifetime_purchased = lifetime_purchased + 0 WHERE user_id = v_uid;

  INSERT INTO public.shekel_ledger (user_id, kind, shekels_delta, label, metadata)
  VALUES
    (v_inviter, 'invite_bonus', v_signup_bonus, 'Invite signup bonus', jsonb_build_object('invitee_id', v_uid)),
    (v_uid,     'invite_bonus', v_signup_bonus, 'Welcome invite bonus', jsonb_build_object('inviter_id', v_inviter));

  -- Notify both
  INSERT INTO public.notifications (user_id, type, title, body, payload) VALUES
    (v_inviter, 'other', 'Invite redeemed 👑', 'A friend you invited just joined CrownMe — +200 shekels for both of you.', jsonb_build_object('event','invite_signup','invitee_id', v_uid)),
    (v_uid,     'other', 'Welcome bonus 👑', 'You joined via an invite — +200 shekels added to your wallet.', jsonb_build_object('event','invite_welcome','inviter_id', v_inviter));

  RETURN jsonb_build_object('ok', true, 'shekels_awarded', v_signup_bonus);
END;
$$;

REVOKE ALL ON FUNCTION public.redeem_invite_code(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.redeem_invite_code(text) TO authenticated;

-- Helper: grant Royal Pass referral bonus (called by webhook when both sides have active pass)
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

  -- Extend current_period_end by 30 days for both active subscriptions
  UPDATE public.royal_pass_subscriptions
     SET current_period_end = COALESCE(current_period_end, now()) + v_extend,
         updated_at = now()
   WHERE user_id IN (v_red.inviter_id, v_red.invitee_id)
     AND status IN ('active','trialing');

  UPDATE public.invite_redemptions SET pass_rewarded = true WHERE id = v_red.id;

  INSERT INTO public.notifications (user_id, type, title, body, payload) VALUES
    (v_red.inviter_id, 'other', 'Royal Pass bonus 👑', 'Your invitee activated Royal Pass — both of you got +30 free days.', jsonb_build_object('event','invite_pass_bonus','days',30)),
    (v_red.invitee_id, 'other', 'Royal Pass bonus 👑', 'You and your inviter both got +30 free Royal Pass days.', jsonb_build_object('event','invite_pass_bonus','days',30));
END;
$$;

REVOKE ALL ON FUNCTION public.grant_pass_invite_bonus(uuid) FROM PUBLIC, anon, authenticated;