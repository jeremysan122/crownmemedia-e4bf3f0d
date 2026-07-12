
-- Temporary Wave 8.2b diagnostic. Read-only. Service-role only.
-- Compares three execution contexts (real PostgREST service_role,
-- authenticated user, direct psql superuser) so we can prove the profile
-- guard's real-world behavior before touching the guard.
--
-- This function will be dropped in a follow-up migration in the same turn cycle.

CREATE OR REPLACE FUNCTION public._lovable_probe_profile_guard_context(_user_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  before_bt int;
  before_founder boolean;
  before_title text;
  before_frame text;
  after_bt int;
  after_founder boolean;
  after_title text;
  after_frame text;
  before_granted_at timestamptz;
  after_granted_at timestamptz;
  probed_at timestamptz := now();
  err_state text;
  err_message text;
BEGIN
  -- Snapshot the current row before any mutation.
  SELECT boost_tokens_balance, is_founder, founder_title, royal_frame_variant, founder_granted_at
    INTO before_bt, before_founder, before_title, before_frame, before_granted_at
    FROM public.profiles WHERE id = _user_id;

  IF before_bt IS NULL AND before_founder IS NULL AND before_title IS NULL
     AND before_frame IS NULL AND before_granted_at IS NULL
     AND NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = _user_id) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'profile_not_found', 'user_id', _user_id);
  END IF;

  -- Attempt a distinguishable mutation to every protected column. Use a probe
  -- marker so we can detect trigger reversion, then restore exact prior state.
  BEGIN
    UPDATE public.profiles
       SET boost_tokens_balance = COALESCE(before_bt, 0) + 424242,
           is_founder           = NOT COALESCE(before_founder, false),
           founder_title        = '__probe_marker__',
           royal_frame_variant  = '__probe_frame__',
           founder_granted_at   = '2001-01-01T00:00:00Z'::timestamptz
     WHERE id = _user_id;
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS err_state = RETURNED_SQLSTATE, err_message = MESSAGE_TEXT;
  END;

  SELECT boost_tokens_balance, is_founder, founder_title, royal_frame_variant, founder_granted_at
    INTO after_bt, after_founder, after_title, after_frame, after_granted_at
    FROM public.profiles WHERE id = _user_id;

  -- Always restore exact prior state, regardless of whether the guard reverted.
  UPDATE public.profiles
     SET boost_tokens_balance = COALESCE(before_bt, 0),
         is_founder           = COALESCE(before_founder, false),
         founder_title        = before_title,
         royal_frame_variant  = before_frame,
         founder_granted_at   = before_granted_at
   WHERE id = _user_id;

  RETURN jsonb_build_object(
    'ok', true,
    'user_id', _user_id,
    'probed_at', probed_at,
    'context', jsonb_build_object(
      'auth_uid',                  auth.uid(),
      'current_user',              current_user,
      'session_user',              session_user,
      'role_guc',                  current_setting('role', true),
      'request_jwt_claim_role',    current_setting('request.jwt.claim.role', true),
      'request_jwt_claims',        current_setting('request.jwt.claims', true)
    ),
    'update_error', jsonb_build_object('sqlstate', err_state, 'message', err_message),
    'before', jsonb_build_object(
      'boost_tokens_balance', before_bt,
      'is_founder',           before_founder,
      'founder_title',        before_title,
      'royal_frame_variant',  before_frame,
      'founder_granted_at',   before_granted_at
    ),
    'after_attempt', jsonb_build_object(
      'boost_tokens_balance', after_bt,
      'is_founder',           after_founder,
      'founder_title',        after_title,
      'royal_frame_variant',  after_frame,
      'founder_granted_at',   after_granted_at
    ),
    'reverted', jsonb_build_object(
      'boost_tokens_balance', (after_bt = before_bt OR (after_bt IS NULL AND before_bt IS NULL)),
      'is_founder',           (after_founder = before_founder OR (after_founder IS NULL AND before_founder IS NULL)),
      'founder_title',        (after_title IS NOT DISTINCT FROM before_title),
      'royal_frame_variant',  (after_frame IS NOT DISTINCT FROM before_frame),
      'founder_granted_at',   (after_granted_at IS NOT DISTINCT FROM before_granted_at)
    ),
    'server_owned_change_persisted', (
      after_bt      = COALESCE(before_bt, 0) + 424242 AND
      after_founder = NOT COALESCE(before_founder, false) AND
      after_title   = '__probe_marker__' AND
      after_frame   = '__probe_frame__'
    )
  );
END;
$$;

REVOKE ALL ON FUNCTION public._lovable_probe_profile_guard_context(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public._lovable_probe_profile_guard_context(uuid) TO service_role;

COMMENT ON FUNCTION public._lovable_probe_profile_guard_context(uuid) IS
'Temporary Wave 8.2b diagnostic. Probes the profiles_guard_protected_fields trigger under real service-role vs. psql-superuser vs. authenticated contexts. Drop in follow-up migration.';
