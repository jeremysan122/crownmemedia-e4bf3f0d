-- Fix: authenticated users couldn't SELECT many preference columns on public.profiles
-- because the table had column-level grants only (UPDATE without SELECT on most prefs),
-- causing "permission denied for table profiles" on Preferences save/load and any
-- update that returned rows. Grant table-level CRUD to authenticated. RLS continues
-- to enforce row-level access. Anon keeps its existing column-level SELECT grants
-- (only public-safe columns remain readable to logged-out visitors).

GRANT SELECT, INSERT, UPDATE, DELETE ON public.profiles TO authenticated;
GRANT ALL ON public.profiles TO service_role;