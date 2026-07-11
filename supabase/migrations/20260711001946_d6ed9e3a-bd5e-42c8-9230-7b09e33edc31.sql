
CREATE OR REPLACE FUNCTION public.get_live_battle_highlight(_battle_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _b RECORD;
  _host jsonb;
  _opp jsonb;
  _top_gifters jsonb;
  _host_gift_total bigint;
  _opp_gift_total bigint;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;

  SELECT id, host_id, opponent_id, host_votes, opponent_votes, winner_id,
         status, category_slug, region, peak_viewers, ends_at
    INTO _b FROM public.live_battles WHERE id = _battle_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'battle_not_found'; END IF;

  SELECT jsonb_build_object(
           'id', id, 'username', username,
           'display_name', NULLIF(TRIM(COALESCE(first_name,'') || ' ' || COALESCE(last_name,'')), ''),
           'avatar_url', profile_photo_url)
    INTO _host FROM public.profiles WHERE id = _b.host_id;
  SELECT jsonb_build_object(
           'id', id, 'username', username,
           'display_name', NULLIF(TRIM(COALESCE(first_name,'') || ' ' || COALESCE(last_name,'')), ''),
           'avatar_url', profile_photo_url)
    INTO _opp FROM public.profiles WHERE id = _b.opponent_id;

  SELECT COALESCE(SUM(total_shekels) FILTER (WHERE recipient_id = _b.host_id), 0),
         COALESCE(SUM(total_shekels) FILTER (WHERE recipient_id = _b.opponent_id), 0)
    INTO _host_gift_total, _opp_gift_total
    FROM public.live_battle_gifts WHERE battle_id = _battle_id;

  SELECT COALESCE(jsonb_agg(row_to_json(t)), '[]'::jsonb) INTO _top_gifters
    FROM (
      SELECT g.sender_id, p.username,
             NULLIF(TRIM(COALESCE(p.first_name,'') || ' ' || COALESCE(p.last_name,'')), '') AS display_name,
             p.profile_photo_url AS avatar_url,
             SUM(g.total_shekels)::bigint AS shekels
        FROM public.live_battle_gifts g
        JOIN public.profiles p ON p.id = g.sender_id
       WHERE g.battle_id = _battle_id
       GROUP BY g.sender_id, p.username, p.first_name, p.last_name, p.profile_photo_url
       ORDER BY shekels DESC
       LIMIT 3
    ) t;

  RETURN jsonb_build_object(
    'battle_id', _b.id,
    'host', _host, 'opponent', _opp,
    'host_votes', _b.host_votes, 'opponent_votes', _b.opponent_votes,
    'winner_id', _b.winner_id, 'status', _b.status,
    'category', _b.category_slug, 'region', _b.region,
    'peak_viewers', _b.peak_viewers, 'ended_at', _b.ends_at,
    'host_gift_shekels', _host_gift_total,
    'opponent_gift_shekels', _opp_gift_total,
    'top_gifters', _top_gifters
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.get_battler_battle_analytics(_user_id uuid, _limit integer DEFAULT 25)
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _rows jsonb;
  _agg jsonb;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;
  IF auth.uid() <> _user_id
     AND NOT public.has_role(auth.uid(), 'admin')
     AND NOT public.has_role(auth.uid(), 'moderator')
  THEN RAISE EXCEPTION 'not_authorized'; END IF;

  IF _limit IS NULL OR _limit < 1 THEN _limit := 25; END IF;
  IF _limit > 100 THEN _limit := 100; END IF;

  SELECT COALESCE(jsonb_agg(row_to_json(r) ORDER BY r.ended_at DESC), '[]'::jsonb)
    INTO _rows FROM (
    SELECT
      b.id AS battle_id,
      b.ends_at AS ended_at,
      b.category_slug,
      b.region,
      b.peak_viewers,
      b.host_id = _user_id AS was_host,
      CASE WHEN b.host_id = _user_id THEN b.host_votes ELSE b.opponent_votes END AS my_votes,
      CASE WHEN b.host_id = _user_id THEN b.opponent_votes ELSE b.host_votes END AS their_votes,
      (b.winner_id IS NOT NULL AND b.winner_id = _user_id) AS won,
      COALESCE((
        SELECT SUM(total_shekels) FROM public.live_battle_gifts
         WHERE battle_id = b.id AND recipient_id = _user_id
      ), 0)::bigint AS gift_shekels,
      (
        SELECT jsonb_build_object(
          'sender_id', s.sender_id, 'username', p.username,
          'display_name', NULLIF(TRIM(COALESCE(p.first_name,'') || ' ' || COALESCE(p.last_name,'')), ''),
          'avatar_url', p.profile_photo_url,
          'shekels', s.shekels
        )
        FROM (
          SELECT sender_id, SUM(total_shekels)::bigint AS shekels
            FROM public.live_battle_gifts
           WHERE battle_id = b.id AND recipient_id = _user_id
           GROUP BY sender_id
           ORDER BY shekels DESC LIMIT 1
        ) s JOIN public.profiles p ON p.id = s.sender_id
      ) AS top_supporter
    FROM public.live_battles b
    WHERE b.status = 'ended'
      AND (b.host_id = _user_id OR b.opponent_id = _user_id)
    ORDER BY b.ends_at DESC NULLS LAST
    LIMIT _limit
  ) r;

  SELECT jsonb_build_object(
    'battles', COUNT(*),
    'wins', COUNT(*) FILTER (WHERE (b.won)),
    'total_votes', COALESCE(SUM((b.my_votes)::int), 0),
    'total_gift_shekels', COALESCE(SUM((b.gift_shekels)::bigint), 0),
    'peak_viewers_max', COALESCE(MAX((b.peak_viewers)::int), 0)
  ) INTO _agg FROM jsonb_to_recordset(_rows) AS b(
    won boolean, my_votes int, gift_shekels bigint, peak_viewers int
  );

  RETURN jsonb_build_object('summary', _agg, 'battles', _rows);
END;
$$;

CREATE OR REPLACE FUNCTION public.get_live_battle_vote_timeline(_battle_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _b RECORD;
  _result jsonb;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;

  SELECT id, host_id, opponent_id
    INTO _b FROM public.live_battles WHERE id = _battle_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'battle_not_found'; END IF;

  SELECT COALESCE(jsonb_agg(row_to_json(t) ORDER BY t.bucket), '[]'::jsonb)
    INTO _result
    FROM (
      SELECT
        bucket,
        host_votes,
        opponent_votes,
        SUM(host_votes) OVER (ORDER BY bucket) AS host_cumulative,
        SUM(opponent_votes) OVER (ORDER BY bucket) AS opponent_cumulative
      FROM (
        SELECT
          date_trunc('minute', created_at) AS bucket,
          COUNT(*) FILTER (WHERE choice = 'host')::int AS host_votes,
          COUNT(*) FILTER (WHERE choice = 'opponent')::int AS opponent_votes
        FROM public.live_battle_votes
        WHERE battle_id = _battle_id
        GROUP BY 1
      ) g
    ) t;

  RETURN _result;
END;
$$;
