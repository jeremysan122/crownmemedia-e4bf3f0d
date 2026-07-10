
-- 1. Extend guard trigger to protect duration_seconds
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
     OR NEW.room_name IS DISTINCT FROM OLD.room_name
     OR NEW.duration_seconds IS DISTINCT FROM OLD.duration_seconds
     OR NEW.created_at IS DISTINCT FROM OLD.created_at THEN
    RAISE EXCEPTION 'not_authorized_to_modify_protected_fields';
  END IF;
  RETURN NEW;
END; $$;

-- 2. create_live_battle RPC
CREATE OR REPLACE FUNCTION public.create_live_battle(_opponent_id UUID, _duration_seconds INTEGER DEFAULT 300)
RETURNS public.live_battles
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  uid UUID := auth.uid();
  dur INTEGER;
  room TEXT;
  flag_on BOOLEAN;
  blocked BOOLEAN;
  row public.live_battles;
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;
  IF _opponent_id IS NULL OR _opponent_id = uid THEN RAISE EXCEPTION 'invalid_opponent'; END IF;

  SELECT public.is_feature_enabled('live_battles_enabled') INTO flag_on;
  IF NOT COALESCE(flag_on, false) THEN RAISE EXCEPTION 'feature_disabled'; END IF;

  -- Rate limit: 5 creations / hour
  PERFORM public.enforce_rate_limit('livebattle:create', 5, 3600);

  -- Block checks (either direction)
  SELECT EXISTS(
    SELECT 1 FROM public.blocks
    WHERE (blocker_id = uid AND blocked_id = _opponent_id)
       OR (blocker_id = _opponent_id AND blocked_id = uid)
  ) INTO blocked;
  IF blocked THEN RAISE EXCEPTION 'blocked'; END IF;

  dur := GREATEST(60, LEAST(3600, COALESCE(_duration_seconds, 300)));
  room := 'lb_' || replace(gen_random_uuid()::text, '-', '');

  INSERT INTO public.live_battles(host_id, opponent_id, room_name, duration_seconds)
  VALUES (uid, _opponent_id, room, dur)
  RETURNING * INTO row;

  -- Monitoring event
  INSERT INTO public.error_logs(user_id, message, source, level, metadata)
  VALUES (uid, 'live_battle_created', 'monitoring', 'info',
          jsonb_build_object('event','live_battle_created','battle_id',row.id,'opponent_id',_opponent_id,'duration',dur));

  RETURN row;
END; $$;

REVOKE ALL ON FUNCTION public.create_live_battle(UUID, INTEGER) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_live_battle(UUID, INTEGER) TO authenticated;

-- 3. Revoke direct INSERT on the tables so RPCs are the only path
REVOKE INSERT ON public.live_battles FROM authenticated;
REVOKE INSERT ON public.live_battle_votes FROM authenticated;
REVOKE INSERT ON public.live_battle_reports FROM authenticated;

DROP POLICY IF EXISTS "live_battles_insert_host" ON public.live_battles;
DROP POLICY IF EXISTS "lbv_insert_self" ON public.live_battle_votes;
DROP POLICY IF EXISTS "lbr_insert_self" ON public.live_battle_reports;

-- 4. Add rate limits to live_battle_vote (recreate function preserving existing body)
CREATE OR REPLACE FUNCTION public.live_battle_vote(_battle_id UUID, _choice TEXT)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  uid UUID := auth.uid();
  b public.live_battles;
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;
  IF _choice NOT IN ('host','opponent') THEN RAISE EXCEPTION 'invalid_choice'; END IF;
  PERFORM public.enforce_rate_limit('livebattle:vote', 20, 60);

  SELECT * INTO b FROM public.live_battles WHERE id = _battle_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'battle_not_found'; END IF;
  IF b.status <> 'live' THEN RAISE EXCEPTION 'battle_not_live'; END IF;
  IF b.ends_at IS NOT NULL AND now() > b.ends_at THEN RAISE EXCEPTION 'battle_not_live'; END IF;
  IF uid IN (b.host_id, b.opponent_id) THEN RAISE EXCEPTION 'participants_cannot_vote'; END IF;
  IF EXISTS(SELECT 1 FROM public.live_battle_votes WHERE battle_id = _battle_id AND viewer_id = uid) THEN
    RAISE EXCEPTION 'already_voted';
  END IF;

  INSERT INTO public.live_battle_votes(battle_id, viewer_id, choice) VALUES (_battle_id, uid, _choice);

  IF _choice = 'host' THEN
    UPDATE public.live_battles SET host_votes = host_votes + 1 WHERE id = _battle_id;
  ELSE
    UPDATE public.live_battles SET opponent_votes = opponent_votes + 1 WHERE id = _battle_id;
  END IF;
END; $$;
REVOKE ALL ON FUNCTION public.live_battle_vote(UUID,TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.live_battle_vote(UUID,TEXT) TO authenticated;

-- 5. live_battle_report RPC
CREATE OR REPLACE FUNCTION public.live_battle_report(_battle_id UUID, _reason TEXT)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE uid UUID := auth.uid();
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;
  IF _reason IS NULL OR char_length(trim(_reason)) = 0 THEN RAISE EXCEPTION 'invalid_reason'; END IF;
  PERFORM public.enforce_rate_limit('livebattle:report', 10, 3600);
  IF NOT EXISTS(SELECT 1 FROM public.live_battles WHERE id = _battle_id) THEN
    RAISE EXCEPTION 'battle_not_found';
  END IF;
  INSERT INTO public.live_battle_reports(battle_id, reporter_id, reason)
  VALUES (_battle_id, uid, substring(_reason from 1 for 500));
END; $$;
REVOKE ALL ON FUNCTION public.live_battle_report(UUID,TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.live_battle_report(UUID,TEXT) TO authenticated;
