-- profiles_public (security_invoker=on) filters on is_banned, deactivated_at,
-- deletion_requested_at. With security_invoker, anon must have column-level
-- SELECT on the filter columns too, otherwise the view planning fails 401.
GRANT SELECT (is_banned, deactivated_at, deletion_requested_at)
  ON public.profiles TO anon;

-- Make sure the view itself is grantable to anon + authenticated.
GRANT SELECT ON public.profiles_public TO anon, authenticated;
GRANT SELECT ON public.posts_public   TO anon, authenticated;

NOTIFY pgrst, 'reload schema';