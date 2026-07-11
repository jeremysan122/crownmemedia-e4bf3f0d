
CREATE OR REPLACE FUNCTION public.run_crown_score_guard_selftest()
RETURNS TABLE(check_name text, result text, detail text)
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE
  test_user uuid; fake_normal_uid uuid := gen_random_uuid();
  before_score int; after_score int; tmp_post_id uuid; has_priv boolean;
  v_main text; v_sub text;
BEGIN
  SELECT p.id INTO test_user FROM public.profiles p
  WHERE NOT EXISTS (SELECT 1 FROM public.user_roles ur
    WHERE ur.user_id=p.id AND ur.role IN ('admin','super_admin','moderator','content_admin','support_admin'))
  LIMIT 1;
  IF test_user IS NULL THEN RETURN QUERY SELECT 'setup'::text,'fail'::text,'no user'::text; RETURN; END IF;

  SELECT mc.slug, s.slug INTO v_main, v_sub
  FROM public.subcategories s JOIN public.main_categories mc ON mc.id=s.main_category_id LIMIT 1;

  SELECT crown_score INTO before_score FROM public.profiles WHERE id=test_user;

  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', fake_normal_uid::text,'role','authenticated')::text, true);
  PERFORM set_config('request.jwt.claim.role','authenticated', true);
  PERFORM set_config('request.jwt.claim.sub', fake_normal_uid::text, true);
  PERFORM set_config('app.allow_crown_score_sync','false', true);

  UPDATE public.profiles SET crown_score=999999 WHERE id=test_user;
  SELECT crown_score INTO after_score FROM public.profiles WHERE id=test_user;
  RETURN QUERY SELECT 'normal_user_profile_edit_blocked'::text,
    CASE WHEN after_score=before_score THEN 'pass' ELSE 'fail' END,
    format('before=%s after=%s', before_score, after_score);

  PERFORM set_config('app.allow_crown_score_sync','true', true);
  UPDATE public.profiles SET crown_score=before_score+123 WHERE id=test_user;
  SELECT crown_score INTO after_score FROM public.profiles WHERE id=test_user;
  RETURN QUERY SELECT 'internal_sync_flag_allows_update'::text,
    CASE WHEN after_score=before_score+123 THEN 'pass' ELSE 'fail' END,
    format('expected=%s got=%s', before_score+123, after_score);
  UPDATE public.profiles SET crown_score=before_score WHERE id=test_user;
  PERFORM set_config('app.allow_crown_score_sync','false', true);

  INSERT INTO public.posts (user_id, crown_score, media_type, media_width, media_height,
                            main_category_slug, subcategory_slug, image_url)
  VALUES (test_user, 25, 'image', 1080, 1080, v_main, v_sub, 'https://example.invalid/selftest.jpg')
  RETURNING id INTO tmp_post_id;
  SELECT crown_score INTO after_score FROM public.profiles WHERE id=test_user;
  RETURN QUERY SELECT 'post_insert_updates_profile_crown_score'::text,
    CASE WHEN after_score=before_score+25 THEN 'pass' ELSE 'fail' END,
    format('expected=%s got=%s', before_score+25, after_score);

  UPDATE public.posts SET crown_score=40 WHERE id=tmp_post_id;
  SELECT crown_score INTO after_score FROM public.profiles WHERE id=test_user;
  RETURN QUERY SELECT 'post_update_recalculates_profile_crown_score'::text,
    CASE WHEN after_score=before_score+40 THEN 'pass' ELSE 'fail' END,
    format('expected=%s got=%s', before_score+40, after_score);

  DELETE FROM public.posts WHERE id=tmp_post_id;
  SELECT crown_score INTO after_score FROM public.profiles WHERE id=test_user;
  RETURN QUERY SELECT 'post_delete_reverts_profile_crown_score'::text,
    CASE WHEN after_score=before_score THEN 'pass' ELSE 'fail' END,
    format('expected=%s got=%s', before_score, after_score);

  SELECT has_column_privilege('authenticated','public.posts','crown_score','UPDATE') INTO has_priv;
  RETURN QUERY SELECT 'normal_user_cannot_update_post_crown_score'::text,
    CASE WHEN has_priv=false THEN 'pass' ELSE 'fail' END,
    format('has_column_privilege=%s', has_priv);

  PERFORM set_config('app.allow_crown_score_sync','false', true);
  PERFORM set_config('request.jwt.claim.role','service_role', true);
  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', fake_normal_uid::text,'role','service_role')::text, true);
  UPDATE public.profiles SET crown_score=before_score+7 WHERE id=test_user;
  SELECT crown_score INTO after_score FROM public.profiles WHERE id=test_user;
  RETURN QUERY SELECT 'service_or_admin_path_allowed'::text,
    CASE WHEN after_score=before_score+7 THEN 'pass' ELSE 'fail' END,
    format('expected=%s got=%s', before_score+7, after_score);

  PERFORM set_config('app.allow_crown_score_sync','true', true);
  UPDATE public.profiles SET crown_score=before_score WHERE id=test_user;
END; $$;
