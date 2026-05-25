
-- Belt-and-braces: even if someone (including service_role via a buggy edge function)
-- attempts to delete a battle or a battle vote, raise. Battles are immutable history.

CREATE OR REPLACE FUNCTION public.prevent_battle_delete()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RAISE EXCEPTION 'battles are immutable history and cannot be deleted';
END;
$$;

CREATE OR REPLACE FUNCTION public.prevent_battle_vote_delete()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RAISE EXCEPTION 'battle votes are immutable history and cannot be deleted';
END;
$$;

DROP TRIGGER IF EXISTS battles_no_delete ON public.battles;
CREATE TRIGGER battles_no_delete
  BEFORE DELETE ON public.battles
  FOR EACH ROW
  EXECUTE FUNCTION public.prevent_battle_delete();

DROP TRIGGER IF EXISTS battle_votes_no_delete ON public.battle_votes;
CREATE TRIGGER battle_votes_no_delete
  BEFORE DELETE ON public.battle_votes
  FOR EACH ROW
  EXECUTE FUNCTION public.prevent_battle_vote_delete();

-- Explicit restrictive RLS DELETE deny on both tables (in addition to the
-- existing default-deny from having no permissive DELETE policy).
DROP POLICY IF EXISTS "battles: no deletes" ON public.battles;
CREATE POLICY "battles: no deletes"
  ON public.battles
  AS RESTRICTIVE
  FOR DELETE
  TO anon, authenticated
  USING (false);

DROP POLICY IF EXISTS "battle_votes: no deletes" ON public.battle_votes;
CREATE POLICY "battle_votes: no deletes"
  ON public.battle_votes
  AS RESTRICTIVE
  FOR DELETE
  TO anon, authenticated
  USING (false);

-- Helpful indexes for the Battles page tabs (Active/Pending/Mine/Past).
CREATE INDEX IF NOT EXISTS idx_battles_status_created
  ON public.battles (status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_battles_challenger
  ON public.battles (challenger_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_battles_opponent
  ON public.battles (opponent_id, created_at DESC);
