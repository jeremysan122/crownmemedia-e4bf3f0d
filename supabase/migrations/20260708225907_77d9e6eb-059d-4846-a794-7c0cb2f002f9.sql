
-- 1) Recreate the profiles column-lockdown policy AS RESTRICTIVE.
DROP POLICY IF EXISTS "Profiles: deny self-mutation of protected fields" ON public.profiles;

CREATE POLICY "Profiles: deny self-mutation of protected fields"
ON public.profiles
AS RESTRICTIVE
FOR UPDATE
TO authenticated
USING (true)
WITH CHECK (
  public.has_role(auth.uid(), 'admin'::public.app_role)
  OR public.has_role(auth.uid(), 'moderator'::public.app_role)
  OR (
    is_suspended           IS NOT DISTINCT FROM (SELECT p.is_suspended           FROM public.profiles p WHERE p.id = profiles.id)
    AND crowns_held        IS NOT DISTINCT FROM (SELECT p.crowns_held            FROM public.profiles p WHERE p.id = profiles.id)
    AND crowns_total       IS NOT DISTINCT FROM (SELECT p.crowns_total           FROM public.profiles p WHERE p.id = profiles.id)
    AND battle_wins        IS NOT DISTINCT FROM (SELECT p.battle_wins            FROM public.profiles p WHERE p.id = profiles.id)
    AND followers_count    IS NOT DISTINCT FROM (SELECT p.followers_count        FROM public.profiles p WHERE p.id = profiles.id)
    AND following_count    IS NOT DISTINCT FROM (SELECT p.following_count        FROM public.profiles p WHERE p.id = profiles.id)
    AND votes_received     IS NOT DISTINCT FROM (SELECT p.votes_received         FROM public.profiles p WHERE p.id = profiles.id)
    AND votes_given        IS NOT DISTINCT FROM (SELECT p.votes_given            FROM public.profiles p WHERE p.id = profiles.id)
    AND is_banned          IS NOT DISTINCT FROM (SELECT p.is_banned              FROM public.profiles p WHERE p.id = profiles.id)
    AND banned_at          IS NOT DISTINCT FROM (SELECT p.banned_at              FROM public.profiles p WHERE p.id = profiles.id)
    AND banned_by          IS NOT DISTINCT FROM (SELECT p.banned_by              FROM public.profiles p WHERE p.id = profiles.id)
    AND banned_reason      IS NOT DISTINCT FROM (SELECT p.banned_reason          FROM public.profiles p WHERE p.id = profiles.id)
    AND deactivated_at     IS NOT DISTINCT FROM (SELECT p.deactivated_at         FROM public.profiles p WHERE p.id = profiles.id)
    AND deletion_requested_at IS NOT DISTINCT FROM (SELECT p.deletion_requested_at FROM public.profiles p WHERE p.id = profiles.id)
    AND verified           IS NOT DISTINCT FROM (SELECT p.verified               FROM public.profiles p WHERE p.id = profiles.id)
    AND verified_at        IS NOT DISTINCT FROM (SELECT p.verified_at            FROM public.profiles p WHERE p.id = profiles.id)
    AND verification_plan  IS NOT DISTINCT FROM (SELECT p.verification_plan      FROM public.profiles p WHERE p.id = profiles.id)
  )
);

-- 2) Revoke anon EXECUTE from auth-required mutating / personal RPCs.
--    They internally reject anonymous callers already; there is no reason to
--    expose them to the anon role.
REVOKE EXECUTE ON FUNCTION public.create_repost(uuid, text, uuid) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.create_repost(uuid, text, uuid) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.get_my_crown_map_points()               FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.get_my_crown_map_points()               TO authenticated;

REVOKE EXECUTE ON FUNCTION public.get_my_unread_dm_counts()               FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.get_my_unread_dm_counts()               TO authenticated;

REVOKE EXECUTE ON FUNCTION public.get_my_unread_notification_counts()     FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.get_my_unread_notification_counts()     TO authenticated;

-- 3) Cron/maintenance helpers — service_role only.
REVOKE EXECUTE ON FUNCTION public.refresh_crown_map_points() FROM anon, authenticated, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.prune_logs_retention()     FROM anon, authenticated, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.email_queue_dispatch()     FROM anon, authenticated, PUBLIC;
