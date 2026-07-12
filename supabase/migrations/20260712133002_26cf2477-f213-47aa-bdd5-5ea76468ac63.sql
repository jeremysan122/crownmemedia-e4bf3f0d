-- Wave 8.2b Stage 1 — Harden profiles_guard_protected_fields.
-- Replace broad OR authorization with a matched trusted context:
--   service_role_context = (DB role GUC = 'service_role')
--                          AND (JSON-claims role = 'service_role' OR legacy scalar GUC = 'service_role')
-- This blocks direct psql/sandbox contexts (postgres role) even if a JWT is
-- injected, and blocks a bare JWT claim without an actual service_role DB
-- session. Admin/moderator bypass preserved for support tooling.

CREATE OR REPLACE FUNCTION public.profiles_guard_protected_fields()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  is_privileged boolean;
  service_role_context boolean;
  jwt_claims_text text;
  jwt_role text;
  role_guc text;
BEGIN
  -- Read JSON claims safely.
  jwt_claims_text := current_setting('request.jwt.claims', true);
  IF jwt_claims_text IS NOT NULL AND jwt_claims_text <> '' THEN
    BEGIN
      jwt_role := (jwt_claims_text::jsonb) ->> 'role';
    EXCEPTION WHEN OTHERS THEN
      jwt_role := NULL; -- malformed claims → untrusted
    END;
  END IF;

  role_guc := current_setting('role', true);

  -- Matched trusted context: BOTH the DB role GUC AND a JWT-carried role
  -- claim must say service_role. Neither signal alone is sufficient.
  service_role_context := (
    role_guc = 'service_role'
    AND (
      jwt_role = 'service_role'
      OR current_setting('request.jwt.claim.role', true) = 'service_role'
    )
  );

  is_privileged := (
    service_role_context
    OR public.has_role(auth.uid(), 'admin'::app_role)
    OR public.has_role(auth.uid(), 'moderator'::app_role)
  );

  IF is_privileged THEN RETURN NEW; END IF;

  -- Existing protected fields
  NEW.is_suspended          := OLD.is_suspended;
  NEW.crowns_held           := OLD.crowns_held;
  NEW.crowns_total          := OLD.crowns_total;
  NEW.battle_wins           := OLD.battle_wins;
  NEW.followers_count       := OLD.followers_count;
  NEW.following_count       := OLD.following_count;
  NEW.votes_received        := OLD.votes_received;
  NEW.votes_given           := OLD.votes_given;
  NEW.is_banned             := OLD.is_banned;
  NEW.banned_at             := OLD.banned_at;
  NEW.banned_by             := OLD.banned_by;
  NEW.banned_reason         := OLD.banned_reason;
  NEW.deactivated_at        := OLD.deactivated_at;
  NEW.deletion_requested_at := OLD.deletion_requested_at;
  NEW.verified              := OLD.verified;
  NEW.verified_at           := OLD.verified_at;
  NEW.verification_plan     := OLD.verification_plan;

  -- Royal Pass protected fields (Wave 8.1)
  NEW.boost_tokens_balance := OLD.boost_tokens_balance;
  NEW.is_founder           := OLD.is_founder;
  NEW.founder_granted_at   := OLD.founder_granted_at;
  NEW.founder_title        := OLD.founder_title;
  NEW.royal_frame_variant  := OLD.royal_frame_variant;

  RETURN NEW;
END;
$function$;

COMMENT ON FUNCTION public.profiles_guard_protected_fields() IS
'Reverts server-owned profile fields on UPDATE unless (a) the caller is in a matched service_role context — DB role GUC = service_role AND JWT claims role = service_role — or (b) auth.uid() is admin/moderator. Neither the DB role alone (raw psql/postgres) nor a JWT claim alone is sufficient.';