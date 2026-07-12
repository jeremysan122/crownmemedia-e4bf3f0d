
CREATE OR REPLACE FUNCTION public.royal_wave82a_shield_selftest()
RETURNS TABLE(scenario text, result jsonb, shields_used_after int, boost_created boolean, boost_source text)
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public','auth'
AS $$
DECLARE
  uid uuid := gen_random_uuid();
  _pid uuid := gen_random_uuid();
  grant_id uuid;
  allow_id uuid;
  before_used int;
  after_used int;
  boost_row record;
  status_val text;
  res jsonb;
BEGIN
  INSERT INTO auth.users(id, aud, role, email, instance_id, created_at, updated_at,
    email_confirmed_at, raw_user_meta_data)
  VALUES (uid, 'authenticated','authenticated', 'w82a-'||uid||'@selftest.local',
          '00000000-0000-0000-0000-000000000000', now(), now(), now(),
          jsonb_build_object('policies_accepted', true, 'dob', '1990-01-01',
                             'username', 'w82a_'||replace(uid::text,'-','')));

  INSERT INTO public.royal_pass_subscriptions(user_id, status, current_period_end)
  VALUES (uid, 'active', now() + interval '30 days');

  INSERT INTO public.posts(id, user_id, image_url, category, media_width, media_height,
                           main_category_slug, subcategory_slug)
  VALUES (_pid, uid, 'https://selftest.local/x.jpg', 'overall', 1080, 1080,
          'royal-crowns', 'overall-crown');

  INSERT INTO public.crowns(user_id, post_id, region_type, region_name, category, title, crown_score, active)
  VALUES (uid, _pid, 'city', 'Selftest', 'overall', 'Selftest Crown', 100, true);

  INSERT INTO public.royal_pass_grants(user_id, stripe_event_id, period_start, period_end,
    shields_granted, shekels_granted, boost_tokens_granted, status)
  VALUES (uid, 'evt_w82a_'||uid, now() - interval '1 day', now() + interval '30 days',
          5, 500, 3, 'granted')
  RETURNING id INTO grant_id;

  INSERT INTO public.royal_pass_shield_allowances(user_id, period_start, period_end,
    shields_granted, shields_used, royal_pass_grant_id)
  VALUES (uid, now() - interval '1 day', now() + interval '30 days', 5, 0, grant_id)
  RETURNING id INTO allow_id;

  PERFORM set_config('request.jwt.claims',
                     jsonb_build_object('sub', uid::text, 'role','authenticated')::text, true);
  PERFORM set_config('request.jwt.claim.sub', uid::text, true);

  SELECT shields_used INTO before_used FROM public.royal_pass_shield_allowances WHERE id = allow_id;
  res := public.use_royal_shield(_pid);
  SELECT shields_used INTO after_used FROM public.royal_pass_shield_allowances WHERE id = allow_id;
  SELECT * INTO boost_row FROM public.boosts b
    WHERE b.post_id = _pid AND b.boost_type='crown_shield'
    ORDER BY b.started_at DESC LIMIT 1;
  scenario := 'A_granted'; result := res; shields_used_after := after_used;
  boost_created := (boost_row.id IS NOT NULL AND boost_row.source = 'royal_pass'
                    AND boost_row.expires_at BETWEEN now()+interval '23 hours' AND now()+interval '25 hours');
  boost_source := boost_row.source;
  RETURN NEXT;

  before_used := after_used;
  res := public.use_royal_shield(_pid);
  SELECT shields_used INTO after_used FROM public.royal_pass_shield_allowances WHERE id = allow_id;
  scenario := 'G_already_shielded'; result := res; shields_used_after := after_used;
  boost_created := (after_used = before_used AND res->>'error' = 'already_shielded');
  boost_source := NULL;
  RETURN NEXT;

  UPDATE public.boosts SET active=false, expires_at = now() - interval '1 second'
   WHERE user_id = uid AND boost_type='crown_shield';

  FOR status_val IN SELECT unnest(ARRAY['disputed','funds_withdrawn','reversed','refunded'])
  LOOP
    UPDATE public.royal_pass_grants SET status = status_val WHERE id = grant_id;
    before_used := after_used;
    res := public.use_royal_shield(_pid);
    SELECT shields_used INTO after_used FROM public.royal_pass_shield_allowances WHERE id = allow_id;
    scenario := 'BCDE_'|| status_val;
    result := res;
    shields_used_after := after_used;
    boost_created := (after_used = before_used
                      AND res->>'error' = 'royal_benefits_temporarily_suspended');
    boost_source := NULL;
    RETURN NEXT;
  END LOOP;

  UPDATE public.royal_pass_grants SET status='granted' WHERE id = grant_id;
  ALTER TABLE public.royal_pass_shield_allowances ALTER COLUMN royal_pass_grant_id DROP NOT NULL;
  UPDATE public.royal_pass_shield_allowances SET royal_pass_grant_id = NULL WHERE id = allow_id;
  before_used := after_used;
  res := public.use_royal_shield(_pid);
  SELECT shields_used INTO after_used FROM public.royal_pass_shield_allowances WHERE id = allow_id;
  scenario := 'F_orphan_link'; result := res; shields_used_after := after_used;
  boost_created := (after_used = before_used AND res->>'error' = 'royal_allowance_not_linked');
  boost_source := NULL;
  RETURN NEXT;

  UPDATE public.royal_pass_shield_allowances SET royal_pass_grant_id = grant_id WHERE id = allow_id;
  ALTER TABLE public.royal_pass_shield_allowances ALTER COLUMN royal_pass_grant_id SET NOT NULL;

  PERFORM set_config('request.jwt.claims', NULL, true);
  PERFORM set_config('request.jwt.claim.sub', NULL, true);
  PERFORM set_config('session_replication_role', 'replica', true);
  DELETE FROM public.boosts WHERE user_id = uid;
  DELETE FROM public.crowns WHERE user_id = uid;
  DELETE FROM public.royal_pass_shield_allowances WHERE user_id = uid;
  DELETE FROM public.royal_pass_grants WHERE user_id = uid;
  DELETE FROM public.royal_pass_subscriptions WHERE user_id = uid;
  DELETE FROM public.posts WHERE user_id = uid;
  DELETE FROM public.profiles WHERE id = uid;
  DELETE FROM auth.users WHERE id = uid;
  PERFORM set_config('session_replication_role', 'origin', true);
END; $$;
