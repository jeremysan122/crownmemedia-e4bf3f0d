
-- 1. Defensive trigger: block non-admin/non-service-role users from mutating verification badge fields
CREATE OR REPLACE FUNCTION public.profiles_prevent_verified_self_escalation()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  is_privileged boolean;
BEGIN
  -- service_role bypasses; admin/moderator allowed
  IF current_setting('request.jwt.claim.role', true) = 'service_role' THEN
    RETURN NEW;
  END IF;

  is_privileged := public.has_role(auth.uid(), 'admin'::app_role)
                OR public.has_role(auth.uid(), 'moderator'::app_role);

  IF is_privileged THEN
    RETURN NEW;
  END IF;

  IF NEW.verified IS DISTINCT FROM OLD.verified THEN
    RAISE EXCEPTION 'not authorized to change verified badge'
      USING ERRCODE = '42501';
  END IF;
  IF NEW.verified_at IS DISTINCT FROM OLD.verified_at THEN
    RAISE EXCEPTION 'not authorized to change verified_at'
      USING ERRCODE = '42501';
  END IF;
  IF NEW.verification_plan IS DISTINCT FROM OLD.verification_plan THEN
    RAISE EXCEPTION 'not authorized to change verification_plan'
      USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_profiles_prevent_verified_self_escalation ON public.profiles;
CREATE TRIGGER trg_profiles_prevent_verified_self_escalation
BEFORE UPDATE ON public.profiles
FOR EACH ROW
EXECUTE FUNCTION public.profiles_prevent_verified_self_escalation();

-- 2. Belt-and-suspenders: extend existing "deny self-mutation of protected fields" policy to include verified fields
DROP POLICY IF EXISTS "Profiles: deny self-mutation of protected fields" ON public.profiles;

CREATE POLICY "Profiles: deny self-mutation of protected fields"
ON public.profiles
FOR UPDATE
TO public
USING (true)
WITH CHECK (
  public.has_role(auth.uid(), 'admin'::app_role)
  OR public.has_role(auth.uid(), 'moderator'::app_role)
  OR (
    is_suspended       = (SELECT p.is_suspended       FROM public.profiles p WHERE p.id = profiles.id)
    AND crowns_held    = (SELECT p.crowns_held        FROM public.profiles p WHERE p.id = profiles.id)
    AND crowns_total   = (SELECT p.crowns_total       FROM public.profiles p WHERE p.id = profiles.id)
    AND battle_wins    = (SELECT p.battle_wins        FROM public.profiles p WHERE p.id = profiles.id)
    AND followers_count= (SELECT p.followers_count    FROM public.profiles p WHERE p.id = profiles.id)
    AND following_count= (SELECT p.following_count    FROM public.profiles p WHERE p.id = profiles.id)
    AND votes_received = (SELECT p.votes_received     FROM public.profiles p WHERE p.id = profiles.id)
    AND votes_given    = (SELECT p.votes_given        FROM public.profiles p WHERE p.id = profiles.id)
    AND NOT (is_banned              IS DISTINCT FROM (SELECT p.is_banned              FROM public.profiles p WHERE p.id = profiles.id))
    AND NOT (banned_at              IS DISTINCT FROM (SELECT p.banned_at              FROM public.profiles p WHERE p.id = profiles.id))
    AND NOT (banned_by              IS DISTINCT FROM (SELECT p.banned_by              FROM public.profiles p WHERE p.id = profiles.id))
    AND NOT (banned_reason          IS DISTINCT FROM (SELECT p.banned_reason          FROM public.profiles p WHERE p.id = profiles.id))
    AND NOT (deactivated_at         IS DISTINCT FROM (SELECT p.deactivated_at         FROM public.profiles p WHERE p.id = profiles.id))
    AND NOT (deletion_requested_at  IS DISTINCT FROM (SELECT p.deletion_requested_at  FROM public.profiles p WHERE p.id = profiles.id))
    -- verified badge lockdown
    AND NOT (verified               IS DISTINCT FROM (SELECT p.verified               FROM public.profiles p WHERE p.id = profiles.id))
    AND NOT (verified_at            IS DISTINCT FROM (SELECT p.verified_at            FROM public.profiles p WHERE p.id = profiles.id))
    AND NOT (verification_plan      IS DISTINCT FROM (SELECT p.verification_plan      FROM public.profiles p WHERE p.id = profiles.id))
  )
);

-- 3. Admin-only RPC to set verified badge. Payment/subscription flows MUST NOT call this.
CREATE OR REPLACE FUNCTION public.admin_set_profile_verified(
  _user_id uuid,
  _verified boolean,
  _plan text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT (public.has_role(auth.uid(), 'admin'::app_role)
          OR public.has_role(auth.uid(), 'moderator'::app_role)) THEN
    RAISE EXCEPTION 'not authorized' USING ERRCODE = '42501';
  END IF;

  UPDATE public.profiles
     SET verified = _verified,
         verified_at = CASE WHEN _verified THEN COALESCE(verified_at, now()) ELSE NULL END,
         verification_plan = COALESCE(_plan, verification_plan)
   WHERE id = _user_id;

  INSERT INTO public.admin_audit_log (actor_id, action, target_type, target_id, details)
  VALUES (
    auth.uid(),
    'profile.verified.set',
    'profile',
    _user_id::text,
    jsonb_build_object('verified', _verified, 'plan', _plan)
  );
END;
$$;

REVOKE ALL ON FUNCTION public.admin_set_profile_verified(uuid, boolean, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_set_profile_verified(uuid, boolean, text) TO authenticated;
