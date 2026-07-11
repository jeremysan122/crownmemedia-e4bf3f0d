
-- Fix crown_score guard: allow internal server sync via GUC flag.
-- Problem: guard checks auth.uid() role, but posts trigger runs as normal
-- authenticated user (SECURITY DEFINER doesn't change auth.uid()), so the
-- guard was silently reverting legitimate server-owned syncs.

CREATE OR REPLACE FUNCTION public.tg_sync_profile_crown_score()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  -- Signal to guard_profiles_crown_score that this is a trusted server sync.
  PERFORM set_config('app.allow_crown_score_sync', 'true', true);

  IF TG_OP = 'INSERT' THEN
    IF NEW.user_id IS NOT NULL THEN
      UPDATE public.profiles SET crown_score = GREATEST(0, crown_score + COALESCE(NEW.crown_score,0))
      WHERE id = NEW.user_id;
    END IF;
  ELSIF TG_OP = 'DELETE' THEN
    IF OLD.user_id IS NOT NULL THEN
      UPDATE public.profiles SET crown_score = GREATEST(0, crown_score - COALESCE(OLD.crown_score,0))
      WHERE id = OLD.user_id;
    END IF;
  ELSIF TG_OP = 'UPDATE' THEN
    IF COALESCE(NEW.crown_score,0) <> COALESCE(OLD.crown_score,0) OR NEW.user_id IS DISTINCT FROM OLD.user_id THEN
      IF OLD.user_id IS NOT NULL THEN
        UPDATE public.profiles SET crown_score = GREATEST(0, crown_score - COALESCE(OLD.crown_score,0))
        WHERE id = OLD.user_id;
      END IF;
      IF NEW.user_id IS NOT NULL THEN
        UPDATE public.profiles SET crown_score = GREATEST(0, crown_score + COALESCE(NEW.crown_score,0))
        WHERE id = NEW.user_id;
      END IF;
    END IF;
  END IF;
  RETURN NULL;
END;
$function$;

CREATE OR REPLACE FUNCTION public.guard_profiles_crown_score()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.crown_score IS DISTINCT FROM OLD.crown_score THEN
    IF (
      -- Trusted internal server sync (set by tg_sync_profile_crown_score)
      current_setting('app.allow_crown_score_sync', true) = 'true'
      -- Service role (edge functions / admin code)
      OR current_setting('request.jwt.claim.role', true) = 'service_role'
      -- Admin or moderator
      OR public.has_role(auth.uid(), 'admin'::app_role)
      OR public.has_role(auth.uid(), 'moderator'::app_role)
    ) THEN
      RETURN NEW;
    END IF;
    -- Silently restore for everyone else (normal authenticated users).
    NEW.crown_score := OLD.crown_score;
  END IF;
  RETURN NEW;
END;
$function$;
