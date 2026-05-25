-- Helper: any-admin check (treats super_admin and admin equivalently for read)
CREATE OR REPLACE FUNCTION public.is_any_admin(_uid uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _uid
      AND role IN ('admin','super_admin','finance_admin','security_admin','content_admin','support_admin')
  );
$$;
REVOKE EXECUTE ON FUNCTION public.is_any_admin(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_any_admin(uuid) TO authenticated;

-- =========================================================
-- 1. admin_alerts
-- =========================================================
CREATE TABLE public.admin_alerts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  severity text NOT NULL CHECK (severity IN ('info','warning','critical')),
  category text NOT NULL,
  title text NOT NULL,
  body text NOT NULL DEFAULT '',
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  acknowledged boolean NOT NULL DEFAULT false,
  acknowledged_by uuid,
  acknowledged_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.admin_alerts ENABLE ROW LEVEL SECURITY;
CREATE INDEX idx_admin_alerts_created ON public.admin_alerts (created_at DESC);
CREATE INDEX idx_admin_alerts_unack ON public.admin_alerts (acknowledged, created_at DESC);
CREATE POLICY "admin_alerts read" ON public.admin_alerts FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'super_admin') OR public.has_role(auth.uid(),'security_admin'));
CREATE POLICY "admin_alerts ack" ON public.admin_alerts FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'super_admin') OR public.has_role(auth.uid(),'security_admin'))
  WITH CHECK (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'super_admin') OR public.has_role(auth.uid(),'security_admin'));

-- =========================================================
-- 2. platform_settings
-- =========================================================
CREATE TABLE public.platform_settings (
  key text PRIMARY KEY,
  value jsonb NOT NULL DEFAULT '{}'::jsonb,
  description text NOT NULL DEFAULT '',
  updated_by uuid,
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.platform_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "platform_settings read" ON public.platform_settings FOR SELECT TO authenticated
  USING (public.is_any_admin(auth.uid()));
CREATE POLICY "platform_settings write" ON public.platform_settings FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'super_admin'))
  WITH CHECK (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'super_admin'));

-- =========================================================
-- 3. error_logs
-- =========================================================
CREATE TABLE public.error_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source text NOT NULL,
  level text NOT NULL DEFAULT 'error' CHECK (level IN ('warn','error','fatal')),
  message text NOT NULL,
  stack text,
  user_id uuid,
  url text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.error_logs ENABLE ROW LEVEL SECURITY;
CREATE INDEX idx_error_logs_created ON public.error_logs (created_at DESC);
CREATE INDEX idx_error_logs_level ON public.error_logs (level, created_at DESC);
CREATE POLICY "error_logs read" ON public.error_logs FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'super_admin') OR public.has_role(auth.uid(),'security_admin'));
CREATE POLICY "error_logs insert" ON public.error_logs FOR INSERT TO authenticated
  WITH CHECK (auth.uid() IS NOT NULL AND length(message) <= 2000);

-- =========================================================
-- 4. admin_sessions
-- =========================================================
CREATE TABLE public.admin_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_id uuid NOT NULL,
  ip_address text,
  user_agent text,
  started_at timestamptz NOT NULL DEFAULT now(),
  ended_at timestamptz,
  last_seen_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.admin_sessions ENABLE ROW LEVEL SECURITY;
CREATE INDEX idx_admin_sessions_admin ON public.admin_sessions (admin_id, started_at DESC);
CREATE POLICY "admin_sessions read" ON public.admin_sessions FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'super_admin') OR public.has_role(auth.uid(),'security_admin') OR auth.uid() = admin_id);
CREATE POLICY "admin_sessions self insert" ON public.admin_sessions FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = admin_id AND public.is_any_admin(auth.uid()));
CREATE POLICY "admin_sessions self update" ON public.admin_sessions FOR UPDATE TO authenticated
  USING (auth.uid() = admin_id) WITH CHECK (auth.uid() = admin_id);

-- =========================================================
-- 5. moderation_queue
-- =========================================================
CREATE TABLE public.moderation_queue (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  target_type text NOT NULL CHECK (target_type IN ('post','comment','user','message')),
  target_id uuid NOT NULL,
  reason text NOT NULL,
  priority text NOT NULL DEFAULT 'normal' CHECK (priority IN ('low','normal','high','urgent')),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','in_review','resolved','dismissed')),
  assigned_to uuid,
  resolved_by uuid,
  resolved_at timestamptz,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.moderation_queue ENABLE ROW LEVEL SECURITY;
CREATE INDEX idx_modq_status ON public.moderation_queue (status, priority, created_at DESC);
CREATE POLICY "modq read" ON public.moderation_queue FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'super_admin') OR public.has_role(auth.uid(),'content_admin') OR public.has_role(auth.uid(),'moderator'));
CREATE POLICY "modq write" ON public.moderation_queue FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'super_admin') OR public.has_role(auth.uid(),'content_admin') OR public.has_role(auth.uid(),'moderator'))
  WITH CHECK (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'super_admin') OR public.has_role(auth.uid(),'content_admin') OR public.has_role(auth.uid(),'moderator'));
CREATE TRIGGER trg_modq_touch BEFORE UPDATE ON public.moderation_queue
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- =========================================================
-- 6. user_strikes
-- =========================================================
CREATE TABLE public.user_strikes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  issued_by uuid NOT NULL,
  reason text NOT NULL,
  severity text NOT NULL DEFAULT 'minor' CHECK (severity IN ('minor','major','severe')),
  expires_at timestamptz,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.user_strikes ENABLE ROW LEVEL SECURITY;
CREATE INDEX idx_user_strikes_user ON public.user_strikes (user_id, created_at DESC);
CREATE POLICY "user_strikes read self" ON public.user_strikes FOR SELECT TO authenticated
  USING (auth.uid() = user_id OR public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'super_admin') OR public.has_role(auth.uid(),'content_admin') OR public.has_role(auth.uid(),'moderator'));
CREATE POLICY "user_strikes write" ON public.user_strikes FOR INSERT TO authenticated
  WITH CHECK ((public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'super_admin') OR public.has_role(auth.uid(),'content_admin') OR public.has_role(auth.uid(),'moderator')) AND auth.uid() = issued_by);

-- =========================================================
-- 7. finance_snapshots
-- =========================================================
CREATE TABLE public.finance_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  snapshot_date date NOT NULL UNIQUE,
  revenue_usd numeric NOT NULL DEFAULT 0,
  payouts_usd numeric NOT NULL DEFAULT 0,
  refunds_usd numeric NOT NULL DEFAULT 0,
  net_usd numeric NOT NULL DEFAULT 0,
  active_subscriptions int NOT NULL DEFAULT 0,
  new_subscriptions int NOT NULL DEFAULT 0,
  canceled_subscriptions int NOT NULL DEFAULT 0,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.finance_snapshots ENABLE ROW LEVEL SECURITY;
CREATE POLICY "finance_snapshots read" ON public.finance_snapshots FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'super_admin') OR public.has_role(auth.uid(),'finance_admin'));

-- =========================================================
-- 8. content_takedowns
-- =========================================================
CREATE TABLE public.content_takedowns (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  target_type text NOT NULL CHECK (target_type IN ('post','comment','message','user')),
  target_id uuid NOT NULL,
  removed_by uuid NOT NULL,
  reason text NOT NULL,
  reason_code text,
  notes text,
  reversible boolean NOT NULL DEFAULT true,
  reversed_at timestamptz,
  reversed_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.content_takedowns ENABLE ROW LEVEL SECURITY;
CREATE INDEX idx_takedowns_created ON public.content_takedowns (created_at DESC);
CREATE POLICY "takedowns read" ON public.content_takedowns FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'super_admin') OR public.has_role(auth.uid(),'content_admin') OR public.has_role(auth.uid(),'moderator'));
CREATE POLICY "takedowns write" ON public.content_takedowns FOR INSERT TO authenticated
  WITH CHECK ((public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'super_admin') OR public.has_role(auth.uid(),'content_admin') OR public.has_role(auth.uid(),'moderator')) AND auth.uid() = removed_by);
CREATE POLICY "takedowns reverse" ON public.content_takedowns FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'super_admin') OR public.has_role(auth.uid(),'content_admin'))
  WITH CHECK (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'super_admin') OR public.has_role(auth.uid(),'content_admin'));

-- =========================================================
-- 9. support_tickets
-- =========================================================
CREATE TABLE public.support_tickets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  subject text NOT NULL,
  body text NOT NULL,
  category text NOT NULL DEFAULT 'general',
  priority text NOT NULL DEFAULT 'normal' CHECK (priority IN ('low','normal','high','urgent')),
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open','in_progress','waiting_user','resolved','closed')),
  assigned_to uuid,
  resolved_at timestamptz,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.support_tickets ENABLE ROW LEVEL SECURITY;
CREATE INDEX idx_support_tickets_status ON public.support_tickets (status, priority, created_at DESC);
CREATE POLICY "tickets read self" ON public.support_tickets FOR SELECT TO authenticated
  USING (auth.uid() = user_id OR public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'super_admin') OR public.has_role(auth.uid(),'support_admin'));
CREATE POLICY "tickets create self" ON public.support_tickets FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id AND length(subject) BETWEEN 3 AND 200 AND length(body) BETWEEN 10 AND 4000);
CREATE POLICY "tickets update admin" ON public.support_tickets FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'super_admin') OR public.has_role(auth.uid(),'support_admin'))
  WITH CHECK (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'super_admin') OR public.has_role(auth.uid(),'support_admin'));
CREATE TRIGGER trg_tickets_touch BEFORE UPDATE ON public.support_tickets
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- =========================================================
-- 10. admin_broadcasts
-- =========================================================
CREATE TABLE public.admin_broadcasts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  body text NOT NULL,
  audience text NOT NULL DEFAULT 'all' CHECK (audience IN ('all','royal_pass','non_pass','admins','region')),
  region jsonb NOT NULL DEFAULT '{}'::jsonb,
  scheduled_for timestamptz,
  sent_at timestamptz,
  created_by uuid NOT NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.admin_broadcasts ENABLE ROW LEVEL SECURITY;
CREATE INDEX idx_broadcasts_created ON public.admin_broadcasts (created_at DESC);
CREATE POLICY "broadcasts read" ON public.admin_broadcasts FOR SELECT TO authenticated
  USING (public.is_any_admin(auth.uid()));
CREATE POLICY "broadcasts write" ON public.admin_broadcasts FOR INSERT TO authenticated
  WITH CHECK ((public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'super_admin') OR public.has_role(auth.uid(),'support_admin')) AND auth.uid() = created_by);
CREATE POLICY "broadcasts update" ON public.admin_broadcasts FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'super_admin') OR public.has_role(auth.uid(),'support_admin'))
  WITH CHECK (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'super_admin') OR public.has_role(auth.uid(),'support_admin'));

-- =========================================================
-- Audit trigger: writes to admin_audit_log on changes to sensitive tables
-- =========================================================
CREATE OR REPLACE FUNCTION public.trg_admin_audit()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_actor uuid := auth.uid(); v_email text;
BEGIN
  IF v_actor IS NULL THEN RETURN COALESCE(NEW, OLD); END IF;
  SELECT email INTO v_email FROM public.profiles_private WHERE id = v_actor;
  INSERT INTO public.admin_audit_log (actor_id, actor_email, action, target_type, target_id, details)
  VALUES (
    v_actor, v_email,
    TG_OP || ':' || TG_TABLE_NAME,
    TG_TABLE_NAME,
    COALESCE((NEW).id::text, (OLD).id::text),
    jsonb_build_object('op', TG_OP, 'new', to_jsonb(NEW), 'old', to_jsonb(OLD))
  );
  RETURN COALESCE(NEW, OLD);
END $$;

CREATE TRIGGER trg_audit_platform_settings AFTER INSERT OR UPDATE OR DELETE ON public.platform_settings
  FOR EACH ROW EXECUTE FUNCTION public.trg_admin_audit();
CREATE TRIGGER trg_audit_takedowns AFTER INSERT OR UPDATE ON public.content_takedowns
  FOR EACH ROW EXECUTE FUNCTION public.trg_admin_audit();
CREATE TRIGGER trg_audit_user_strikes AFTER INSERT ON public.user_strikes
  FOR EACH ROW EXECUTE FUNCTION public.trg_admin_audit();
CREATE TRIGGER trg_audit_broadcasts AFTER INSERT OR UPDATE ON public.admin_broadcasts
  FOR EACH ROW EXECUTE FUNCTION public.trg_admin_audit();
CREATE TRIGGER trg_audit_modq AFTER UPDATE ON public.moderation_queue
  FOR EACH ROW EXECUTE FUNCTION public.trg_admin_audit();