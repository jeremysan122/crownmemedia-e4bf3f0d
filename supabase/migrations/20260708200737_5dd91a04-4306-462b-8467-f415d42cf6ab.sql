
-- ============================================================
-- 1) verification_requests: block non-admin edits to protected fields
-- ============================================================
CREATE OR REPLACE FUNCTION public.verification_requests_guard_protected_fields()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  is_admin boolean := false;
BEGIN
  -- service_role bypasses (webhooks, admin RPC runs as definer)
  IF current_setting('role', true) = 'service_role' THEN
    RETURN NEW;
  END IF;

  BEGIN
    is_admin := public.has_role(auth.uid(), 'admin'::app_role);
  EXCEPTION WHEN others THEN
    is_admin := false;
  END;

  IF is_admin THEN
    RETURN NEW;
  END IF;

  IF NEW.status               IS DISTINCT FROM OLD.status
  OR NEW.reviewer_id          IS DISTINCT FROM OLD.reviewer_id
  OR NEW.review_notes         IS DISTINCT FROM OLD.review_notes
  OR NEW.reviewed_at          IS DISTINCT FROM OLD.reviewed_at
  OR NEW.subscription_id      IS DISTINCT FROM OLD.subscription_id
  OR NEW.subscription_active  IS DISTINCT FROM OLD.subscription_active
  OR NEW.subscription_renews_at IS DISTINCT FROM OLD.subscription_renews_at
  OR NEW.user_id              IS DISTINCT FROM OLD.user_id
  THEN
    RAISE EXCEPTION 'Not permitted to modify protected verification fields'
      USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END
$$;

DROP TRIGGER IF EXISTS verification_requests_guard_protected ON public.verification_requests;
CREATE TRIGGER verification_requests_guard_protected
  BEFORE UPDATE ON public.verification_requests
  FOR EACH ROW EXECUTE FUNCTION public.verification_requests_guard_protected_fields();

-- ============================================================
-- 2) sensitive_appeals: remove direct UPDATE access, gate via RPCs
-- ============================================================

-- Drop user + mod update policies; only service_role writes directly.
DROP POLICY IF EXISTS "Users can withdraw own appeals" ON public.sensitive_appeals;
DROP POLICY IF EXISTS "Mods decide appeals"           ON public.sensitive_appeals;

-- Revoke table-level UPDATE from authenticated. Users/mods must use RPCs.
REVOKE UPDATE ON public.sensitive_appeals FROM authenticated;

-- Withdraw own pending appeal (safe, fixed action).
CREATE OR REPLACE FUNCTION public.withdraw_my_sensitive_appeal(_appeal_id uuid)
RETURNS public.sensitive_appeals
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row public.sensitive_appeals;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_row
  FROM public.sensitive_appeals
  WHERE id = _appeal_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Appeal not found' USING ERRCODE = 'P0002';
  END IF;

  IF v_row.user_id <> auth.uid() THEN
    RAISE EXCEPTION 'Not permitted' USING ERRCODE = '42501';
  END IF;

  IF v_row.status NOT IN ('pending'::sensitive_appeal_status, 'under_review'::sensitive_appeal_status) THEN
    RAISE EXCEPTION 'Only pending appeals can be withdrawn' USING ERRCODE = '22023';
  END IF;

  UPDATE public.sensitive_appeals
     SET status = 'withdrawn'::sensitive_appeal_status,
         updated_at = now()
   WHERE id = _appeal_id
   RETURNING * INTO v_row;

  RETURN v_row;
END
$$;

REVOKE ALL ON FUNCTION public.withdraw_my_sensitive_appeal(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.withdraw_my_sensitive_appeal(uuid) TO authenticated;

-- Moderator/admin decision path.
CREATE OR REPLACE FUNCTION public.admin_decide_sensitive_appeal(
  _appeal_id uuid,
  _decision  text,
  _notes     text DEFAULT NULL
)
RETURNS public.sensitive_appeals
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row public.sensitive_appeals;
  v_new_status public.sensitive_appeal_status;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '42501';
  END IF;
  IF NOT (public.has_role(auth.uid(), 'admin'::app_role)
          OR public.has_role(auth.uid(), 'moderator'::app_role)) THEN
    RAISE EXCEPTION 'Moderator or admin role required' USING ERRCODE = '42501';
  END IF;

  IF _decision NOT IN ('approved','denied','under_review') THEN
    RAISE EXCEPTION 'Invalid decision' USING ERRCODE = '22023';
  END IF;
  v_new_status := _decision::public.sensitive_appeal_status;

  SELECT * INTO v_row FROM public.sensitive_appeals WHERE id = _appeal_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Appeal not found' USING ERRCODE = 'P0002';
  END IF;

  UPDATE public.sensitive_appeals
     SET status          = v_new_status,
         moderator_notes = _notes,
         decided_by      = CASE WHEN v_new_status IN ('approved','denied') THEN auth.uid() ELSE decided_by END,
         decided_at      = CASE WHEN v_new_status IN ('approved','denied') THEN now()      ELSE decided_at END,
         updated_at      = now()
   WHERE id = _appeal_id
   RETURNING * INTO v_row;

  -- Best-effort audit log
  BEGIN
    INSERT INTO public.moderation_audit (actor_id, action, target_type, target_id, reason)
    VALUES (auth.uid(), 'sensitive_appeal_' || _decision, 'sensitive_appeal', _appeal_id, _notes);
  EXCEPTION WHEN others THEN
    -- audit failure must not block moderation
    NULL;
  END;

  RETURN v_row;
END
$$;

REVOKE ALL ON FUNCTION public.admin_decide_sensitive_appeal(uuid, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_decide_sensitive_appeal(uuid, text, text) TO authenticated;
