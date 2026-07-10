-- Live Battles v1
CREATE TABLE IF NOT EXISTS public.live_battles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  host_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  opponent_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  room_name TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','live','ended','declined','cancelled')),
  duration_seconds INTEGER NOT NULL DEFAULT 300
    CHECK (duration_seconds BETWEEN 60 AND 3600),
  started_at TIMESTAMPTZ,
  ends_at TIMESTAMPTZ,
  host_votes INTEGER NOT NULL DEFAULT 0,
  opponent_votes INTEGER NOT NULL DEFAULT 0,
  winner_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  ended_reason TEXT,
  force_ended_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  is_hidden BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (host_id <> opponent_id)
);
GRANT SELECT, INSERT, UPDATE ON public.live_battles TO authenticated;
GRANT ALL ON public.live_battles TO service_role;
ALTER TABLE public.live_battles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "live_battles_read_visible" ON public.live_battles FOR SELECT TO authenticated
  USING (NOT is_hidden OR public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'moderator')
         OR auth.uid() = host_id OR auth.uid() = opponent_id);
CREATE POLICY "live_battles_insert_host" ON public.live_battles FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = host_id);
CREATE POLICY "live_battles_update_participants_or_admin" ON public.live_battles FOR UPDATE TO authenticated
  USING (auth.uid() IN (host_id, opponent_id) OR public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'moderator'))
  WITH CHECK (auth.uid() IN (host_id, opponent_id) OR public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'moderator'));

CREATE INDEX IF NOT EXISTS live_battles_status_idx ON public.live_battles (status, created_at DESC);
CREATE INDEX IF NOT EXISTS live_battles_host_idx ON public.live_battles (host_id, created_at DESC);
CREATE INDEX IF NOT EXISTS live_battles_opponent_idx ON public.live_battles (opponent_id, created_at DESC);

CREATE OR REPLACE FUNCTION public.tg_live_battles_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;
CREATE TRIGGER trg_live_battles_updated_at BEFORE UPDATE ON public.live_battles
  FOR EACH ROW EXECUTE FUNCTION public.tg_live_battles_updated_at();

CREATE OR REPLACE FUNCTION public.tg_live_battles_guard()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE is_priv BOOLEAN;
BEGIN
  is_priv := public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'moderator')
          OR current_setting('role', true) = 'service_role';
  IF is_priv THEN RETURN NEW; END IF;
  IF NEW.status IS DISTINCT FROM OLD.status
     OR NEW.host_votes IS DISTINCT FROM OLD.host_votes
     OR NEW.opponent_votes IS DISTINCT FROM OLD.opponent_votes
     OR NEW.winner_id IS DISTINCT FROM OLD.winner_id
     OR NEW.started_at IS DISTINCT FROM OLD.started_at
     OR NEW.ends_at IS DISTINCT FROM OLD.ends_at
     OR NEW.ended_reason IS DISTINCT FROM OLD.ended_reason
     OR NEW.force_ended_by IS DISTINCT FROM OLD.force_ended_by
     OR NEW.is_hidden IS DISTINCT FROM OLD.is_hidden
     OR NEW.host_id IS DISTINCT FROM OLD.host_id
     OR NEW.opponent_id IS DISTINCT FROM OLD.opponent_id
     OR NEW.room_name IS DISTINCT FROM OLD.room_name THEN
    RAISE EXCEPTION 'not_authorized_to_modify_protected_fields';
  END IF;
  RETURN NEW;
END; $$;
CREATE TRIGGER trg_live_battles_guard BEFORE UPDATE ON public.live_battles
  FOR EACH ROW EXECUTE FUNCTION public.tg_live_battles_guard();

CREATE TABLE IF NOT EXISTS public.live_battle_votes (
  battle_id UUID NOT NULL REFERENCES public.live_battles(id) ON DELETE CASCADE,
  viewer_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  choice TEXT NOT NULL CHECK (choice IN ('host','opponent')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (battle_id, viewer_id)
);
GRANT SELECT, INSERT ON public.live_battle_votes TO authenticated;
GRANT ALL ON public.live_battle_votes TO service_role;
ALTER TABLE public.live_battle_votes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "lbv_select_self_or_admin" ON public.live_battle_votes FOR SELECT TO authenticated
  USING (viewer_id = auth.uid() OR public.has_role(auth.uid(),'admin'));
CREATE POLICY "lbv_insert_self" ON public.live_battle_votes FOR INSERT TO authenticated
  WITH CHECK (viewer_id = auth.uid());

CREATE TABLE IF NOT EXISTS public.live_battle_reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  battle_id UUID NOT NULL REFERENCES public.live_battles(id) ON DELETE CASCADE,
  reporter_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  reason TEXT NOT NULL CHECK (char_length(reason) BETWEEN 1 AND 500),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT ON public.live_battle_reports TO authenticated;
GRANT ALL ON public.live_battle_reports TO service_role;
ALTER TABLE public.live_battle_reports ENABLE ROW LEVEL SECURITY;
CREATE POLICY "lbr_select_admin_or_self" ON public.live_battle_reports FOR SELECT TO authenticated
  USING (reporter_id = auth.uid() OR public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'moderator'));
CREATE POLICY "lbr_insert_self" ON public.live_battle_reports FOR INSERT TO authenticated
  WITH CHECK (reporter_id = auth.uid());
CREATE INDEX IF NOT EXISTS lbr_battle_idx ON public.live_battle_reports (battle_id, created_at DESC);

CREATE TABLE IF NOT EXISTS public.live_battle_participants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  battle_id UUID NOT NULL REFERENCES public.live_battles(id) ON DELETE CASCADE,
  target_user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  action TEXT NOT NULL CHECK (action IN ('mute','unmute','kick')),
  actor_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT ON public.live_battle_participants TO authenticated;
GRANT ALL ON public.live_battle_participants TO service_role;
ALTER TABLE public.live_battle_participants ENABLE ROW LEVEL SECURITY;
CREATE POLICY "lbp_select_participants_or_admin" ON public.live_battle_participants FOR SELECT TO authenticated
  USING (target_user_id = auth.uid() OR actor_id = auth.uid()
    OR public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'moderator')
    OR EXISTS (SELECT 1 FROM public.live_battles b WHERE b.id = battle_id AND (b.host_id = auth.uid() OR b.opponent_id = auth.uid())));

INSERT INTO public.feature_flags (key, description, enabled, audience, rollout_percent)
VALUES ('live_battles_enabled', 'Enable Live Battles v1 (LiveKit)', false, 'admins', 0)
ON CONFLICT (key) DO NOTHING;

CREATE OR REPLACE FUNCTION public.live_battle_vote(_battle_id UUID, _choice TEXT)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE b public.live_battles%ROWTYPE; uid UUID := auth.uid();
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'not_signed_in'; END IF;
  IF _choice NOT IN ('host','opponent') THEN RAISE EXCEPTION 'invalid_choice'; END IF;
  SELECT * INTO b FROM public.live_battles WHERE id = _battle_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'battle_not_found'; END IF;
  IF b.status <> 'live' THEN RAISE EXCEPTION 'battle_not_live'; END IF;
  IF b.ends_at IS NOT NULL AND b.ends_at <= now() THEN RAISE EXCEPTION 'battle_not_live'; END IF;
  IF uid IN (b.host_id, b.opponent_id) THEN RAISE EXCEPTION 'participants_cannot_vote'; END IF;
  INSERT INTO public.live_battle_votes(battle_id, viewer_id, choice) VALUES (_battle_id, uid, _choice);
  IF _choice = 'host' THEN
    UPDATE public.live_battles SET host_votes = host_votes + 1 WHERE id = _battle_id;
  ELSE
    UPDATE public.live_battles SET opponent_votes = opponent_votes + 1 WHERE id = _battle_id;
  END IF;
EXCEPTION WHEN unique_violation THEN RAISE EXCEPTION 'already_voted';
END; $$;
REVOKE ALL ON FUNCTION public.live_battle_vote(UUID,TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.live_battle_vote(UUID,TEXT) TO authenticated;

CREATE OR REPLACE FUNCTION public.live_battle_end(_battle_id UUID, _force BOOLEAN DEFAULT false, _reason TEXT DEFAULT NULL)
RETURNS public.live_battles LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE b public.live_battles%ROWTYPE; uid UUID := auth.uid(); is_admin BOOLEAN;
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'not_signed_in'; END IF;
  is_admin := public.has_role(uid,'admin') OR public.has_role(uid,'moderator');
  SELECT * INTO b FROM public.live_battles WHERE id = _battle_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'battle_not_found'; END IF;
  IF _force AND NOT is_admin THEN RAISE EXCEPTION 'not_authorized'; END IF;
  IF NOT _force AND uid NOT IN (b.host_id, b.opponent_id) AND NOT is_admin THEN
    RAISE EXCEPTION 'not_authorized';
  END IF;
  IF b.status = 'ended' THEN RETURN b; END IF;
  UPDATE public.live_battles
    SET status = 'ended',
        ends_at = COALESCE(ends_at, now()),
        ended_reason = COALESCE(_reason, CASE WHEN _force THEN 'admin_force_end' ELSE 'host_end' END),
        force_ended_by = CASE WHEN _force THEN uid ELSE force_ended_by END,
        winner_id = CASE WHEN host_votes > opponent_votes THEN host_id
                         WHEN opponent_votes > host_votes THEN opponent_id
                         ELSE NULL END
   WHERE id = _battle_id RETURNING * INTO b;
  RETURN b;
END; $$;
REVOKE ALL ON FUNCTION public.live_battle_end(UUID,BOOLEAN,TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.live_battle_end(UUID,BOOLEAN,TEXT) TO authenticated;

CREATE OR REPLACE FUNCTION public.live_battle_start(_battle_id UUID)
RETURNS public.live_battles LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE b public.live_battles%ROWTYPE; uid UUID := auth.uid();
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'not_signed_in'; END IF;
  SELECT * INTO b FROM public.live_battles WHERE id = _battle_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'battle_not_found'; END IF;
  IF uid NOT IN (b.host_id, b.opponent_id) THEN RAISE EXCEPTION 'not_participant'; END IF;
  IF b.status = 'live' THEN RETURN b; END IF;
  IF b.status <> 'pending' THEN RAISE EXCEPTION 'battle_not_pending'; END IF;
  UPDATE public.live_battles
    SET status = 'live', started_at = now(), ends_at = now() + make_interval(secs => b.duration_seconds)
   WHERE id = _battle_id RETURNING * INTO b;
  RETURN b;
END; $$;
REVOKE ALL ON FUNCTION public.live_battle_start(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.live_battle_start(UUID) TO authenticated;

CREATE OR REPLACE FUNCTION public.live_battle_log_action(_battle_id UUID, _target UUID, _action TEXT)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE b public.live_battles%ROWTYPE; uid UUID := auth.uid(); is_admin BOOLEAN;
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'not_signed_in'; END IF;
  IF _action NOT IN ('mute','unmute','kick') THEN RAISE EXCEPTION 'invalid_action'; END IF;
  is_admin := public.has_role(uid,'admin') OR public.has_role(uid,'moderator');
  SELECT * INTO b FROM public.live_battles WHERE id = _battle_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'battle_not_found'; END IF;
  IF NOT is_admin AND uid <> b.host_id THEN RAISE EXCEPTION 'not_authorized'; END IF;
  INSERT INTO public.live_battle_participants(battle_id, target_user_id, action, actor_id)
    VALUES (_battle_id, _target, _action, uid);
END; $$;
REVOKE ALL ON FUNCTION public.live_battle_log_action(UUID,UUID,TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.live_battle_log_action(UUID,UUID,TEXT) TO authenticated;