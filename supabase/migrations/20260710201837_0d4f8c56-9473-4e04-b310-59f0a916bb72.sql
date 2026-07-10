
-- Wave 2 fix: real 5-second lobby countdown.
CREATE OR REPLACE FUNCTION public.start_battle_from_lobby(_battle_id uuid)
RETURNS public.live_battles
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _uid uuid := auth.uid();
  _battle public.live_battles;
  _go_live timestamptz := now() + interval '5 seconds';
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;

  SELECT * INTO _battle FROM public.live_battles WHERE id = _battle_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'battle_not_found'; END IF;
  IF _uid <> _battle.host_id THEN RAISE EXCEPTION 'only_host'; END IF;
  IF _battle.status NOT IN ('pending', 'scheduled') THEN
    RAISE EXCEPTION 'battle_not_in_lobby';
  END IF;
  IF NOT (_battle.host_ready AND _battle.opponent_ready) THEN
    RAISE EXCEPTION 'both_must_be_ready';
  END IF;

  UPDATE public.live_battles
    SET status = 'live',
        go_live_at = _go_live,
        started_at = _go_live,
        ends_at    = _go_live + make_interval(secs => duration_seconds)
    WHERE id = _battle_id
    RETURNING * INTO _battle;

  RETURN _battle;
END;
$$;
REVOKE ALL ON FUNCTION public.start_battle_from_lobby(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.start_battle_from_lobby(uuid) TO authenticated;

-- Voting: reject before started_at and split battle_ended from battle_not_live.
CREATE OR REPLACE FUNCTION public.live_battle_vote(_battle_id uuid, _choice text)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  uid uuid := auth.uid();
  b public.live_battles;
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;
  IF _choice NOT IN ('host','opponent') THEN RAISE EXCEPTION 'invalid_choice'; END IF;
  PERFORM public.enforce_rate_limit('livebattle:vote', 20, 60);

  SELECT * INTO b FROM public.live_battles WHERE id = _battle_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'battle_not_found'; END IF;
  IF b.status <> 'live' THEN RAISE EXCEPTION 'battle_not_live'; END IF;
  IF b.started_at IS NOT NULL AND now() < b.started_at THEN
    RAISE EXCEPTION 'battle_not_started';
  END IF;
  IF b.ends_at IS NOT NULL AND now() >= b.ends_at THEN
    RAISE EXCEPTION 'battle_ended';
  END IF;
  IF uid IN (b.host_id, b.opponent_id) THEN RAISE EXCEPTION 'participants_cannot_vote'; END IF;

  INSERT INTO public.live_battle_votes(battle_id, viewer_id, choice)
  VALUES (_battle_id, uid, _choice);

  IF _choice = 'host' THEN
    UPDATE public.live_battles SET host_votes = host_votes + 1 WHERE id = _battle_id;
  ELSE
    UPDATE public.live_battles SET opponent_votes = opponent_votes + 1 WHERE id = _battle_id;
  END IF;
END;
$$;
REVOKE ALL ON FUNCTION public.live_battle_vote(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.live_battle_vote(uuid, text) TO authenticated;
