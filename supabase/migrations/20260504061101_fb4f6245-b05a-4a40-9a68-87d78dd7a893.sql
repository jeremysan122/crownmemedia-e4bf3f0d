
-- 1. Make admin_audit_log immutable: prevent UPDATE/DELETE for everyone
CREATE POLICY "admin_audit_log immutable - no update"
  ON public.admin_audit_log
  AS RESTRICTIVE
  FOR UPDATE
  TO public
  USING (false)
  WITH CHECK (false);

CREATE POLICY "admin_audit_log immutable - no delete"
  ON public.admin_audit_log
  AS RESTRICTIVE
  FOR DELETE
  TO public
  USING (false);

-- 2. Constrain error_logs INSERT so user_id must match auth.uid() (or be null)
DROP POLICY IF EXISTS "error_logs insert" ON public.error_logs;
CREATE POLICY "error_logs insert"
  ON public.error_logs
  FOR INSERT
  TO authenticated
  WITH CHECK (
    auth.uid() IS NOT NULL
    AND length(message) <= 2000
    AND (user_id IS NULL OR user_id = auth.uid())
  );

-- 3. Restrict admin_sessions self-update to only last_seen_at / ended_at columns.
-- Implement via a column-immutability check in WITH CHECK comparing other fields
-- to their stored values.
DROP POLICY IF EXISTS "admin_sessions self update" ON public.admin_sessions;
CREATE POLICY "admin_sessions self update"
  ON public.admin_sessions
  FOR UPDATE
  TO authenticated
  USING (auth.uid() = admin_id)
  WITH CHECK (
    auth.uid() = admin_id
    AND admin_id     = (SELECT s.admin_id     FROM public.admin_sessions s WHERE s.id = admin_sessions.id)
    AND started_at   = (SELECT s.started_at   FROM public.admin_sessions s WHERE s.id = admin_sessions.id)
    AND ip_address IS NOT DISTINCT FROM (SELECT s.ip_address FROM public.admin_sessions s WHERE s.id = admin_sessions.id)
    AND user_agent IS NOT DISTINCT FROM (SELECT s.user_agent FROM public.admin_sessions s WHERE s.id = admin_sessions.id)
  );
