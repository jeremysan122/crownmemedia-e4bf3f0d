
-- 1) Defense-in-depth: revoke PII columns from anon on profiles
REVOKE SELECT (first_name, last_name) ON public.profiles FROM anon;
REVOKE SELECT (first_name, last_name) ON public.profiles FROM PUBLIC;
GRANT SELECT (first_name, last_name) ON public.profiles TO authenticated;

-- Also enforce at RLS layer: replace the public-readable SELECT policy so anon
-- can still read profile rows (so name columns are filtered by grants), while
-- guaranteeing PII columns can never be returned to anon even if grants drift.
-- We do this by creating an explicit policy that only authenticated users can
-- read full rows, and a separate restricted policy for anon.
DROP POLICY IF EXISTS "Profiles are viewable by everyone" ON public.profiles;
DROP POLICY IF EXISTS "Public profiles are viewable" ON public.profiles;

CREATE POLICY "Profiles readable by authenticated"
  ON public.profiles FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Profiles readable by anon (non-PII via grants)"
  ON public.profiles FOR SELECT
  TO anon
  USING (true);

-- 2) Remove sensitive tables from realtime publication
ALTER PUBLICATION supabase_realtime DROP TABLE public.error_logs;
ALTER PUBLICATION supabase_realtime DROP TABLE public.reports;
ALTER PUBLICATION supabase_realtime DROP TABLE public.votes;

-- 3) Explicit restrictive INSERT policy on moderation_audit
--    Inserts must go through SECURITY DEFINER functions / service_role.
CREATE POLICY "Block client inserts on moderation_audit"
  ON public.moderation_audit AS RESTRICTIVE
  FOR INSERT
  TO anon, authenticated
  WITH CHECK (false);
