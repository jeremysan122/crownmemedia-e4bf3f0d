
-- ============================================================
-- CREATOR EARLY ACCESS PROGRAM
-- ============================================================

-- ---------- creator_programs ----------
CREATE TABLE public.creator_programs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL UNIQUE,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','approved','rejected','suspended')),
  referral_code TEXT,
  approved_by UUID,
  approved_at TIMESTAMPTZ,
  rejected_reason TEXT,
  application_note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.creator_programs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "creator_programs self read"
  ON public.creator_programs FOR SELECT TO authenticated
  USING (auth.uid() = user_id OR is_any_admin(auth.uid()));

CREATE POLICY "creator_programs self apply"
  ON public.creator_programs FOR INSERT TO authenticated
  WITH CHECK (
    auth.uid() = user_id
    AND status = 'pending'
    AND approved_by IS NULL
    AND approved_at IS NULL
  );

CREATE POLICY "creator_programs admin update"
  ON public.creator_programs FOR UPDATE TO authenticated
  USING (is_any_admin(auth.uid()))
  WITH CHECK (is_any_admin(auth.uid()));

CREATE INDEX idx_creator_programs_status ON public.creator_programs(status);

-- ---------- creator_milestones (config) ----------
CREATE TABLE public.creator_milestones (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  milestone_key TEXT NOT NULL UNIQUE,
  label TEXT NOT NULL,
  required_count INT NOT NULL CHECK (required_count > 0),
  reward_type TEXT NOT NULL,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  sort_order INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.creator_milestones ENABLE ROW LEVEL SECURITY;

CREATE POLICY "milestones readable by authed"
  ON public.creator_milestones FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "milestones admin write"
  ON public.creator_milestones FOR ALL TO authenticated
  USING (is_any_admin(auth.uid()))
  WITH CHECK (is_any_admin(auth.uid()));

INSERT INTO public.creator_milestones (milestone_key,label,required_count,reward_type,sort_order) VALUES
  ('active_10','10 active invited users — Verified Badge',10,'verified_badge',1),
  ('active_25','25 active invited users — Profile Glow Trial',25,'profile_glow_trial',2),
  ('active_50','50 active invited users — Royal Pass',50,'royal_pass',3),
  ('active_100','100 active invited users — Founder Crown + Spotlight',100,'founder_crown',4),
  ('active_250','250 active invited users — Exclusive Frame + Leaderboard Boost',250,'exclusive_frame',5);

-- ---------- creator_referrals ----------
CREATE TABLE public.creator_referrals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  creator_id UUID NOT NULL,
  referred_user_id UUID NOT NULL,
  referral_code TEXT,
  signup_completed BOOLEAN NOT NULL DEFAULT TRUE,
  email_verified BOOLEAN NOT NULL DEFAULT FALSE,
  first_post_completed BOOLEAN NOT NULL DEFAULT FALSE,
  first_vote_completed BOOLEAN NOT NULL DEFAULT FALSE,
  first_battle_completed BOOLEAN NOT NULL DEFAULT FALSE,
  first_purchase_completed BOOLEAN NOT NULL DEFAULT FALSE,
  active_qualified BOOLEAN NOT NULL DEFAULT FALSE,
  active_qualified_at TIMESTAMPTZ,
  revenue_generated NUMERIC NOT NULL DEFAULT 0,
  fraud_flag BOOLEAN NOT NULL DEFAULT FALSE,
  fraud_reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (creator_id, referred_user_id),
  CHECK (creator_id <> referred_user_id)
);

ALTER TABLE public.creator_referrals ENABLE ROW LEVEL SECURITY;

CREATE POLICY "creator_referrals creator read"
  ON public.creator_referrals FOR SELECT TO authenticated
  USING (auth.uid() = creator_id OR is_any_admin(auth.uid()));

CREATE POLICY "creator_referrals admin write"
  ON public.creator_referrals FOR ALL TO authenticated
  USING (is_any_admin(auth.uid()))
  WITH CHECK (is_any_admin(auth.uid()));

CREATE INDEX idx_creator_referrals_creator ON public.creator_referrals(creator_id);
CREATE INDEX idx_creator_referrals_referred ON public.creator_referrals(referred_user_id);
CREATE INDEX idx_creator_referrals_active ON public.creator_referrals(creator_id) WHERE active_qualified;

-- ---------- creator_rewards ----------
CREATE TABLE public.creator_rewards (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  creator_id UUID NOT NULL,
  milestone_key TEXT NOT NULL,
  reward_type TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','approved','granted','revoked','rejected')),
  granted_by UUID,
  granted_at TIMESTAMPTZ,
  revoked_at TIMESTAMPTZ,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (creator_id, milestone_key)
);

ALTER TABLE public.creator_rewards ENABLE ROW LEVEL SECURITY;

CREATE POLICY "creator_rewards creator read"
  ON public.creator_rewards FOR SELECT TO authenticated
  USING (auth.uid() = creator_id OR is_any_admin(auth.uid()));

CREATE POLICY "creator_rewards admin write"
  ON public.creator_rewards FOR ALL TO authenticated
  USING (is_any_admin(auth.uid()))
  WITH CHECK (is_any_admin(auth.uid()));

CREATE INDEX idx_creator_rewards_creator ON public.creator_rewards(creator_id);
CREATE INDEX idx_creator_rewards_status ON public.creator_rewards(status);

-- ---------- shared updated_at trigger ----------
CREATE OR REPLACE FUNCTION public.tg_set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$;

CREATE TRIGGER trg_creator_programs_updated BEFORE UPDATE ON public.creator_programs
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();
CREATE TRIGGER trg_creator_referrals_updated BEFORE UPDATE ON public.creator_referrals
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();
CREATE TRIGGER trg_creator_rewards_updated BEFORE UPDATE ON public.creator_rewards
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

-- ---------- helper: assign referral_code on approval ----------
CREATE OR REPLACE FUNCTION public.tg_assign_creator_referral_code()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE existing TEXT;
BEGIN
  IF NEW.status = 'approved' AND NEW.referral_code IS NULL THEN
    SELECT code INTO existing FROM public.invite_codes WHERE user_id = NEW.user_id LIMIT 1;
    IF existing IS NULL THEN
      existing := 'CR' || upper(substr(replace(gen_random_uuid()::text,'-',''),1,8));
      INSERT INTO public.invite_codes (user_id, code) VALUES (NEW.user_id, existing)
        ON CONFLICT DO NOTHING;
    END IF;
    NEW.referral_code := existing;
    IF NEW.approved_at IS NULL THEN NEW.approved_at := now(); END IF;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_assign_creator_code
  BEFORE UPDATE ON public.creator_programs
  FOR EACH ROW EXECUTE FUNCTION public.tg_assign_creator_referral_code();

-- ---------- milestone evaluation ----------
CREATE OR REPLACE FUNCTION public.evaluate_creator_milestones(_creator_id UUID)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  active_count INT;
  m RECORD;
BEGIN
  SELECT count(*) INTO active_count
  FROM public.creator_referrals
  WHERE creator_id = _creator_id AND active_qualified AND NOT fraud_flag;

  FOR m IN
    SELECT milestone_key, reward_type, required_count
    FROM public.creator_milestones WHERE active
  LOOP
    IF active_count >= m.required_count THEN
      INSERT INTO public.creator_rewards (creator_id, milestone_key, reward_type, metadata)
      VALUES (_creator_id, m.milestone_key, m.reward_type,
              jsonb_build_object('unlocked_at_count', active_count))
      ON CONFLICT (creator_id, milestone_key) DO NOTHING;
    END IF;
  END LOOP;
END;
$$;

-- ---------- on invite redemption, create creator_referrals row ----------
CREATE OR REPLACE FUNCTION public.tg_invite_to_creator_referral()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE creator_uid UUID;
BEGIN
  SELECT user_id INTO creator_uid
  FROM public.creator_programs
  WHERE user_id = NEW.inviter_id AND status = 'approved';

  IF creator_uid IS NULL THEN RETURN NEW; END IF;
  IF NEW.invitee_id = creator_uid THEN RETURN NEW; END IF;

  INSERT INTO public.creator_referrals (creator_id, referred_user_id, referral_code, signup_completed, email_verified)
  VALUES (creator_uid, NEW.invitee_id, NEW.code, true, true)
  ON CONFLICT (creator_id, referred_user_id) DO NOTHING;

  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_invite_to_creator_referral
  AFTER INSERT ON public.invite_redemptions
  FOR EACH ROW EXECUTE FUNCTION public.tg_invite_to_creator_referral();

-- ---------- mark referral activity from posts/votes/battles ----------
CREATE OR REPLACE FUNCTION public.tg_mark_referral_post()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE r RECORD;
BEGIN
  FOR r IN SELECT id, creator_id, created_at FROM public.creator_referrals WHERE referred_user_id = NEW.user_id LOOP
    UPDATE public.creator_referrals
    SET first_post_completed = true,
        active_qualified = CASE WHEN active_qualified THEN true
                                WHEN NEW.created_at <= r.created_at + interval '7 days' THEN true
                                ELSE active_qualified END,
        active_qualified_at = COALESCE(active_qualified_at,
          CASE WHEN NEW.created_at <= r.created_at + interval '7 days' THEN now() END)
    WHERE id = r.id;
    PERFORM public.evaluate_creator_milestones(r.creator_id);
  END LOOP;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.tg_mark_referral_vote()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE r RECORD;
BEGIN
  FOR r IN SELECT id, creator_id, created_at FROM public.creator_referrals WHERE referred_user_id = NEW.user_id LOOP
    UPDATE public.creator_referrals
    SET first_vote_completed = true,
        active_qualified = CASE WHEN active_qualified THEN true
                                WHEN now() <= r.created_at + interval '7 days' THEN true
                                ELSE active_qualified END,
        active_qualified_at = COALESCE(active_qualified_at,
          CASE WHEN now() <= r.created_at + interval '7 days' THEN now() END)
    WHERE id = r.id;
    PERFORM public.evaluate_creator_milestones(r.creator_id);
  END LOOP;
  RETURN NEW;
END;
$$;

-- attach triggers (votes table exists per schema; posts table assumed)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_class WHERE relname='posts' AND relnamespace='public'::regnamespace) THEN
    EXECUTE 'CREATE TRIGGER trg_referral_on_post AFTER INSERT ON public.posts FOR EACH ROW EXECUTE FUNCTION public.tg_mark_referral_post()';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_class WHERE relname='votes' AND relnamespace='public'::regnamespace) THEN
    EXECUTE 'CREATE TRIGGER trg_referral_on_vote AFTER INSERT ON public.votes FOR EACH ROW EXECUTE FUNCTION public.tg_mark_referral_vote()';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_class WHERE relname='battles' AND relnamespace='public'::regnamespace) THEN
    EXECUTE $T$
      CREATE OR REPLACE FUNCTION public.tg_mark_referral_battle()
      RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $f$
      DECLARE r RECORD; uid UUID;
      BEGIN
        FOR uid IN SELECT unnest(ARRAY[NEW.challenger_id, NEW.opponent_id]) LOOP
          FOR r IN SELECT id, creator_id, created_at FROM public.creator_referrals WHERE referred_user_id = uid LOOP
            UPDATE public.creator_referrals
            SET first_battle_completed = true,
                active_qualified = CASE WHEN active_qualified THEN true
                                        WHEN now() <= r.created_at + interval '7 days' THEN true
                                        ELSE active_qualified END,
                active_qualified_at = COALESCE(active_qualified_at,
                  CASE WHEN now() <= r.created_at + interval '7 days' THEN now() END)
            WHERE id = r.id;
            PERFORM public.evaluate_creator_milestones(r.creator_id);
          END LOOP;
        END LOOP;
        RETURN NEW;
      END;
      $f$;
    $T$;
    EXECUTE 'CREATE TRIGGER trg_referral_on_battle AFTER INSERT ON public.battles FOR EACH ROW EXECUTE FUNCTION public.tg_mark_referral_battle()';
  END IF;
END$$;

-- ---------- self-service: apply to creator program ----------
CREATE OR REPLACE FUNCTION public.apply_to_creator_program(_note TEXT DEFAULT NULL)
RETURNS public.creator_programs
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE row public.creator_programs;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;
  INSERT INTO public.creator_programs (user_id, application_note)
  VALUES (auth.uid(), _note)
  ON CONFLICT (user_id) DO UPDATE SET application_note = COALESCE(EXCLUDED.application_note, public.creator_programs.application_note)
  RETURNING * INTO row;
  RETURN row;
END;
$$;

-- ---------- admin: approve / reject ----------
CREATE OR REPLACE FUNCTION public.admin_set_creator_status(_user_id UUID, _status TEXT, _reason TEXT DEFAULT NULL)
RETURNS public.creator_programs
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE row public.creator_programs;
BEGIN
  IF NOT is_any_admin(auth.uid()) THEN RAISE EXCEPTION 'not_admin'; END IF;
  IF _status NOT IN ('pending','approved','rejected','suspended') THEN RAISE EXCEPTION 'invalid_status'; END IF;

  UPDATE public.creator_programs
  SET status = _status,
      approved_by = CASE WHEN _status='approved' THEN auth.uid() ELSE approved_by END,
      rejected_reason = CASE WHEN _status IN ('rejected','suspended') THEN _reason ELSE rejected_reason END
  WHERE user_id = _user_id
  RETURNING * INTO row;

  INSERT INTO public.admin_audit_log (actor_id, action, target_type, target_id, details)
  VALUES (auth.uid(), 'creator_program_status', 'creator_programs', _user_id::text,
          jsonb_build_object('status', _status, 'reason', _reason));
  RETURN row;
END;
$$;

-- ---------- admin: approve / grant / revoke a reward ----------
CREATE OR REPLACE FUNCTION public.admin_set_creator_reward(_reward_id UUID, _status TEXT)
RETURNS public.creator_rewards
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE row public.creator_rewards;
BEGIN
  IF NOT is_any_admin(auth.uid()) THEN RAISE EXCEPTION 'not_admin'; END IF;
  IF _status NOT IN ('pending','approved','granted','revoked','rejected') THEN RAISE EXCEPTION 'invalid_status'; END IF;

  UPDATE public.creator_rewards
  SET status = _status,
      granted_by = CASE WHEN _status='granted' THEN auth.uid() ELSE granted_by END,
      granted_at = CASE WHEN _status='granted' THEN now() ELSE granted_at END,
      revoked_at = CASE WHEN _status='revoked' THEN now() ELSE revoked_at END
  WHERE id = _reward_id
  RETURNING * INTO row;

  INSERT INTO public.admin_audit_log (actor_id, action, target_type, target_id, details)
  VALUES (auth.uid(), 'creator_reward_status', 'creator_rewards', _reward_id::text,
          jsonb_build_object('status', _status, 'creator_id', row.creator_id, 'reward_type', row.reward_type));
  RETURN row;
END;
$$;

-- ---------- dashboard stats RPC ----------
CREATE OR REPLACE FUNCTION public.get_creator_dashboard(_user_id UUID DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public STABLE AS $$
DECLARE
  uid UUID := COALESCE(_user_id, auth.uid());
  prog public.creator_programs;
  total_invites INT;
  active_invites INT;
  posted INT;
  voted INT;
  purchased INT;
  revenue NUMERIC;
  next_milestone JSONB;
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;
  IF uid <> auth.uid() AND NOT is_any_admin(auth.uid()) THEN RAISE EXCEPTION 'forbidden'; END IF;

  SELECT * INTO prog FROM public.creator_programs WHERE user_id = uid;
  IF prog.id IS NULL THEN RETURN jsonb_build_object('program', NULL); END IF;

  SELECT count(*),
         count(*) FILTER (WHERE active_qualified AND NOT fraud_flag),
         count(*) FILTER (WHERE first_post_completed),
         count(*) FILTER (WHERE first_vote_completed),
         count(*) FILTER (WHERE first_purchase_completed),
         COALESCE(sum(revenue_generated),0)
    INTO total_invites, active_invites, posted, voted, purchased, revenue
  FROM public.creator_referrals WHERE creator_id = uid;

  SELECT jsonb_build_object(
    'milestone_key', milestone_key, 'label', label,
    'required_count', required_count, 'reward_type', reward_type,
    'progress', active_invites,
    'remaining', GREATEST(required_count - active_invites, 0)
  ) INTO next_milestone
  FROM public.creator_milestones
  WHERE active AND required_count > active_invites
  ORDER BY required_count ASC LIMIT 1;

  RETURN jsonb_build_object(
    'program', to_jsonb(prog),
    'stats', jsonb_build_object(
      'total_invites', total_invites,
      'active_invites', active_invites,
      'posted', posted,
      'voted', voted,
      'purchased', purchased,
      'revenue', revenue,
      'conversion_rate', CASE WHEN total_invites > 0
        THEN round((active_invites::numeric / total_invites::numeric) * 100, 1) ELSE 0 END
    ),
    'next_milestone', next_milestone
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.apply_to_creator_program(TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_set_creator_status(UUID,TEXT,TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_set_creator_reward(UUID,TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_creator_dashboard(UUID) TO authenticated;
