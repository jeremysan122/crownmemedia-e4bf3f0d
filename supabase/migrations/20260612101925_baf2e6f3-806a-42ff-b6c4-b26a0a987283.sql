-- Fix: cover banner upload threw "permission denied for function dm_pair_folder".
-- The dm-attachments storage RLS policy calls this helper; it must be runnable
-- by the authenticated role even when the upload targets a different bucket,
-- because Postgres may evaluate the predicate before short-circuiting on bucket_id.
GRANT EXECUTE ON FUNCTION public.dm_pair_folder(uuid, uuid) TO authenticated;

-- Fix: "Profile update blocked by permissions" on Save Profile.
-- The BEFORE UPDATE trigger trg_profiles_validate_links calls this validator;
-- it's not SECURITY DEFINER, so it runs as the calling role and needs EXECUTE
-- for authenticated users. (The function only inspects NEW.links — safe to expose.)
GRANT EXECUTE ON FUNCTION public.profiles_validate_links() TO authenticated;