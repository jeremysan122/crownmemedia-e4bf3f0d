
-- 1. Search-path hardening on storage_path_from_public_url
CREATE OR REPLACE FUNCTION public.storage_path_from_public_url(_url text, _bucket text)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT CASE
    WHEN _url IS NULL OR _bucket IS NULL THEN NULL
    WHEN position('/storage/v1/object/public/' || _bucket || '/' IN _url) > 0
      THEN substring(_url FROM position('/storage/v1/object/public/' || _bucket || '/' IN _url) + length('/storage/v1/object/public/' || _bucket || '/'))
    ELSE NULL
  END
$$;

-- 2. Profiles protected-field guard (trigger replaces RLS subqueries)
CREATE OR REPLACE FUNCTION public.profiles_guard_protected_fields()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  is_privileged boolean;
BEGIN
  is_privileged := (
    current_setting('request.jwt.claim.role', true) = 'service_role'
    OR public.has_role(auth.uid(), 'admin'::app_role)
    OR public.has_role(auth.uid(), 'moderator'::app_role)
  );

  IF is_privileged THEN
    RETURN NEW;
  END IF;

  -- Silently restore any attempted change to protected fields.
  NEW.is_suspended        := OLD.is_suspended;
  NEW.crowns_held         := OLD.crowns_held;
  NEW.crowns_total        := OLD.crowns_total;
  NEW.battle_wins         := OLD.battle_wins;
  NEW.followers_count     := OLD.followers_count;
  NEW.following_count     := OLD.following_count;
  NEW.votes_received      := OLD.votes_received;
  NEW.votes_given         := OLD.votes_given;
  NEW.is_banned           := OLD.is_banned;
  NEW.banned_at           := OLD.banned_at;
  NEW.banned_by           := OLD.banned_by;
  NEW.banned_reason       := OLD.banned_reason;
  NEW.deactivated_at      := OLD.deactivated_at;
  NEW.deletion_requested_at := OLD.deletion_requested_at;
  NEW.verified            := OLD.verified;
  NEW.verified_at         := OLD.verified_at;
  NEW.verification_plan   := OLD.verification_plan;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_profiles_guard_protected_fields ON public.profiles;
CREATE TRIGGER trg_profiles_guard_protected_fields
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.profiles_guard_protected_fields();

-- 3. Drop the old subquery-based RESTRICTIVE policy — trigger now enforces this.
DROP POLICY IF EXISTS "Profiles: deny self-mutation of protected fields" ON public.profiles;
