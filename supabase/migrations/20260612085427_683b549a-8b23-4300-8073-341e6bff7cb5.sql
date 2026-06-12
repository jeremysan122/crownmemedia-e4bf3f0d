
-- ──────────────────────────────────────────────────────────────────────
-- Verification: Standard auto-eligibility (10k followers + checklist)
-- ──────────────────────────────────────────────────────────────────────

-- Helper: compute progress for the signed-in user (or a passed user id).
-- Returns a single jsonb document the UI can render directly. SECURITY
-- DEFINER so it can read aggregate columns even when RLS would otherwise
-- block (we only ever return the caller's own row).
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
  _account_age_days int;
  _required_followers int := 10000;
  _required_posts int := 5;
  _required_age_days int := 30;
  _checks jsonb;
  _all_pass boolean;
BEGIN
  IF _user_id IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;
  IF auth.uid() IS DISTINCT FROM _user_id THEN
    -- Only allow self-lookup. Admins use other tooling.
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

  SELECT count(*)::int INTO _posts_count
    FROM public.posts
   WHERE user_id = _user_id
     AND COALESCE(publish_status, 'approved') = 'approved';

  _account_age_days := GREATEST(0, EXTRACT(DAY FROM (now() - _row.created_at))::int);

  _checks := jsonb_build_object(
    'followers', jsonb_build_object(
      'pass', COALESCE(_row.followers_count, 0) >= _required_followers,
      'current', COALESCE(_row.followers_count, 0),
      'required', _required_followers,
      'label', 'At least 10,000 followers'
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
      'label', 'At least 5 published posts'
    ),
    'good_standing', jsonb_build_object(
      'pass', NOT COALESCE(_row.is_banned, false) AND NOT COALESCE(_row.is_suspended, false),
      'label', 'Account in good standing'
    )
  );

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

-- Action: request standard verification. Auto-approves if eligible.
-- Creates a verification_requests row marked 'approved' for audit trail
-- and flips profiles.verified = true with plan = 'standard'.
CREATE OR REPLACE FUNCTION public.request_standard_verification()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _uid uuid := auth.uid();
  _progress jsonb;
  _eligible boolean;
  _req_id uuid;
  _existing_req record;
BEGIN
  IF _uid IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;

  -- Already verified? Just return current state.
  IF EXISTS (SELECT 1 FROM public.profiles WHERE id = _uid AND verified = true) THEN
    RETURN jsonb_build_object('status', 'already_verified');
  END IF;

  _progress := public.verification_eligibility_progress(_uid);
  _eligible := COALESCE((_progress->>'eligible')::boolean, false);

  IF NOT _eligible THEN
    RETURN jsonb_build_object('status', 'not_eligible', 'progress', _progress);
  END IF;

  -- If a pending standard request already exists, reuse it; otherwise insert.
  SELECT id INTO _existing_req
    FROM public.verification_requests
   WHERE user_id = _uid AND plan = 'standard' AND status IN ('pending','more_info_required')
   ORDER BY created_at DESC LIMIT 1;

  IF _existing_req.id IS NOT NULL THEN
    UPDATE public.verification_requests
       SET status = 'approved',
           reviewed_at = now(),
           review_notes = 'Auto-approved: met all Standard verification requirements.',
           updated_at = now()
     WHERE id = _existing_req.id
     RETURNING id INTO _req_id;
  ELSE
    INSERT INTO public.verification_requests
      (user_id, plan, status, category, legal_name, reason,
       id_document_path, selfie_path, follower_count,
       reviewed_at, review_notes)
    VALUES
      (_uid, 'standard', 'approved', 'creator', '', 'Auto-approved via Standard eligibility',
       '', '', ((_progress->'checks'->'followers'->>'current')::int),
       now(), 'Auto-approved: met all Standard verification requirements.')
    RETURNING id INTO _req_id;
  END IF;

  UPDATE public.profiles
     SET verified = true,
         verified_at = now(),
         verification_plan = 'standard'
   WHERE id = _uid;

  RETURN jsonb_build_object(
    'status', 'approved',
    'request_id', _req_id,
    'progress', _progress
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.request_standard_verification() TO authenticated;
