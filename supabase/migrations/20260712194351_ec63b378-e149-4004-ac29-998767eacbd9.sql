
CREATE TABLE IF NOT EXISTS public.royal_shield_audit_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  event_type text NOT NULL CHECK (event_type IN (
    'credit','debit','reversal','restoration','invariant_ok','invariant_drift','manual_check'
  )),
  reason_code text NOT NULL,
  delta integer NOT NULL DEFAULT 0,
  shields_granted integer,
  net_spent_credits integer,
  active_shield_sessions integer,
  drift_amount integer,
  royal_pass_grant_id uuid REFERENCES public.royal_pass_grants(id) ON DELETE SET NULL,
  shield_allowance_id uuid REFERENCES public.royal_pass_shield_allowances(id) ON DELETE SET NULL,
  boost_id uuid REFERENCES public.boosts(id) ON DELETE SET NULL,
  battle_id uuid,
  post_id uuid,
  actor_id uuid,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_royal_shield_audit_user_created
  ON public.royal_shield_audit_log (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_royal_shield_audit_event_type
  ON public.royal_shield_audit_log (event_type, created_at DESC);

GRANT SELECT ON public.royal_shield_audit_log TO authenticated;
GRANT ALL ON public.royal_shield_audit_log TO service_role;

ALTER TABLE public.royal_shield_audit_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "royal_shield_audit users read own" ON public.royal_shield_audit_log;
CREATE POLICY "royal_shield_audit users read own"
  ON public.royal_shield_audit_log FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "royal_shield_audit admins read all" ON public.royal_shield_audit_log;
CREATE POLICY "royal_shield_audit admins read all"
  ON public.royal_shield_audit_log FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role));

DROP POLICY IF EXISTS "royal_shield_audit no client insert" ON public.royal_shield_audit_log;
CREATE POLICY "royal_shield_audit no client insert"
  ON public.royal_shield_audit_log AS RESTRICTIVE FOR INSERT
  TO anon, authenticated WITH CHECK (false);

DROP POLICY IF EXISTS "royal_shield_audit no client update" ON public.royal_shield_audit_log;
CREATE POLICY "royal_shield_audit no client update"
  ON public.royal_shield_audit_log AS RESTRICTIVE FOR UPDATE
  TO anon, authenticated USING (false) WITH CHECK (false);

DROP POLICY IF EXISTS "royal_shield_audit no client delete" ON public.royal_shield_audit_log;
CREATE POLICY "royal_shield_audit no client delete"
  ON public.royal_shield_audit_log AS RESTRICTIVE FOR DELETE
  TO anon, authenticated USING (false);

CREATE OR REPLACE FUNCTION public.log_royal_shield_event(
  _user_id uuid,
  _event_type text,
  _reason_code text,
  _delta integer DEFAULT 0,
  _grant_id uuid DEFAULT NULL,
  _allowance_id uuid DEFAULT NULL,
  _boost_id uuid DEFAULT NULL,
  _battle_id uuid DEFAULT NULL,
  _post_id uuid DEFAULT NULL,
  _metadata jsonb DEFAULT '{}'::jsonb
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id uuid;
BEGIN
  INSERT INTO public.royal_shield_audit_log (
    user_id, event_type, reason_code, delta,
    royal_pass_grant_id, shield_allowance_id, boost_id,
    battle_id, post_id, actor_id, metadata
  ) VALUES (
    _user_id, _event_type, _reason_code, COALESCE(_delta, 0),
    _grant_id, _allowance_id, _boost_id,
    _battle_id, _post_id, auth.uid(), COALESCE(_metadata, '{}'::jsonb)
  ) RETURNING id INTO v_id;
  RETURN v_id;
END;
$$;

REVOKE ALL ON FUNCTION public.log_royal_shield_event(uuid, text, text, integer, uuid, uuid, uuid, uuid, uuid, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.log_royal_shield_event(uuid, text, text, integer, uuid, uuid, uuid, uuid, uuid, jsonb) TO service_role;

CREATE OR REPLACE FUNCTION public.my_royal_shield_summary()
RETURNS TABLE (
  shields_granted bigint,
  net_spent_credits bigint,
  remaining_credits bigint,
  active_shield_sessions bigint,
  has_drift boolean
)
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT
    COALESCE(SUM(v.shields_granted), 0)::bigint AS shields_granted,
    COALESCE(SUM(v.net_spent_credits), 0)::bigint AS net_spent_credits,
    GREATEST(COALESCE(SUM(v.shields_granted - v.net_spent_credits), 0), 0)::bigint AS remaining_credits,
    COALESCE(SUM(v.active_shield_sessions), 0)::bigint AS active_shield_sessions,
    COALESCE(bool_or(v.active_shield_sessions > v.net_spent_credits), false) AS has_drift
  FROM public.royal_shield_accounting v
  WHERE v.user_id = auth.uid();
$$;

REVOKE ALL ON FUNCTION public.my_royal_shield_summary() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.my_royal_shield_summary() TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.admin_run_royal_shield_integrity_check(
  _reason text DEFAULT 'manual_admin_run'
)
RETURNS TABLE (
  user_id uuid,
  shields_granted integer,
  net_spent_credits integer,
  active_shield_sessions integer,
  drift_amount integer,
  status text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  r RECORD;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin'::app_role) THEN
    RAISE EXCEPTION 'not_authorized' USING ERRCODE = '42501';
  END IF;

  FOR r IN
    SELECT
      v.user_id,
      SUM(v.shields_granted)::integer AS shields_granted,
      SUM(v.net_spent_credits)::integer AS net_spent_credits,
      SUM(v.active_shield_sessions)::integer AS active_shield_sessions,
      GREATEST(SUM(v.active_shield_sessions) - SUM(v.net_spent_credits), 0)::integer AS drift_amount
    FROM public.royal_shield_accounting v
    GROUP BY v.user_id
  LOOP
    INSERT INTO public.royal_shield_audit_log (
      user_id, event_type, reason_code, delta,
      shields_granted, net_spent_credits, active_shield_sessions, drift_amount,
      actor_id, metadata
    ) VALUES (
      r.user_id,
      CASE WHEN r.drift_amount > 0 THEN 'invariant_drift' ELSE 'invariant_ok' END,
      _reason,
      0,
      r.shields_granted, r.net_spent_credits, r.active_shield_sessions, r.drift_amount,
      auth.uid(),
      jsonb_build_object('source','admin_run_royal_shield_integrity_check')
    );

    user_id := r.user_id;
    shields_granted := r.shields_granted;
    net_spent_credits := r.net_spent_credits;
    active_shield_sessions := r.active_shield_sessions;
    drift_amount := r.drift_amount;
    status := CASE WHEN r.drift_amount > 0 THEN 'drift' ELSE 'ok' END;
    RETURN NEXT;
  END LOOP;
  RETURN;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_run_royal_shield_integrity_check(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_run_royal_shield_integrity_check(text) TO authenticated, service_role;
