
-- 1) Extend status CHECK to include 'needs_resolution'
ALTER TABLE public.tournament_matches DROP CONSTRAINT IF EXISTS tournament_matches_status_check;
ALTER TABLE public.tournament_matches
  ADD CONSTRAINT tournament_matches_status_check
  CHECK (status IN ('pending','ready','live','completed','needs_resolution'));

-- 2) Fix advancement trigger: never advance host on null winner
CREATE OR REPLACE FUNCTION public.tg_tournament_advance()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  m public.tournament_matches;
  advanced UUID;
  remaining INTEGER;
BEGIN
  IF NEW.status <> 'ended' OR COALESCE(OLD.status, '') = 'ended' THEN
    RETURN NEW;
  END IF;

  SELECT * INTO m FROM public.tournament_matches WHERE battle_id = NEW.id;
  IF m.id IS NULL THEN RETURN NEW; END IF;

  -- No winner? Mark for organizer resolution; do not advance anyone.
  IF NEW.winner_id IS NULL THEN
    UPDATE public.tournament_matches
       SET status = 'needs_resolution'
     WHERE id = m.id;

    INSERT INTO public.error_logs(user_id, message, source, level, metadata)
    VALUES (NULL, 'tournament_match_needs_resolution', 'monitoring', 'warn',
            jsonb_build_object(
              'tournament_id', m.tournament_id,
              'match_id', m.id,
              'battle_id', NEW.id));
    RETURN NEW;
  END IF;

  -- Winner must be one of the two participants
  IF NEW.winner_id <> m.host_id AND NEW.winner_id <> m.opponent_id THEN
    UPDATE public.tournament_matches
       SET status = 'needs_resolution'
     WHERE id = m.id;
    RETURN NEW;
  END IF;

  advanced := NEW.winner_id;

  UPDATE public.tournament_matches
     SET winner_id = advanced, status = 'completed'
   WHERE id = m.id;

  IF m.next_match_id IS NOT NULL THEN
    IF m.next_slot = 0 THEN
      UPDATE public.tournament_matches
         SET host_id = advanced,
             status = CASE WHEN opponent_id IS NOT NULL THEN 'ready' ELSE 'pending' END
       WHERE id = m.next_match_id;
    ELSE
      UPDATE public.tournament_matches
         SET opponent_id = advanced,
             status = CASE WHEN host_id IS NOT NULL THEN 'ready' ELSE 'pending' END
       WHERE id = m.next_match_id;
    END IF;
  ELSE
    UPDATE public.tournaments
       SET status = 'completed', winner_id = advanced, completed_at = now()
     WHERE id = m.tournament_id;
  END IF;

  SELECT COUNT(*) INTO remaining
  FROM public.tournament_matches
  WHERE tournament_id = m.tournament_id AND status <> 'completed';
  IF remaining > 0 THEN
    UPDATE public.tournaments t2
       SET current_round = (
         SELECT MIN(round) FROM public.tournament_matches
         WHERE tournament_id = m.tournament_id AND status <> 'completed'
       )
     WHERE t2.id = m.tournament_id;
  END IF;

  RETURN NEW;
END; $$;

-- 3) resolve_tournament_match RPC
CREATE OR REPLACE FUNCTION public.resolve_tournament_match(_match_id UUID, _winner_id UUID)
RETURNS public.tournament_matches
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  uid UUID := auth.uid();
  m public.tournament_matches;
  t public.tournaments;
  remaining INTEGER;
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;

  SELECT * INTO m FROM public.tournament_matches WHERE id = _match_id;
  IF m.id IS NULL THEN RAISE EXCEPTION 'match_not_found'; END IF;

  SELECT * INTO t FROM public.tournaments WHERE id = m.tournament_id;

  IF uid <> t.created_by
     AND NOT (public.has_role(uid,'admin') OR public.has_role(uid,'moderator')) THEN
    RAISE EXCEPTION 'not_authorized';
  END IF;

  IF NOT (m.status = 'needs_resolution' OR (m.status = 'completed' AND m.winner_id IS NULL)) THEN
    RAISE EXCEPTION 'match_not_resolvable';
  END IF;

  IF _winner_id IS NULL OR (_winner_id <> m.host_id AND _winner_id <> m.opponent_id) THEN
    RAISE EXCEPTION 'invalid_winner';
  END IF;

  UPDATE public.tournament_matches
     SET winner_id = _winner_id, status = 'completed'
   WHERE id = m.id
   RETURNING * INTO m;

  IF m.next_match_id IS NOT NULL THEN
    IF m.next_slot = 0 THEN
      UPDATE public.tournament_matches
         SET host_id = _winner_id,
             status = CASE WHEN opponent_id IS NOT NULL THEN 'ready' ELSE 'pending' END
       WHERE id = m.next_match_id;
    ELSE
      UPDATE public.tournament_matches
         SET opponent_id = _winner_id,
             status = CASE WHEN host_id IS NOT NULL THEN 'ready' ELSE 'pending' END
       WHERE id = m.next_match_id;
    END IF;
  ELSE
    UPDATE public.tournaments
       SET status = 'completed', winner_id = _winner_id, completed_at = now()
     WHERE id = m.tournament_id;
  END IF;

  SELECT COUNT(*) INTO remaining
  FROM public.tournament_matches
  WHERE tournament_id = m.tournament_id AND status <> 'completed';
  IF remaining > 0 THEN
    UPDATE public.tournaments t2
       SET current_round = (
         SELECT MIN(round) FROM public.tournament_matches
         WHERE tournament_id = m.tournament_id AND status <> 'completed'
       )
     WHERE t2.id = m.tournament_id;
  END IF;

  INSERT INTO public.error_logs(user_id, message, source, level, metadata)
  VALUES (uid, 'tournament_match_resolved', 'monitoring', 'info',
          jsonb_build_object('match_id', m.id, 'winner_id', _winner_id));

  RETURN m;
END; $$;

REVOKE ALL ON FUNCTION public.resolve_tournament_match(UUID, UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.resolve_tournament_match(UUID, UUID) TO authenticated;

-- 4) Allow start_tournament_match to rerun a needs_resolution match with a fresh battle
CREATE OR REPLACE FUNCTION public.start_tournament_match(_match_id UUID)
RETURNS public.live_battles
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  uid UUID := auth.uid();
  m public.tournament_matches;
  t public.tournaments;
  room TEXT;
  new_battle public.live_battles;
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;

  SELECT * INTO m FROM public.tournament_matches WHERE id = _match_id;
  IF m.id IS NULL THEN RAISE EXCEPTION 'match_not_found'; END IF;
  IF m.status NOT IN ('ready','needs_resolution') THEN RAISE EXCEPTION 'match_not_ready'; END IF;
  IF m.status = 'ready' AND m.battle_id IS NOT NULL THEN RAISE EXCEPTION 'match_already_started'; END IF;
  IF m.host_id IS NULL OR m.opponent_id IS NULL THEN RAISE EXCEPTION 'match_missing_participants'; END IF;

  SELECT * INTO t FROM public.tournaments WHERE id = m.tournament_id;
  IF uid <> t.created_by AND uid <> m.host_id AND uid <> m.opponent_id
     AND NOT (public.has_role(uid,'admin') OR public.has_role(uid,'moderator')) THEN
    RAISE EXCEPTION 'not_authorized';
  END IF;

  room := 'tm_' || replace(gen_random_uuid()::text, '-', '');

  INSERT INTO public.live_battles(
    host_id, opponent_id, room_name, duration_seconds, category_slug, region
  ) VALUES (
    m.host_id, m.opponent_id, room, t.duration_seconds, t.category_slug, t.region
  ) RETURNING * INTO new_battle;

  UPDATE public.tournament_matches
     SET battle_id = new_battle.id, status = 'live', winner_id = NULL
   WHERE id = m.id;

  RETURN new_battle;
END; $$;

REVOKE ALL ON FUNCTION public.start_tournament_match(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.start_tournament_match(UUID) TO authenticated;
