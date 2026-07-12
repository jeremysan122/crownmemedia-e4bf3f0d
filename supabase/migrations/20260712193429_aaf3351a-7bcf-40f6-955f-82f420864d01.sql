
-- Stage 2: canonical shield-credit vs active-session accounting.

CREATE OR REPLACE VIEW public.royal_shield_accounting
WITH (security_invoker = true) AS
SELECT
  a.user_id,
  a.royal_pass_grant_id                                    AS grant_id,
  a.id                                                     AS allowance_id,
  a.period_start,
  a.period_end,
  a.shields_granted,
  a.shields_used,
  g.shields_reversed,
  g.active_shields_reversed,
  -- Credits currently accounted as "spent but not reversed":
  GREATEST(a.shields_used - COALESCE(g.shields_reversed, 0), 0) AS net_spent_credits,
  -- Active shield sessions tied to this allowance right now:
  (
    SELECT COUNT(*)::int
      FROM public.boosts b
     WHERE b.royal_pass_shield_allowance_id = a.id
       AND b.boost_type = 'crown_shield'
       AND b.active = true
       AND (b.expires_at IS NULL OR b.expires_at > now())
  ) AS active_shield_sessions,
  g.status                                                 AS grant_status
FROM public.royal_pass_shield_allowances a
JOIN public.royal_pass_grants g ON g.id = a.royal_pass_grant_id;

REVOKE ALL ON public.royal_shield_accounting FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.royal_shield_accounting TO service_role;
-- Admin read is gated via has_role check in the wrapper below.

-- Authenticated wrapper: user sees only their own accounting rows.
CREATE OR REPLACE FUNCTION public.my_royal_shield_accounting()
RETURNS TABLE (
  grant_id uuid,
  allowance_id uuid,
  period_start timestamptz,
  period_end timestamptz,
  shields_granted int,
  shields_used int,
  shields_reversed int,
  active_shields_reversed int,
  net_spent_credits int,
  active_shield_sessions int,
  grant_status text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    v.grant_id, v.allowance_id, v.period_start, v.period_end,
    v.shields_granted, v.shields_used,
    v.shields_reversed, v.active_shields_reversed,
    v.net_spent_credits, v.active_shield_sessions,
    v.grant_status
  FROM public.royal_shield_accounting v
  WHERE v.user_id = auth.uid();
$$;
REVOKE ALL ON FUNCTION public.my_royal_shield_accounting() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.my_royal_shield_accounting() TO authenticated, service_role;

-- Admin: read all rows.
CREATE OR REPLACE FUNCTION public.admin_royal_shield_accounting()
RETURNS SETOF public.royal_shield_accounting
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin'::app_role) THEN
    RAISE EXCEPTION 'not_authorized' USING ERRCODE = '42501';
  END IF;
  RETURN QUERY SELECT * FROM public.royal_shield_accounting;
END;
$$;
REVOKE ALL ON FUNCTION public.admin_royal_shield_accounting() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_royal_shield_accounting() TO authenticated, service_role;

-- Integrity assertion: raises if active sessions ever exceed net-spent credits.
-- Admin-only; intended for reconciliation jobs and diagnostic runs.
CREATE OR REPLACE FUNCTION public.assert_royal_shield_invariants(_user_id uuid DEFAULT NULL)
RETURNS TABLE (
  user_id uuid,
  allowance_id uuid,
  net_spent_credits int,
  active_shield_sessions int,
  drift int
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin'::app_role) THEN
    RAISE EXCEPTION 'not_authorized' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  SELECT
    v.user_id,
    v.allowance_id,
    v.net_spent_credits,
    v.active_shield_sessions,
    (v.active_shield_sessions - v.net_spent_credits) AS drift
  FROM public.royal_shield_accounting v
  WHERE (_user_id IS NULL OR v.user_id = _user_id)
    AND v.active_shield_sessions > v.net_spent_credits;
END;
$$;
REVOKE ALL ON FUNCTION public.assert_royal_shield_invariants(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.assert_royal_shield_invariants(uuid) TO authenticated, service_role;

COMMENT ON VIEW public.royal_shield_accounting IS
  'Wave 8.2b Stage 2 — per-allowance shield credit vs active-session accounting. Admin/service_role only. Users read via my_royal_shield_accounting().';
COMMENT ON FUNCTION public.assert_royal_shield_invariants(uuid) IS
  'Wave 8.2b Stage 2 — returns rows where active shield sessions exceed net-spent credits. Empty result = healthy.';
