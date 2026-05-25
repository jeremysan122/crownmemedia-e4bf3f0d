
-- 1) Strengthen restrictive UPDATE policy to also lock moderation/lifecycle fields
DROP POLICY IF EXISTS "Profiles: deny self-mutation of protected fields" ON public.profiles;

CREATE POLICY "Profiles: deny self-mutation of protected fields"
ON public.profiles
AS RESTRICTIVE
FOR UPDATE
USING (true)
WITH CHECK (
  public.has_role(auth.uid(), 'admin'::app_role)
  OR public.has_role(auth.uid(), 'moderator'::app_role)
  OR (
    is_suspended         = (SELECT p.is_suspended         FROM public.profiles p WHERE p.id = profiles.id)
    AND crowns_held      = (SELECT p.crowns_held          FROM public.profiles p WHERE p.id = profiles.id)
    AND crowns_total     = (SELECT p.crowns_total         FROM public.profiles p WHERE p.id = profiles.id)
    AND battle_wins      = (SELECT p.battle_wins          FROM public.profiles p WHERE p.id = profiles.id)
    AND followers_count  = (SELECT p.followers_count      FROM public.profiles p WHERE p.id = profiles.id)
    AND following_count  = (SELECT p.following_count      FROM public.profiles p WHERE p.id = profiles.id)
    AND votes_received   = (SELECT p.votes_received       FROM public.profiles p WHERE p.id = profiles.id)
    AND votes_given      = (SELECT p.votes_given          FROM public.profiles p WHERE p.id = profiles.id)
    AND is_banned        IS NOT DISTINCT FROM (SELECT p.is_banned        FROM public.profiles p WHERE p.id = profiles.id)
    AND banned_at        IS NOT DISTINCT FROM (SELECT p.banned_at        FROM public.profiles p WHERE p.id = profiles.id)
    AND banned_by        IS NOT DISTINCT FROM (SELECT p.banned_by        FROM public.profiles p WHERE p.id = profiles.id)
    AND banned_reason    IS NOT DISTINCT FROM (SELECT p.banned_reason    FROM public.profiles p WHERE p.id = profiles.id)
    AND deactivated_at   IS NOT DISTINCT FROM (SELECT p.deactivated_at   FROM public.profiles p WHERE p.id = profiles.id)
    AND deletion_requested_at IS NOT DISTINCT FROM (SELECT p.deletion_requested_at FROM public.profiles p WHERE p.id = profiles.id)
  )
);

-- 2) Hide internal moderation columns from unauthenticated visitors
REVOKE SELECT (banned_reason, banned_by, banned_at, is_banned, is_suspended, deactivated_at, deletion_requested_at)
  ON public.profiles FROM anon;
