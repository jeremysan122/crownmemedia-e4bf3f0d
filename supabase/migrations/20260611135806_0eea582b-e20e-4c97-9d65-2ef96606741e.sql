CREATE OR REPLACE FUNCTION public.get_battle_official_result(_battle_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  b RECORD;
  c_ok boolean;
  o_ok boolean;
  ended boolean;
  c_votes int;
  o_votes int;
  winner uuid;
  loser uuid;
  result_kind text;
BEGIN
  SELECT id, status, ends_at, challenger_id, opponent_id,
         challenger_votes, opponent_votes, winner_id
    INTO b
    FROM public.battles
   WHERE id = _battle_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('kind','none','reason','not_found');
  END IF;

  ended := b.status IN ('completed','declined','cancelled')
        OR (b.status = 'active' AND b.ends_at IS NOT NULL AND b.ends_at <= now());

  IF NOT ended THEN
    RETURN jsonb_build_object('kind','pending');
  END IF;

  -- A participant is "usable" if their profile is not banned/suspended.
  -- Profiles with the row missing are treated as unusable (deleted account).
  SELECT EXISTS(
    SELECT 1 FROM public.profiles p
     WHERE p.id = b.challenger_id
       AND COALESCE(p.is_banned,false) = false
       AND COALESCE(p.is_suspended,false) = false
  ) INTO c_ok;

  SELECT EXISTS(
    SELECT 1 FROM public.profiles p
     WHERE p.id = b.opponent_id
       AND COALESCE(p.is_banned,false) = false
       AND COALESCE(p.is_suspended,false) = false
  ) INTO o_ok;

  -- Recount from the authoritative votes table so a tampered counter
  -- in `battles` cannot produce a fake winner.
  SELECT COUNT(*)::int INTO c_votes FROM public.battle_votes
   WHERE battle_id = b.id AND voted_for_user_id = b.challenger_id;
  SELECT COUNT(*)::int INTO o_votes FROM public.battle_votes
   WHERE battle_id = b.id AND voted_for_user_id = b.opponent_id;

  IF NOT c_ok AND NOT o_ok THEN
    RETURN jsonb_build_object('kind','none','reason','participants_unavailable');
  END IF;

  IF c_ok AND NOT o_ok THEN
    IF c_votes > 0 THEN
      RETURN jsonb_build_object(
        'kind','winner','winner_id', b.challenger_id,
        'winner_votes', c_votes, 'loser_votes', o_votes
      );
    END IF;
    RETURN jsonb_build_object('kind','none','reason','no_eligible_votes');
  END IF;

  IF o_ok AND NOT c_ok THEN
    IF o_votes > 0 THEN
      RETURN jsonb_build_object(
        'kind','winner','winner_id', b.opponent_id,
        'winner_votes', o_votes, 'loser_votes', c_votes
      );
    END IF;
    RETURN jsonb_build_object('kind','none','reason','no_eligible_votes');
  END IF;

  IF c_votes = 0 AND o_votes = 0 THEN
    RETURN jsonb_build_object('kind','none','reason','no_votes');
  END IF;

  IF c_votes = o_votes THEN
    RETURN jsonb_build_object('kind','tie','votes', c_votes);
  END IF;

  IF c_votes > o_votes THEN
    winner := b.challenger_id; loser := b.opponent_id;
    RETURN jsonb_build_object(
      'kind','winner','winner_id', winner,
      'winner_votes', c_votes, 'loser_votes', o_votes
    );
  ELSE
    winner := b.opponent_id; loser := b.challenger_id;
    RETURN jsonb_build_object(
      'kind','winner','winner_id', winner,
      'winner_votes', o_votes, 'loser_votes', c_votes
    );
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.get_battle_official_result(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_battle_official_result(uuid) TO authenticated, anon;
COMMENT ON FUNCTION public.get_battle_official_result(uuid) IS
  'Authoritative ended-battle winner. Recounts votes from battle_votes and excludes banned/suspended/deleted participants so unsafe users can never be displayed as the crown holder.';