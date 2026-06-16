
-- 1) Revoke anon read on internal post dedupe columns
REVOKE SELECT (submission_key, client_request_id) ON public.posts FROM anon;
REVOKE SELECT (submission_key, client_request_id) ON public.posts FROM authenticated;

-- 2) Defensive RESTRICTIVE deny-all for non-service roles on email_send_log
DROP POLICY IF EXISTS "Deny anon/authenticated all access" ON public.email_send_log;
CREATE POLICY "Deny anon/authenticated all access"
  ON public.email_send_log
  AS RESTRICTIVE
  FOR ALL
  TO anon, authenticated
  USING (false)
  WITH CHECK (false);

-- 3) Defensive RESTRICTIVE deny-all for non-service roles on suppressed_emails
DROP POLICY IF EXISTS "Deny anon/authenticated all access" ON public.suppressed_emails;
CREATE POLICY "Deny anon/authenticated all access"
  ON public.suppressed_emails
  AS RESTRICTIVE
  FOR ALL
  TO anon, authenticated
  USING (false)
  WITH CHECK (false);
