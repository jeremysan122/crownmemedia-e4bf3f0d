
-- 1) feature_flags: restrict SELECT to admins only
DROP POLICY IF EXISTS "flags readable by authed" ON public.feature_flags;
CREATE POLICY "flags readable by admins"
ON public.feature_flags
FOR SELECT
TO authenticated
USING (is_any_admin(auth.uid()));

-- 2) rate_limits: explicitly deny writes for anon/authenticated, allow service_role only
REVOKE ALL ON public.rate_limits FROM anon, authenticated, PUBLIC;
GRANT SELECT ON public.rate_limits TO authenticated; -- admin SELECT policy still applies
GRANT ALL ON public.rate_limits TO service_role;

DROP POLICY IF EXISTS "rate_limits deny writes" ON public.rate_limits;
CREATE POLICY "rate_limits deny writes"
ON public.rate_limits
AS RESTRICTIVE
FOR ALL
TO anon, authenticated
USING (false)
WITH CHECK (false);

-- 3) Revoke anon/public execute on SECURITY DEFINER trigger helper
REVOKE EXECUTE ON FUNCTION public.verification_requests_block_user_field_changes() FROM PUBLIC, anon, authenticated;
