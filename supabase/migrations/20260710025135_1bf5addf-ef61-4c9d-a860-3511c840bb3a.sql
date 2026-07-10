-- 1. Allow multiple live-battle votes per viewer.
ALTER TABLE public.live_battle_votes DROP CONSTRAINT IF EXISTS live_battle_votes_pkey;
ALTER TABLE public.live_battle_votes
  ADD COLUMN IF NOT EXISTS id uuid NOT NULL DEFAULT gen_random_uuid();
ALTER TABLE public.live_battle_votes ADD PRIMARY KEY (id);
CREATE INDEX IF NOT EXISTS idx_lbv_battle_created
  ON public.live_battle_votes(battle_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_lbv_viewer
  ON public.live_battle_votes(viewer_id);

-- 2. Drop the "already voted" guard from live_battle_vote.
CREATE OR REPLACE FUNCTION public.live_battle_vote(_battle_id uuid, _choice text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
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
  IF b.ends_at IS NOT NULL AND now() > b.ends_at THEN RAISE EXCEPTION 'battle_not_live'; END IF;
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
