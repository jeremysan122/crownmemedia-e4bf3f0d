
-- 1. Schema additions
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS is_banned boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS banned_at timestamptz,
  ADD COLUMN IF NOT EXISTS banned_by uuid,
  ADD COLUMN IF NOT EXISTS banned_reason text;

ALTER TABLE public.payouts
  ADD COLUMN IF NOT EXISTS frozen boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS frozen_at timestamptz,
  ADD COLUMN IF NOT EXISTS frozen_by uuid,
  ADD COLUMN IF NOT EXISTS frozen_reason text,
  ADD COLUMN IF NOT EXISTS paid_at timestamptz,
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

ALTER TABLE public.reports
  ADD COLUMN IF NOT EXISTS resolved_by uuid,
  ADD COLUMN IF NOT EXISTS resolution text;

-- 2. Widen audit-log INSERT policy to all admin role variants
DROP POLICY IF EXISTS "Admins insert audit log" ON public.admin_audit_log;
CREATE POLICY "Admins insert audit log"
  ON public.admin_audit_log FOR INSERT TO authenticated
  WITH CHECK (public.is_any_admin(auth.uid()) AND auth.uid() = actor_id);

-- 3. Payouts admin RLS
DROP POLICY IF EXISTS "Payouts admin read" ON public.payouts;
CREATE POLICY "Payouts admin read" ON public.payouts FOR SELECT TO authenticated
  USING (
    auth.uid() = user_id
    OR public.has_role(auth.uid(),'admin'::app_role)
    OR public.has_role(auth.uid(),'super_admin'::app_role)
    OR public.has_role(auth.uid(),'finance_admin'::app_role)
  );

DROP POLICY IF EXISTS "Payouts admin update" ON public.payouts;
CREATE POLICY "Payouts admin update" ON public.payouts FOR UPDATE TO authenticated
  USING (
    public.has_role(auth.uid(),'admin'::app_role)
    OR public.has_role(auth.uid(),'super_admin'::app_role)
    OR public.has_role(auth.uid(),'finance_admin'::app_role)
  )
  WITH CHECK (
    public.has_role(auth.uid(),'admin'::app_role)
    OR public.has_role(auth.uid(),'super_admin'::app_role)
    OR public.has_role(auth.uid(),'finance_admin'::app_role)
  );

-- 4. Widen Reports admin SELECT to include all admin role variants (was admin/moderator only)
DROP POLICY IF EXISTS "Reports admin read all" ON public.reports;
CREATE POLICY "Reports admin read all" ON public.reports FOR SELECT TO authenticated
  USING (public.is_any_admin(auth.uid()));

-- 5. Audit triggers — record every admin-significant change
CREATE OR REPLACE FUNCTION public.trg_audit_post_takedown()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_actor uuid := auth.uid();
BEGIN
  IF v_actor IS NULL OR NOT public.is_any_admin(v_actor) THEN RETURN NEW; END IF;
  IF NEW.is_removed IS DISTINCT FROM OLD.is_removed THEN
    INSERT INTO public.admin_audit_log (actor_id, action, target_type, target_id, details)
    VALUES (v_actor,
      CASE WHEN NEW.is_removed THEN 'post_removed' ELSE 'post_restored' END,
      'post', NEW.id::text,
      jsonb_build_object('owner_id', NEW.user_id, 'category', NEW.category));
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS audit_post_takedown ON public.posts;
CREATE TRIGGER audit_post_takedown AFTER UPDATE ON public.posts
  FOR EACH ROW EXECUTE FUNCTION public.trg_audit_post_takedown();

CREATE OR REPLACE FUNCTION public.trg_audit_profile_state()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_actor uuid := auth.uid();
BEGIN
  IF v_actor IS NULL OR NOT public.is_any_admin(v_actor) THEN RETURN NEW; END IF;
  IF NEW.is_suspended IS DISTINCT FROM OLD.is_suspended THEN
    INSERT INTO public.admin_audit_log (actor_id, action, target_type, target_id, details)
    VALUES (v_actor, CASE WHEN NEW.is_suspended THEN 'user_suspended' ELSE 'user_unsuspended' END,
      'user', NEW.id::text, jsonb_build_object('username', NEW.username));
  END IF;
  IF NEW.is_banned IS DISTINCT FROM OLD.is_banned THEN
    INSERT INTO public.admin_audit_log (actor_id, action, target_type, target_id, details)
    VALUES (v_actor, CASE WHEN NEW.is_banned THEN 'user_banned' ELSE 'user_unbanned' END,
      'user', NEW.id::text, jsonb_build_object('username', NEW.username, 'reason', NEW.banned_reason));
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS audit_profile_state ON public.profiles;
CREATE TRIGGER audit_profile_state AFTER UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.trg_audit_profile_state();

CREATE OR REPLACE FUNCTION public.trg_audit_payout()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_actor uuid := auth.uid(); v_action text;
BEGIN
  IF v_actor IS NULL OR NOT public.is_any_admin(v_actor) THEN RETURN NEW; END IF;
  IF NEW.frozen IS DISTINCT FROM OLD.frozen THEN
    v_action := CASE WHEN NEW.frozen THEN 'payout_frozen' ELSE 'payout_unfrozen' END;
  ELSIF NEW.status IS DISTINCT FROM OLD.status THEN
    v_action := 'payout_status_' || NEW.status;
  ELSE
    RETURN NEW;
  END IF;
  INSERT INTO public.admin_audit_log (actor_id, action, target_type, target_id, details)
  VALUES (v_actor, v_action, 'payout', NEW.id::text,
    jsonb_build_object('user_id', NEW.user_id, 'amount_usd', NEW.amount_usd, 'reason', NEW.frozen_reason));
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS audit_payout ON public.payouts;
CREATE TRIGGER audit_payout AFTER UPDATE ON public.payouts
  FOR EACH ROW EXECUTE FUNCTION public.trg_audit_payout();

CREATE OR REPLACE FUNCTION public.trg_audit_report_resolution()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_actor uuid := auth.uid();
BEGIN
  IF v_actor IS NULL OR NOT public.is_any_admin(v_actor) THEN RETURN NEW; END IF;
  IF NEW.status IS DISTINCT FROM OLD.status THEN
    INSERT INTO public.admin_audit_log (actor_id, action, target_type, target_id, details)
    VALUES (v_actor, 'report_' || NEW.status::text, 'report', NEW.id::text,
      jsonb_build_object('reason', NEW.reason, 'resolution', NEW.resolution,
                         'post_id', NEW.post_id, 'reported_user_id', NEW.reported_user_id));
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS audit_report_resolution ON public.reports;
CREATE TRIGGER audit_report_resolution AFTER UPDATE ON public.reports
  FOR EACH ROW EXECUTE FUNCTION public.trg_audit_report_resolution();

CREATE OR REPLACE FUNCTION public.trg_audit_strike_insert()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_actor uuid := auth.uid();
BEGIN
  IF v_actor IS NULL THEN RETURN NEW; END IF;
  INSERT INTO public.admin_audit_log (actor_id, action, target_type, target_id, details)
  VALUES (v_actor, 'strike_issued', 'user', NEW.user_id::text,
    jsonb_build_object('reason', NEW.reason, 'severity', NEW.severity));
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS audit_strike_insert ON public.user_strikes;
CREATE TRIGGER audit_strike_insert AFTER INSERT ON public.user_strikes
  FOR EACH ROW EXECUTE FUNCTION public.trg_audit_strike_insert();

CREATE OR REPLACE FUNCTION public.trg_audit_role_change()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_actor uuid := auth.uid();
BEGIN
  IF v_actor IS NULL OR NOT public.is_any_admin(v_actor) THEN RETURN COALESCE(NEW, OLD); END IF;
  INSERT INTO public.admin_audit_log (actor_id, action, target_type, target_id, details)
  VALUES (v_actor,
    CASE WHEN TG_OP='INSERT' THEN 'role_granted' ELSE 'role_revoked' END,
    'user', COALESCE(NEW.user_id, OLD.user_id)::text,
    jsonb_build_object('role', COALESCE(NEW.role, OLD.role)));
  RETURN COALESCE(NEW, OLD);
END $$;

DROP TRIGGER IF EXISTS audit_role_change ON public.user_roles;
CREATE TRIGGER audit_role_change AFTER INSERT OR DELETE ON public.user_roles
  FOR EACH ROW EXECUTE FUNCTION public.trg_audit_role_change();

-- 6. Realtime publication additions
DO $$ BEGIN
  PERFORM 1 FROM pg_publication_tables WHERE pubname='supabase_realtime' AND schemaname='public' AND tablename='reports';
  IF NOT FOUND THEN ALTER PUBLICATION supabase_realtime ADD TABLE public.reports; END IF;
END $$;
DO $$ BEGIN
  PERFORM 1 FROM pg_publication_tables WHERE pubname='supabase_realtime' AND schemaname='public' AND tablename='payouts';
  IF NOT FOUND THEN ALTER PUBLICATION supabase_realtime ADD TABLE public.payouts; END IF;
END $$;
DO $$ BEGIN
  PERFORM 1 FROM pg_publication_tables WHERE pubname='supabase_realtime' AND schemaname='public' AND tablename='error_logs';
  IF NOT FOUND THEN ALTER PUBLICATION supabase_realtime ADD TABLE public.error_logs; END IF;
END $$;
DO $$ BEGIN
  PERFORM 1 FROM pg_publication_tables WHERE pubname='supabase_realtime' AND schemaname='public' AND tablename='shekel_ledger';
  IF NOT FOUND THEN ALTER PUBLICATION supabase_realtime ADD TABLE public.shekel_ledger; END IF;
END $$;

ALTER TABLE public.reports REPLICA IDENTITY FULL;
ALTER TABLE public.payouts REPLICA IDENTITY FULL;
