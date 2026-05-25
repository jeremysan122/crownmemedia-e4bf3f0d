-- Invite leaderboard RPC: returns top inviters in the caller's city/state/country plus caller's rank
CREATE OR REPLACE FUNCTION public.invite_leaderboard(_scope text DEFAULT 'city', _limit int DEFAULT 20)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_city text;
  v_state text;
  v_country text;
  v_top jsonb;
  v_my_rank int;
  v_total int;
  v_my_friends int;
  v_my_signup_shekels numeric;
  v_my_pass_days int;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF _scope NOT IN ('city','state','country','global') THEN
    _scope := 'city';
  END IF;
  _limit := LEAST(GREATEST(_limit, 1), 50);

  SELECT city, state, country INTO v_city, v_state, v_country
    FROM public.profiles WHERE id = v_uid;

  -- Build aggregated stats per inviter, scoped by region
  WITH base AS (
    SELECT r.inviter_id,
           COUNT(*)::int AS friends,
           SUM(CASE WHEN r.signup_rewarded THEN 200 ELSE 0 END)::numeric AS signup_shekels,
           SUM(CASE WHEN r.pass_rewarded THEN 30 ELSE 0 END)::int AS pass_days
      FROM public.invite_redemptions r
      JOIN public.profiles p ON p.id = r.inviter_id
     WHERE (_scope = 'global')
        OR (_scope = 'country' AND p.country IS NOT DISTINCT FROM v_country)
        OR (_scope = 'state'   AND p.state   IS NOT DISTINCT FROM v_state   AND p.country IS NOT DISTINCT FROM v_country)
        OR (_scope = 'city'    AND p.city    IS NOT DISTINCT FROM v_city    AND p.state   IS NOT DISTINCT FROM v_state)
     GROUP BY r.inviter_id
  ), ranked AS (
    SELECT b.*, RANK() OVER (ORDER BY friends DESC, signup_shekels DESC, pass_days DESC) AS rnk
      FROM base b
  )
  SELECT
    COALESCE(jsonb_agg(jsonb_build_object(
      'rank', r.rnk,
      'user_id', r.inviter_id,
      'username', p.username,
      'profile_photo_url', p.profile_photo_url,
      'friends', r.friends,
      'signup_shekels', r.signup_shekels,
      'pass_days', r.pass_days,
      'is_me', r.inviter_id = v_uid
    ) ORDER BY r.rnk), '[]'::jsonb)
  INTO v_top
  FROM (SELECT * FROM ranked ORDER BY rnk LIMIT _limit) r
  LEFT JOIN public.profiles p ON p.id = r.inviter_id;

  -- Compute my rank within the same scope
  WITH base AS (
    SELECT r.inviter_id, COUNT(*) AS friends,
           SUM(CASE WHEN r.signup_rewarded THEN 200 ELSE 0 END) AS signup_shekels,
           SUM(CASE WHEN r.pass_rewarded THEN 30 ELSE 0 END) AS pass_days
      FROM public.invite_redemptions r
      JOIN public.profiles p ON p.id = r.inviter_id
     WHERE (_scope = 'global')
        OR (_scope = 'country' AND p.country IS NOT DISTINCT FROM v_country)
        OR (_scope = 'state'   AND p.state   IS NOT DISTINCT FROM v_state   AND p.country IS NOT DISTINCT FROM v_country)
        OR (_scope = 'city'    AND p.city    IS NOT DISTINCT FROM v_city    AND p.state   IS NOT DISTINCT FROM v_state)
     GROUP BY r.inviter_id
  ), ranked AS (
    SELECT inviter_id, friends, signup_shekels, pass_days,
           RANK() OVER (ORDER BY friends DESC, signup_shekels DESC, pass_days DESC) AS rnk
      FROM base
  )
  SELECT rnk, friends, signup_shekels, pass_days
    INTO v_my_rank, v_my_friends, v_my_signup_shekels, v_my_pass_days
    FROM ranked WHERE inviter_id = v_uid;

  SELECT COUNT(*) INTO v_total FROM (
    SELECT 1
      FROM public.invite_redemptions r
      JOIN public.profiles p ON p.id = r.inviter_id
     WHERE (_scope = 'global')
        OR (_scope = 'country' AND p.country IS NOT DISTINCT FROM v_country)
        OR (_scope = 'state'   AND p.state   IS NOT DISTINCT FROM v_state   AND p.country IS NOT DISTINCT FROM v_country)
        OR (_scope = 'city'    AND p.city    IS NOT DISTINCT FROM v_city    AND p.state   IS NOT DISTINCT FROM v_state)
     GROUP BY r.inviter_id
  ) s;

  RETURN jsonb_build_object(
    'scope', _scope,
    'region', jsonb_build_object('city', v_city, 'state', v_state, 'country', v_country),
    'top', v_top,
    'me', jsonb_build_object(
      'rank', v_my_rank,
      'friends', COALESCE(v_my_friends,0),
      'signup_shekels', COALESCE(v_my_signup_shekels,0),
      'pass_days', COALESCE(v_my_pass_days,0)
    ),
    'total_inviters', COALESCE(v_total, 0)
  );
END;
$$;

REVOKE ALL ON FUNCTION public.invite_leaderboard(text,int) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.invite_leaderboard(text,int) TO authenticated;