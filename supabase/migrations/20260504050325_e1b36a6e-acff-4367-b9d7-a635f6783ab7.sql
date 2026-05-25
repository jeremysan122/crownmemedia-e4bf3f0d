-- 1) Tighten EXECUTE on invite-related SECURITY DEFINER RPCs:
--    revoke from PUBLIC/anon (so unauthenticated calls fail at the API layer),
--    grant only to authenticated users for the user-callable ones.
--    grant_pass_invite_bonus is internal — no user role gets EXECUTE.

REVOKE EXECUTE ON FUNCTION public.get_or_create_my_invite_code()        FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.redeem_invite_code(text)              FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.invite_leaderboard(text, int)         FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.grant_pass_invite_bonus(uuid)         FROM PUBLIC, anon, authenticated;

GRANT  EXECUTE ON FUNCTION public.get_or_create_my_invite_code()        TO authenticated;
GRANT  EXECUTE ON FUNCTION public.redeem_invite_code(text)              TO authenticated;
GRANT  EXECUTE ON FUNCTION public.invite_leaderboard(text, int)         TO authenticated;
-- grant_pass_invite_bonus stays callable only by the postgres/service role
-- (which is what stripe-webhook uses).

-- 2) Extend the leaderboard with a ranking-mode toggle:
--    'friends' (default, current behaviour) or 'rewards' (combined score
--    = signup_shekels + pass_days * 50, per the user's choice).
CREATE OR REPLACE FUNCTION public.invite_leaderboard(
  _scope text DEFAULT 'city',
  _limit int DEFAULT 20,
  _mode text DEFAULT 'friends'
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
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
  IF _scope NOT IN ('city','state','country','global') THEN _scope := 'city'; END IF;
  IF _mode  NOT IN ('friends','rewards')               THEN _mode  := 'friends'; END IF;
  _limit := LEAST(GREATEST(_limit, 1), 50);

  SELECT city, state, country INTO v_city, v_state, v_country
    FROM public.profiles WHERE id = v_uid;

  WITH base AS (
    SELECT r.inviter_id,
           COUNT(*)::int AS friends,
           SUM(CASE WHEN r.signup_rewarded THEN 200 ELSE 0 END)::numeric AS signup_shekels,
           SUM(CASE WHEN r.pass_rewarded THEN 30 ELSE 0 END)::int        AS pass_days
      FROM public.invite_redemptions r
      JOIN public.profiles p ON p.id = r.inviter_id
     WHERE (_scope = 'global')
        OR (_scope = 'country' AND p.country IS NOT DISTINCT FROM v_country)
        OR (_scope = 'state'   AND p.state   IS NOT DISTINCT FROM v_state   AND p.country IS NOT DISTINCT FROM v_country)
        OR (_scope = 'city'    AND p.city    IS NOT DISTINCT FROM v_city    AND p.state   IS NOT DISTINCT FROM v_state)
     GROUP BY r.inviter_id
  ), scored AS (
    SELECT b.*, (b.signup_shekels + b.pass_days * 50)::numeric AS reward_score FROM base b
  ), ranked AS (
    SELECT s.*,
           CASE WHEN _mode = 'rewards'
             THEN RANK() OVER (ORDER BY reward_score DESC, friends DESC)
             ELSE RANK() OVER (ORDER BY friends DESC, signup_shekels DESC, pass_days DESC)
           END AS rnk
      FROM scored s
  )
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
      'rank', r.rnk,
      'user_id', r.inviter_id,
      'username', p.username,
      'profile_photo_url', p.profile_photo_url,
      'friends', r.friends,
      'signup_shekels', r.signup_shekels,
      'pass_days', r.pass_days,
      'reward_score', r.reward_score,
      'is_me', r.inviter_id = v_uid
    ) ORDER BY r.rnk), '[]'::jsonb)
  INTO v_top
  FROM (SELECT * FROM ranked ORDER BY rnk LIMIT _limit) r
  LEFT JOIN public.profiles p ON p.id = r.inviter_id;

  WITH base AS (
    SELECT r.inviter_id, COUNT(*) AS friends,
           SUM(CASE WHEN r.signup_rewarded THEN 200 ELSE 0 END) AS signup_shekels,
           SUM(CASE WHEN r.pass_rewarded THEN 30 ELSE 0 END)    AS pass_days
      FROM public.invite_redemptions r
      JOIN public.profiles p ON p.id = r.inviter_id
     WHERE (_scope = 'global')
        OR (_scope = 'country' AND p.country IS NOT DISTINCT FROM v_country)
        OR (_scope = 'state'   AND p.state   IS NOT DISTINCT FROM v_state   AND p.country IS NOT DISTINCT FROM v_country)
        OR (_scope = 'city'    AND p.city    IS NOT DISTINCT FROM v_city    AND p.state   IS NOT DISTINCT FROM v_state)
     GROUP BY r.inviter_id
  ), scored AS (
    SELECT b.*, (b.signup_shekels + b.pass_days * 50)::numeric AS reward_score FROM base b
  ), ranked AS (
    SELECT s.*,
           CASE WHEN _mode = 'rewards'
             THEN RANK() OVER (ORDER BY reward_score DESC, friends DESC)
             ELSE RANK() OVER (ORDER BY friends DESC, signup_shekels DESC, pass_days DESC)
           END AS rnk
      FROM scored s
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
    'mode',  _mode,
    'region', jsonb_build_object('city', v_city, 'state', v_state, 'country', v_country),
    'top', v_top,
    'me', jsonb_build_object(
      'rank', v_my_rank,
      'friends', COALESCE(v_my_friends,0),
      'signup_shekels', COALESCE(v_my_signup_shekels,0),
      'pass_days', COALESCE(v_my_pass_days,0),
      'reward_score', COALESCE(v_my_signup_shekels,0) + COALESCE(v_my_pass_days,0) * 50
    ),
    'total_inviters', COALESCE(v_total, 0)
  );
END;
$function$;

-- Re-apply EXECUTE grants on the new overload signature
REVOKE EXECUTE ON FUNCTION public.invite_leaderboard(text, int, text) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.invite_leaderboard(text, int, text) TO authenticated;