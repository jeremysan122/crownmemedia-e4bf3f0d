-- Enrich battle-completion notification payload with exact formula values
-- so the Crown Stolen banner can show previous/new/leader scores and the
-- precise bonus breakdown (battle win + crown steal).
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
  v_score_before numeric;
  v_score_after_recalc numeric;
  v_score_final numeric;
  v_current_leader_score numeric;
  v_steal_applied boolean := false;
  v_battle_win_bonus numeric := 5;   -- per-win base bonus (matches recalc weight)
  v_steal_bonus numeric := 25;       -- crown-steal extra bonus
BEGIN
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

  -- Capture score before any change
  SELECT crown_score INTO v_score_before FROM public.posts WHERE id = v_winning_post;

  -- +1 win, then recalc base score
  UPDATE public.posts SET battle_wins = battle_wins + 1 WHERE id = v_winning_post;
  PERFORM public.recalc_post_score(v_winning_post);
  SELECT * INTO v_post FROM public.posts WHERE id = v_winning_post;
  IF NOT FOUND THEN RETURN NEW; END IF;
  v_score_after_recalc := v_post.crown_score;

  -- Crown-steal check
  SELECT crown_score INTO v_current_leader_score
  FROM public.crowns
  WHERE active = true
    AND category = v_post.category
    AND region_type = 'global'::public.region_type
    AND region_name = 'Global'
  ORDER BY crown_score DESC
  LIMIT 1;

  IF v_current_leader_score IS NOT NULL
     AND v_score_after_recalc > v_current_leader_score
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
    v_steal_applied := true;
  END IF;

  v_score_final := COALESCE(v_score_after_recalc, 0) + (CASE WHEN v_steal_applied THEN v_steal_bonus ELSE 0 END);

  PERFORM public.refresh_crowns_for_post(v_winning_post);

  -- Notify the winner with the full breakdown
  INSERT INTO public.notifications (user_id, type, title, body, payload)
  VALUES (
    v_winner,
    'vote',
    CASE WHEN v_steal_applied THEN 'Crown stolen!' ELSE 'Crown Battle won!' END,
    CASE WHEN v_steal_applied
      THEN 'You dethroned the regional leader and earned the crown bonus.'
      ELSE 'Your post earned a battle win bonus.'
    END,
    jsonb_build_object(
      'battle_id', NEW.id,
      'post_id', v_winning_post,
      'category', v_post.category,
      'battle_win_bonus', v_battle_win_bonus,
      'crown_steal_bonus', CASE WHEN v_steal_applied THEN v_steal_bonus ELSE 0 END,
      'bonus', v_battle_win_bonus + (CASE WHEN v_steal_applied THEN v_steal_bonus ELSE 0 END),
      'previous_score', v_score_before,
      'score_after_win', v_score_after_recalc,
      'final_score', v_score_final,
      'leader_score', v_current_leader_score,
      'crown_stolen', v_steal_applied
    )
  );

  RETURN NEW;
END;
$$;