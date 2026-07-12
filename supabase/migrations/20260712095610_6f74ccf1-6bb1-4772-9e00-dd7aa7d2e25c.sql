
-- Wave 8.2b Stage 1 fix: recognise the real service-role execution context.
-- Root cause proven via probe RPC + Edge Function: modern PostgREST no longer
-- sets the legacy 'request.jwt.claim.role' scalar GUC. It sets 'role' GUC and
-- puts the role inside the JSON 'request.jwt.claims'. The guard was blocking
-- every legitimate server-owned change to protected profile columns.
--
-- Safety: none of these three signals are forgeable by an authenticated caller.
--   - current_setting('role') = 'service_role' requires role membership.
--   - request.jwt.claims JSON is signed by the Supabase API-key issuer.
--   - request.jwt.claim.role legacy GUC is set only by PostgREST from a JWT.
--
-- Admin/moderator bypass is preserved. Ordinary users remain blocked.

CREATE OR REPLACE FUNCTION public.profiles_guard_protected_fields()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  is_privileged boolean;
  jwt_claims_text text;
  jwt_role text;
BEGIN
  -- Modern PostgREST: JSON claims blob. Legacy PostgREST: scalar GUC. Both are
  -- server-controlled and un-forgeable by an authenticated caller.
  jwt_claims_text := current_setting('request.jwt.claims', true);
  IF jwt_claims_text IS NOT NULL AND jwt_claims_text <> '' THEN
    BEGIN
      jwt_role := (jwt_claims_text::jsonb) ->> 'role';
    EXCEPTION WHEN OTHERS THEN
      jwt_role := NULL;
    END;
  END IF;

  is_privileged := (
    current_setting('role', true) = 'service_role'
    OR jwt_role = 'service_role'
    OR current_setting('request.jwt.claim.role', true) = 'service_role'
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
