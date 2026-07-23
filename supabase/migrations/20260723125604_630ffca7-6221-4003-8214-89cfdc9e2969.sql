BEGIN;

-- profiles_public view (security_invoker=on) filters on these columns; anon
-- must have SELECT on them for the view to plan. They are not projected.
GRANT SELECT (is_banned, deactivated_at, deletion_requested_at)
  ON public.profiles TO anon;

NOTIFY pgrst, 'reload schema';

COMMIT;