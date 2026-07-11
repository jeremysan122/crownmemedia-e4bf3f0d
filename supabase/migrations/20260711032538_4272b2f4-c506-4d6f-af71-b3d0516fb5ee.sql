
CREATE OR REPLACE FUNCTION public.run_crown_score_guard_selftest()
RETURNS TABLE(check_name text, result text, detail text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  test_user uuid;
  before_score int;
  after_score int;
  tmp_post_id uuid;
  has_priv boolean;
BEGIN
  -- Pick a normal user (no admin/moderator roles)
  SELECT p.id INTO test_user
  FROM public.profiles p
  WHERE NOT EXISTS (
    SELECT 1 FROM public.user_roles ur
    WHERE ur.user_id = p.id AND ur.role IN ('admin','super_admin','moderator','content_admin','support_admin')
  )
  LIMIT 1;

  IF test_user IS NULL THEN
    RETURN QUERY SELECT 'setup'::text, 'fail'::text, 'no normal user found'::text;
    RETURN;
  END IF;

  SELECT crown_score INTO before_score FROM public.profiles WHERE id = test_user;

  ----------------------------------------------------------------------
  -- 1. Normal user cannot self-edit profiles.crown_score
  ----------------------------------------------------------------------
  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', test_user::text, 'role', 'authenticated')::text, true);
  PERFORM set_config('request.jwt.claim.role', 'authenticated', true);
  PERFORM set_config('request.jwt.claim.sub', test_user::text, true);
  -- Ensure sync flag is off
  PERFORM set_config('app.allow_crown_score_sync', 'false', true);

  UPDATE public.profiles SET crown_score = 999999 WHERE id = test_user;
  SELECT crown_score INTO after_score FROM public.profiles WHERE id = test_user;

  RETURN QUERY SELECT
    'normal_user_profile_edit_blocked'::text,
    CASE WHEN after_score = before_score THEN 'pass' ELSE 'fail' END,
    format('before=%s after=%s', before_score, after_score);

  ----------------------------------------------------------------------
  -- 2. Internal sync flag allows update
  ----------------------------------------------------------------------
  PERFORM set_config('app.allow_crown_score_sync', 'true', true);
  UPDATE public.profiles SET crown_score = before_score + 123 WHERE id = test_user;
  SELECT crown_score INTO after_score FROM public.profiles WHERE id = test_user;

  RETURN QUERY SELECT
    'internal_sync_flag_allows_update'::text,
    CASE WHEN after_score = before_score + 123 THEN 'pass' ELSE 'fail' END,
    format('expected=%s got=%s', before_score + 123, after_score);

  -- restore
  UPDATE public.profiles SET crown_score = before_score WHERE id = test_user;
  PERFORM set_config('app.allow_crown_score_sync', 'false', true);

  ----------------------------------------------------------------------
  -- 3. Posts trigger end-to-end
  ----------------------------------------------------------------------
  -- INSERT post crown_score = 25
  INSERT INTO public.posts (user_id, crown_score, media_type)
  VALUES (test_user, 25, 'image')
  RETURNING id INTO tmp_post_id;

  SELECT crown_score INTO after_score FROM public.profiles WHERE id = test_user;
  RETURN QUERY SELECT
    'post_insert_updates_profile_crown_score'::text,
    CASE WHEN after_score = before_score + 25 THEN 'pass' ELSE 'fail' END,
    format('expected=%s got=%s', before_score + 25, after_score);

  -- UPDATE post crown_score 25 → 40 (+15)
  UPDATE public.posts SET crown_score = 40 WHERE id = tmp_post_id;
  SELECT crown_score INTO after_score FROM public.profiles WHERE id = test_user;
  RETURN QUERY SELECT
    'post_update_recalculates_profile_crown_score'::text,
    CASE WHEN after_score = before_score + 40 THEN 'pass' ELSE 'fail' END,
    format('expected=%s got=%s', before_score + 40, after_score);

  -- DELETE post → back to original
  DELETE FROM public.posts WHERE id = tmp_post_id;
  SELECT crown_score INTO after_score FROM public.profiles WHERE id = test_user;
  RETURN QUERY SELECT
    'post_delete_reverts_profile_crown_score'::text,
    CASE WHEN after_score = before_score THEN 'pass' ELSE 'fail' END,
    format('expected=%s got=%s', before_score, after_score);

  ----------------------------------------------------------------------
  -- 4. authenticated role has no UPDATE privilege on posts.crown_score
  ----------------------------------------------------------------------
  SELECT has_column_privilege('authenticated', 'public.posts', 'crown_score', 'UPDATE')
    INTO has_priv;
  RETURN QUERY SELECT
    'normal_user_cannot_update_post_crown_score'::text,
    CASE WHEN has_priv = false THEN 'pass' ELSE 'fail' END,
    format('has_column_privilege(authenticated, posts.crown_score, UPDATE)=%s', has_priv);

  ----------------------------------------------------------------------
  -- 5. Service role path allowed
  ----------------------------------------------------------------------
  PERFORM set_config('app.allow_crown_score_sync', 'false', true);
  PERFORM set_config('request.jwt.claim.role', 'service_role', true);
  PERFORM set_config('request.jwt.claims',
    json_build_object('role','service_role')::text, true);

  UPDATE public.profiles SET crown_score = before_score + 7 WHERE id = test_user;
  SELECT crown_score INTO after_score FROM public.profiles WHERE id = test_user;
  RETURN QUERY SELECT
    'service_or_admin_path_allowed'::text,
    CASE WHEN after_score = before_score + 7 THEN 'pass' ELSE 'fail' END,
    format('expected=%s got=%s', before_score + 7, after_score);

  -- restore
  PERFORM set_config('app.allow_crown_score_sync', 'true', true);
  UPDATE public.profiles SET crown_score = before_score WHERE id = test_user;
END;
$$;

REVOKE ALL ON FUNCTION public.run_crown_score_guard_selftest() FROM PUBLIC, anon, authenticated;
