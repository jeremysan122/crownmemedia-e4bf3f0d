
-- Wave 2 — Pre-battle Lobby foundation.
-- Adds ready-state columns and two SECURITY DEFINER RPCs used by the
-- new /battles/:id/lobby route.

ALTER TABLE public.live_battles
  ADD COLUMN IF NOT EXISTS host_ready boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS opponent_ready boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS lobby_opened_at timestamptz,
  ADD COLUMN IF NOT EXISTS go_live_at timestamptz;

-- Toggle the caller's own ready flag. Host or opponent only; battle must be
-- in a pre-live state. Idempotent.
CREATE OR REPLACE FUNCTION public.set_lobby_ready(
  _battle_id uuid,
  _ready boolean
) RETURNS public.live_battles
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _uid uuid := auth.uid();
  _battle public.live_battles;
BEGIN
  IF _uid IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;

  SELECT * INTO _battle FROM public.live_battles WHERE id = _battle_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'battle_not_found'; END IF;

  IF _battle.status NOT IN ('pending', 'scheduled') THEN
    RAISE EXCEPTION 'battle_not_in_lobby';
  END IF;

  IF _uid = _battle.host_id THEN
    UPDATE public.live_battles
      SET host_ready = _ready,
          lobby_opened_at = COALESCE(lobby_opened_at, now())
      WHERE id = _battle_id RETURNING * INTO _battle;
  ELSIF _uid = _battle.opponent_id THEN
    UPDATE public.live_battles
      SET opponent_ready = _ready,
          lobby_opened_at = COALESCE(lobby_opened_at, now())
      WHERE id = _battle_id RETURNING * INTO _battle;
  ELSE
    RAISE EXCEPTION 'not_participant';
  END IF;

  RETURN _battle;
END;
$$;

REVOKE ALL ON FUNCTION public.set_lobby_ready(uuid, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_lobby_ready(uuid, boolean) TO authenticated;

-- Host-only: transition a fully-ready battle into 'live'.
-- Accepts pending OR scheduled. Both participants must be ready.
CREATE OR REPLACE FUNCTION public.start_battle_from_lobby(
  _battle_id uuid
) RETURNS public.live_battles
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _uid uuid := auth.uid();
  _battle public.live_battles;
  _now timestamptz := now();
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
        started_at = _now,
        ends_at = _now + make_interval(secs => duration_seconds),
        go_live_at = _now
    WHERE id = _battle_id
    RETURNING * INTO _battle;

  RETURN _battle;
END;
$$;

REVOKE ALL ON FUNCTION public.start_battle_from_lobby(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.start_battle_from_lobby(uuid) TO authenticated;
