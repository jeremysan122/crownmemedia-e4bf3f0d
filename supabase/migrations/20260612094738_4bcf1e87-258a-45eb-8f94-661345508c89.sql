CREATE OR REPLACE FUNCTION public.verification_eligibility_progress(_user_id uuid DEFAULT auth.uid())
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _row record;
  _posts_count int;
  _battles_won int;
  _crowns_held int;
  _votes_received bigint;
  _severe_strikes int;
  _email_confirmed boolean;
  _phone_confirmed boolean;
  _phone_required boolean;
  _account_age_days int;
  _required_followers int := 10000;
  _required_posts int := 25;
  _required_age_days int := 30;
  _required_battles int := 25;
  _required_crowns int := 10;
  _required_votes bigint := 50000;
  _checks jsonb;
  _all_pass boolean;
BEGIN
  IF _user_id IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;
  IF auth.uid() IS DISTINCT FROM _user_id THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  SELECT id, username, bio, profile_photo_url, followers_count,
         created_at, verified, is_banned, is_suspended
    INTO _row
    FROM public.profiles
   WHERE id = _user_id;

  IF _row.id IS NULL THEN
    RAISE EXCEPTION 'profile_not_found';
  END IF;

  -- Posts / Scrolls published.
  SELECT count(*)::int INTO _posts_count
    FROM public.posts
   WHERE user_id = _user_id
     AND COALESCE(publish_status, 'approved') = 'approved'
     AND COALESCE(is_removed, false) = false
     AND COALESCE(is_archived, false) = false;

  -- Battles won (decided battles where winner is the user).
  SELECT count(*)::int INTO _battles_won
    FROM public.battles
   WHERE winner_id = _user_id;

  -- Crowns currently held (active crowns).
  SELECT count(*)::int INTO _crowns_held
    FROM public.crowns
   WHERE user_id = _user_id
     AND COALESCE(active, true) = true;

  -- Total votes received across the user's published posts.
  SELECT COALESCE(sum(COALESCE(vote_count, 0)), 0)::bigint INTO _votes_received
    FROM public.posts
   WHERE user_id = _user_id
     AND COALESCE(is_removed, false) = false;

  -- Severe strikes active in the last 90 days.
  SELECT count(*)::int INTO _severe_strikes
    FROM public.user_strikes
   WHERE user_id = _user_id
     AND severity IN ('severe','critical','high')
     AND created_at > now() - interval '90 days'
     AND (expires_at IS NULL OR expires_at > now());

  -- Email / phone confirmation (read from auth.users).
  SELECT
    (email_confirmed_at IS NOT NULL),
    (phone_confirmed_at IS NOT NULL)
    INTO _email_confirmed, _phone_confirmed
    FROM auth.users
   WHERE id = _user_id;

  -- Phone check is only enforced when the platform has it enabled.
  SELECT COALESCE(
    (SELECT (value::text)::boolean FROM public.platform_settings
       WHERE key = 'phone_verification_enabled' LIMIT 1),
    false
  ) INTO _phone_required;

  _account_age_days := GREATEST(0, EXTRACT(DAY FROM (now() - _row.created_at))::int);

  _checks := jsonb_build_object(
    'followers', jsonb_build_object(
      'pass', COALESCE(_row.followers_count, 0) >= _required_followers,
      'current', COALESCE(_row.followers_count, 0),
      'required', _required_followers,
      'label', 'At least 10,000 CrownMe followers'
    ),
    'profile_photo', jsonb_build_object(
      'pass', _row.profile_photo_url IS NOT NULL AND length(_row.profile_photo_url) > 0,
      'label', 'Profile photo uploaded'
    ),
    'bio', jsonb_build_object(
      'pass', _row.bio IS NOT NULL AND length(btrim(_row.bio)) >= 20,
      'label', 'Bio is at least 20 characters'
    ),
    'account_age', jsonb_build_object(
      'pass', _account_age_days >= _required_age_days,
      'current', _account_age_days,
      'required', _required_age_days,
      'label', 'Account at least 30 days old'
    ),
    'posts', jsonb_build_object(
      'pass', _posts_count >= _required_posts,
      'current', _posts_count,
      'required', _required_posts,
      'label', 'At least 25 published posts or scrolls'
    ),
    'battles_won', jsonb_build_object(
      'pass', _battles_won >= _required_battles,
      'current', _battles_won,
      'required', _required_battles,
      'label', 'At least 25 Crown Battles won'
    ),
    'crowns_held', jsonb_build_object(
      'pass', _crowns_held >= _required_crowns,
      'current', _crowns_held,
      'required', _required_crowns,
      'label', 'At least 10 Crowns earned'
    ),
    'votes_received', jsonb_build_object(
      'pass', _votes_received >= _required_votes,
      'current', _votes_received,
      'required', _required_votes,
      'label', 'At least 50,000 total votes received'
    ),
    'good_standing', jsonb_build_object(
      'pass', NOT COALESCE(_row.is_banned, false) AND NOT COALESCE(_row.is_suspended, false),
      'label', 'Account in good standing'
    ),
    'no_serious_violations', jsonb_build_object(
      'pass', _severe_strikes = 0,
      'label', 'No serious recent violations'
    ),
    'email_verified', jsonb_build_object(
      'pass', COALESCE(_email_confirmed, false),
      'label', 'Email verified'
    )
  );

  IF _phone_required THEN
    _checks := _checks || jsonb_build_object(
      'phone_verified', jsonb_build_object(
        'pass', COALESCE(_phone_confirmed, false),
        'label', 'Phone verified'
      )
    );
  END IF;

  SELECT bool_and((value->>'pass')::boolean) INTO _all_pass
    FROM jsonb_each(_checks);

  RETURN jsonb_build_object(
    'verified', COALESCE(_row.verified, false),
    'eligible', COALESCE(_all_pass, false),
    'checks', _checks
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.verification_eligibility_progress(uuid) TO authenticated;