-- profiles_public view fails for anon because its underlying RLS predicate
-- references is_banned/is_suspended/deactivated_at/deletion_requested_at.
-- Under security_invoker, anon must have column-level SELECT on the columns
-- the policy predicate reads, in addition to the projected columns.
GRANT SELECT (
  is_banned, is_suspended, deactivated_at, deletion_requested_at
) ON public.profiles TO anon;

NOTIFY pgrst, 'reload schema';