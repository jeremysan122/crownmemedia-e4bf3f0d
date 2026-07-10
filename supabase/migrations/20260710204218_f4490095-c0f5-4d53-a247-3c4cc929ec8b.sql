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
  v_flag boolean;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;

  SELECT public.is_feature_enabled('live_battles_enabled') INTO v_flag;
  IF NOT COALESCE(v_flag, false) THEN
    RAISE EXCEPTION 'feature_disabled';
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

  IF EXISTS (
    SELECT 1 FROM public.blocks
    WHERE (blocker_id = v_battle.host_id AND blocked_id = v_uid)
       OR (blocker_id = v_battle.opponent_id AND blocked_id = v_uid)
  ) THEN
    RAISE EXCEPTION 'blocked';
  END IF;

  PERFORM public.enforce_rate_limit('livebattle:emote', 30, 10);
END;
$$;

REVOKE ALL ON FUNCTION public.live_battle_send_emote(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.live_battle_send_emote(uuid, text) TO authenticated;