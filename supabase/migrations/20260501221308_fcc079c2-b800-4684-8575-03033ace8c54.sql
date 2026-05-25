-- Battle completion trigger: increments battle_wins, recalcs score,
-- and applies a crown-steal bonus when the winner surpasses the regional leader.
CREATE OR REPLACE FUNCTION public.trg_battle_completed()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_winning_post uuid;
  v_winner uuid;
  v_post record;
  v_current_leader_score numeric;
  v_steal_bonus numeric := 25; -- crown-steal extra bonus
BEGIN
  -- Only act when battle just transitioned to completed AND has a winner
  IF NEW.status::text <> 'completed' THEN RETURN NEW; END IF;
  IF NEW.winner_id IS NULL THEN RETURN NEW; END IF;
  IF OLD.status::text = 'completed' AND OLD.winner_id IS NOT DISTINCT FROM NEW.winner_id THEN
    RETURN NEW;
  END IF;

  v_winner := NEW.winner_id;
  v_winning_post := CASE
    WHEN NEW.winner_id = NEW.challenger_id THEN NEW.challenger_post_id
    WHEN NEW.winner_id = NEW.opponent_id THEN NEW.opponent_post_id
    ELSE NULL
  END;

  IF v_winning_post IS NULL THEN RETURN NEW; END IF;

  -- +1 win, then recalc base score (recalc reads battle_wins)
  UPDATE public.posts SET battle_wins = battle_wins + 1 WHERE id = v_winning_post;
  PERFORM public.recalc_post_score(v_winning_post);

  SELECT * INTO v_post FROM public.posts WHERE id = v_winning_post;
  IF NOT FOUND THEN RETURN NEW; END IF;

  -- Crown-steal: if the new score now exceeds the active regional leader's score
  -- in the same category and the leader isn't already this post, apply bonus + refresh.
  SELECT crown_score INTO v_current_leader_score
  FROM public.crowns
  WHERE active = true
    AND category = v_post.category
    AND region_type = 'global'::public.region_type
    AND region_name = 'Global'
  ORDER BY crown_score DESC
  LIMIT 1;

  IF v_current_leader_score IS NOT NULL
     AND v_post.crown_score > v_current_leader_score
     AND NOT EXISTS (
       SELECT 1 FROM public.crowns
       WHERE active = true
         AND category = v_post.category
         AND region_type = 'global'::public.region_type
         AND region_name = 'Global'
         AND post_id = v_winning_post
     )
  THEN
    UPDATE public.posts
       SET crown_score = crown_score + v_steal_bonus
     WHERE id = v_winning_post;
  END IF;

  -- Refresh regional crowns regardless (handles city/state/country/global)
  PERFORM public.refresh_crowns_for_post(v_winning_post);

  -- Notify the winner
  INSERT INTO public.notifications (user_id, type, title, body, payload)
  VALUES (
    v_winner, 'vote', 'Crown Battle won!',
    'Your post earned a battle win bonus.',
    jsonb_build_object('battle_id', NEW.id, 'post_id', v_winning_post, 'bonus', v_steal_bonus)
  );

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS battles_completed_bonus ON public.battles;
CREATE TRIGGER battles_completed_bonus
AFTER UPDATE OF status, winner_id ON public.battles
FOR EACH ROW
EXECUTE FUNCTION public.trg_battle_completed();

-- Enable realtime for votes so feed updates instantly
ALTER TABLE public.votes REPLICA IDENTITY FULL;
ALTER TABLE public.posts REPLICA IDENTITY FULL;

DO $$ BEGIN
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.votes;
  EXCEPTION WHEN duplicate_object THEN NULL; END;
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.posts;
  EXCEPTION WHEN duplicate_object THEN NULL; END;
END $$;