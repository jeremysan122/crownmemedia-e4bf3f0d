-- Wave 3: Spectator UX — server-side emote rate limiter.
-- Emote bursts are broadcast client-to-client over a Supabase Realtime
-- channel `battle_emotes:{id}`. This RPC gate-keeps the send: it only
-- returns ok after enforcing per-user rate limits and confirming the
-- battle is live and the caller isn't blocked by a participant.
-- No table writes — emotes are ephemeral by design.

CREATE OR REPLACE FUNCTION public.live_battle_send_emote(
  _battle_id uuid,
  _kind text
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_battle public.live_battles%ROWTYPE;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;

  IF _kind IS NULL OR _kind NOT IN ('heart','crown','fire','clap','laugh') THEN
    RAISE EXCEPTION 'invalid_emote';
  END IF;

  SELECT * INTO v_battle FROM public.live_battles WHERE id = _battle_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'battle_not_found';
  END IF;
  IF v_battle.status <> 'live' THEN
    RAISE EXCEPTION 'battle_not_live';
  END IF;
  IF v_battle.is_hidden THEN
    RAISE EXCEPTION 'battle_not_found';
  END IF;

  -- Blocked viewers cannot participate in reactions either.
  IF EXISTS (
    SELECT 1 FROM public.blocks
    WHERE (blocker_id = v_battle.host_id AND blocked_id = v_uid)
       OR (blocker_id = v_battle.opponent_id AND blocked_id = v_uid)
  ) THEN
    RAISE EXCEPTION 'blocked';
  END IF;

  -- 30 emotes / 10s per user — permissive enough for burst taps,
  -- strict enough to stop abuse.
  PERFORM public.enforce_rate_limit('livebattle:emote', 30, 10);
END;
$$;

REVOKE ALL ON FUNCTION public.live_battle_send_emote(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.live_battle_send_emote(uuid, text) TO authenticated;