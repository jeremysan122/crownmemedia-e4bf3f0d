-- 1) Assumptions ------------------------------------------------------------
CREATE TABLE public.cloud_cost_assumptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider text NOT NULL DEFAULT 'lovable_cloud',
  metric_key text NOT NULL UNIQUE,
  unit_name text NOT NULL,
  unit_cost numeric NOT NULL DEFAULT 0,
  currency text NOT NULL DEFAULT 'USD',
  notes text,
  updated_by uuid,
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.cloud_cost_assumptions TO authenticated;
GRANT ALL ON public.cloud_cost_assumptions TO service_role;
ALTER TABLE public.cloud_cost_assumptions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "assumptions admin read" ON public.cloud_cost_assumptions
  FOR SELECT TO authenticated USING (is_any_admin(auth.uid()));
CREATE POLICY "assumptions admin write" ON public.cloud_cost_assumptions
  FOR INSERT TO authenticated WITH CHECK (is_any_admin(auth.uid()));
CREATE POLICY "assumptions admin update" ON public.cloud_cost_assumptions
  FOR UPDATE TO authenticated USING (is_any_admin(auth.uid())) WITH CHECK (is_any_admin(auth.uid()));
CREATE POLICY "assumptions admin delete" ON public.cloud_cost_assumptions
  FOR DELETE TO authenticated USING (is_any_admin(auth.uid()));

-- 2) Daily rollups ----------------------------------------------------------
CREATE TABLE public.daily_usage_rollups (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  date date NOT NULL,
  feature text NOT NULL,
  metric_key text NOT NULL,
  total_count bigint NOT NULL DEFAULT 0,
  total_bytes bigint NOT NULL DEFAULT 0,
  estimated_cost numeric NOT NULL DEFAULT 0,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (date, feature, metric_key)
);
CREATE INDEX idx_rollups_date ON public.daily_usage_rollups (date DESC);
CREATE INDEX idx_rollups_feature ON public.daily_usage_rollups (feature, date DESC);
GRANT SELECT ON public.daily_usage_rollups TO authenticated;
GRANT ALL ON public.daily_usage_rollups TO service_role;
ALTER TABLE public.daily_usage_rollups ENABLE ROW LEVEL SECURITY;
CREATE POLICY "rollups admin read" ON public.daily_usage_rollups
  FOR SELECT TO authenticated USING (is_any_admin(auth.uid()));

-- 3) Cost alert rules -------------------------------------------------------
CREATE TABLE public.cost_alert_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  metric_key text NOT NULL,
  feature text,
  threshold_type text NOT NULL,           -- pct_change_dod | pct_change_wow | absolute
  threshold_value numeric NOT NULL,
  comparison_window text NOT NULL DEFAULT '1d',
  is_active boolean NOT NULL DEFAULT true,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.cost_alert_rules TO authenticated;
GRANT ALL ON public.cost_alert_rules TO service_role;
ALTER TABLE public.cost_alert_rules ENABLE ROW LEVEL SECURITY;
CREATE POLICY "rules admin all" ON public.cost_alert_rules
  FOR ALL TO authenticated USING (is_any_admin(auth.uid())) WITH CHECK (is_any_admin(auth.uid()));

-- 4) Cost alerts ledger -----------------------------------------------------
CREATE TABLE public.cost_alerts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  rule_id uuid,
  metric_key text NOT NULL,
  feature text,
  severity text NOT NULL DEFAULT 'warning',
  message text NOT NULL,
  current_value numeric NOT NULL DEFAULT 0,
  previous_value numeric NOT NULL DEFAULT 0,
  percent_change numeric NOT NULL DEFAULT 0,
  acknowledged boolean NOT NULL DEFAULT false,
  acknowledged_by uuid,
  acknowledged_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_cost_alerts_recent ON public.cost_alerts (created_at DESC);
CREATE INDEX idx_cost_alerts_unack ON public.cost_alerts (acknowledged, created_at DESC);
GRANT SELECT, UPDATE ON public.cost_alerts TO authenticated;
GRANT ALL ON public.cost_alerts TO service_role;
ALTER TABLE public.cost_alerts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "cost_alerts admin read" ON public.cost_alerts
  FOR SELECT TO authenticated USING (is_any_admin(auth.uid()));
CREATE POLICY "cost_alerts admin ack" ON public.cost_alerts
  FOR UPDATE TO authenticated USING (is_any_admin(auth.uid())) WITH CHECK (is_any_admin(auth.uid()));

-- 5) Billing reconciliation -------------------------------------------------
CREATE TABLE public.billing_reconciliations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  period_start date NOT NULL,
  period_end date NOT NULL,
  actual_charge_usd numeric NOT NULL,
  estimated_cost_usd numeric NOT NULL DEFAULT 0,
  currency text NOT NULL DEFAULT 'USD',
  notes text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_billing_recon_period ON public.billing_reconciliations (period_start DESC);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.billing_reconciliations TO authenticated;
GRANT ALL ON public.billing_reconciliations TO service_role;
ALTER TABLE public.billing_reconciliations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "billing recon admin all" ON public.billing_reconciliations
  FOR ALL TO authenticated USING (is_any_admin(auth.uid())) WITH CHECK (is_any_admin(auth.uid()));

-- 6) Helper: get a numeric assumption ---------------------------------------
CREATE OR REPLACE FUNCTION public.assumption(_key text, _default numeric DEFAULT 0)
RETURNS numeric LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT COALESCE(
    (SELECT unit_cost FROM public.cloud_cost_assumptions WHERE metric_key = _key),
    _default
  );
$$;
REVOKE ALL ON FUNCTION public.assumption(text, numeric) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.assumption(text, numeric) TO service_role;

-- 7) Daily rollup computation ----------------------------------------------
CREATE OR REPLACE FUNCTION public.compute_daily_usage_rollup(_d date DEFAULT (CURRENT_DATE - 1))
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_catalog AS $$
DECLARE
  v_start timestamptz := _d::timestamptz;
  v_end timestamptz := (_d + 1)::timestamptz;
  v_avg_post_bytes numeric := COALESCE(public.assumption('avg_post_image_bytes', 1500000), 1500000);
  v_avg_avatar_bytes numeric := COALESCE(public.assumption('avg_avatar_bytes', 80000), 80000);
  v_avg_share_card_bytes numeric := COALESCE(public.assumption('avg_share_card_bytes', 350000), 350000);
  v_storage_per_gb_mo numeric := COALESCE(public.assumption('storage_usd_per_gb_month', 0.021), 0.021);
  v_egress_per_gb numeric := COALESCE(public.assumption('egress_usd_per_gb', 0.09), 0.09);
  v_edge_per_million numeric := COALESCE(public.assumption('edge_usd_per_million', 2.00), 2.00);

  rec record;
BEGIN
  -- helper: upsert row
  -- We compute many metrics and upsert them in one shot.

  -- Storage: bucket sizes at end of day (informational; cost charged per GB-month)
  FOR rec IN
    SELECT bucket_id, COALESCE(SUM((metadata->>'size')::bigint), 0) AS bytes
    FROM storage.objects
    WHERE created_at < v_end
    GROUP BY bucket_id
  LOOP
    INSERT INTO public.daily_usage_rollups (date, feature, metric_key, total_count, total_bytes, estimated_cost, metadata)
    VALUES (
      _d,
      CASE rec.bucket_id
        WHEN 'media' THEN 'Feed'
        WHEN 'posts' THEN 'Feed'
        WHEN 'avatars' THEN 'Profile'
        WHEN 'banners' THEN 'Profile'
        WHEN 'dm-attachments' THEN 'DMs'
        ELSE 'Other'
      END,
      'storage_bytes',
      0,
      rec.bytes,
      ROUND(((rec.bytes::numeric / 1073741824.0) * v_storage_per_gb_mo / 30.0)::numeric, 6),
      jsonb_build_object('bucket', rec.bucket_id)
    )
    ON CONFLICT (date, feature, metric_key) DO UPDATE
      SET total_bytes = EXCLUDED.total_bytes,
          estimated_cost = EXCLUDED.estimated_cost,
          metadata = EXCLUDED.metadata,
          updated_at = now();
  END LOOP;

  -- Posts created today (storage growth contribution)
  INSERT INTO public.daily_usage_rollups (date, feature, metric_key, total_count, total_bytes, estimated_cost)
  SELECT _d, 'Feed', 'posts_created',
    COUNT(*),
    (COUNT(*) * v_avg_post_bytes)::bigint,
    0
  FROM public.posts WHERE created_at >= v_start AND created_at < v_end
  ON CONFLICT (date, feature, metric_key) DO UPDATE
    SET total_count = EXCLUDED.total_count, total_bytes = EXCLUDED.total_bytes, updated_at = now();

  -- Votes
  INSERT INTO public.daily_usage_rollups (date, feature, metric_key, total_count, estimated_cost)
  SELECT _d, 'Voting', 'votes', COUNT(*), 0
  FROM public.votes WHERE created_at >= v_start AND created_at < v_end
  ON CONFLICT (date, feature, metric_key) DO UPDATE
    SET total_count = EXCLUDED.total_count, updated_at = now();

  -- Comments
  INSERT INTO public.daily_usage_rollups (date, feature, metric_key, total_count, estimated_cost)
  SELECT _d, 'Comments', 'comments_created', COUNT(*), 0
  FROM public.comments WHERE created_at >= v_start AND created_at < v_end
  ON CONFLICT (date, feature, metric_key) DO UPDATE
    SET total_count = EXCLUDED.total_count, updated_at = now();

  -- Messages
  INSERT INTO public.daily_usage_rollups (date, feature, metric_key, total_count, estimated_cost)
  SELECT _d, 'DMs', 'messages_sent', COUNT(*), 0
  FROM public.messages WHERE created_at >= v_start AND created_at < v_end
  ON CONFLICT (date, feature, metric_key) DO UPDATE
    SET total_count = EXCLUDED.total_count, updated_at = now();

  -- Notifications written
  INSERT INTO public.daily_usage_rollups (date, feature, metric_key, total_count, estimated_cost)
  SELECT _d, 'Notifications', 'notifications_created', COUNT(*), 0
  FROM public.notifications WHERE created_at >= v_start AND created_at < v_end
  ON CONFLICT (date, feature, metric_key) DO UPDATE
    SET total_count = EXCLUDED.total_count, updated_at = now();

  -- Analytics events split by event_name → feature
  FOR rec IN
    SELECT
      CASE
        WHEN event_name LIKE 'feed%' OR event_name = 'post_viewed' THEN 'Feed'
        WHEN event_name LIKE 'scroll%' THEN 'Scrolls'
        WHEN event_name LIKE 'crown_map%' THEN 'Crown Map'
        WHEN event_name LIKE 'leaderboard%' THEN 'Leaderboard'
        WHEN event_name LIKE 'profile%' THEN 'Profile'
        WHEN event_name LIKE 'share_card%' THEN 'Share Cards'
        WHEN event_name LIKE 'dm%' THEN 'DMs'
        WHEN event_name LIKE 'notification%' THEN 'Notifications'
        WHEN event_name LIKE 'verification%' THEN 'Verification'
        WHEN event_name LIKE 'royal_pass%' OR event_name LIKE 'boost%' THEN 'Royal Pass'
        WHEN event_name LIKE 'admin%' THEN 'Admin'
        WHEN event_name LIKE 'vote%' THEN 'Voting'
        WHEN event_name LIKE 'comment%' THEN 'Comments'
        ELSE 'Other'
      END AS feature,
      event_name,
      COUNT(*) AS n,
      -- estimate egress for media-implying events
      CASE
        WHEN event_name = 'share_card_downloaded' THEN (COUNT(*) * v_avg_share_card_bytes)::bigint
        WHEN event_name = 'post_viewed' OR event_name = 'crown_map_marker_opened' THEN (COUNT(*) * v_avg_post_bytes * 0.4)::bigint
        WHEN event_name = 'profile_opened' THEN (COUNT(*) * v_avg_avatar_bytes)::bigint
        ELSE 0
      END AS bytes
    FROM public.analytics_events
    WHERE created_at >= v_start AND created_at < v_end
    GROUP BY 1, 2
  LOOP
    INSERT INTO public.daily_usage_rollups (date, feature, metric_key, total_count, total_bytes, estimated_cost, metadata)
    VALUES (
      _d, rec.feature, rec.event_name, rec.n, COALESCE(rec.bytes, 0),
      CASE WHEN rec.bytes > 0
        THEN ROUND(((rec.bytes::numeric / 1073741824.0) * v_egress_per_gb)::numeric, 6)
        ELSE 0 END,
      jsonb_build_object('source', 'analytics_events')
    )
    ON CONFLICT (date, feature, metric_key) DO UPDATE
      SET total_count = EXCLUDED.total_count,
          total_bytes = EXCLUDED.total_bytes,
          estimated_cost = EXCLUDED.estimated_cost,
          updated_at = now();
  END LOOP;

  -- DAU / new signups / Royal Pass (lightweight)
  INSERT INTO public.daily_usage_rollups (date, feature, metric_key, total_count, estimated_cost)
  SELECT _d, 'Users', 'dau', COUNT(DISTINCT user_hash), 0
  FROM public.analytics_events
  WHERE created_at >= v_start AND created_at < v_end AND user_hash IS NOT NULL
  ON CONFLICT (date, feature, metric_key) DO UPDATE
    SET total_count = EXCLUDED.total_count, updated_at = now();

  INSERT INTO public.daily_usage_rollups (date, feature, metric_key, total_count, estimated_cost)
  SELECT _d, 'Users', 'new_signups', COUNT(*), 0
  FROM public.profiles WHERE created_at >= v_start AND created_at < v_end
  ON CONFLICT (date, feature, metric_key) DO UPDATE
    SET total_count = EXCLUDED.total_count, updated_at = now();
END;
$$;
REVOKE ALL ON FUNCTION public.compute_daily_usage_rollup(date) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.compute_daily_usage_rollup(date) TO service_role;

-- 8) Alert evaluator --------------------------------------------------------
CREATE OR REPLACE FUNCTION public.evaluate_cost_alerts()
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_catalog AS $$
DECLARE
  r record;
  v_today date := CURRENT_DATE - 1;        -- rollups are for completed days
  v_current numeric;
  v_baseline numeric;
  v_change numeric;
  v_fired int := 0;
BEGIN
  FOR r IN SELECT * FROM public.cost_alert_rules WHERE is_active LOOP
    SELECT COALESCE(SUM(CASE WHEN r.metric_key = 'estimated_cost' THEN estimated_cost
                             WHEN r.metric_key = 'total_bytes' THEN total_bytes
                             ELSE total_count END), 0)
      INTO v_current
    FROM public.daily_usage_rollups
    WHERE date = v_today
      AND (r.feature IS NULL OR feature = r.feature)
      AND (r.metric_key IN ('estimated_cost','total_bytes') OR metric_key = r.metric_key);

    IF r.threshold_type = 'absolute' THEN
      v_baseline := 0;
      v_change := v_current;
      IF v_current >= r.threshold_value THEN
        INSERT INTO public.cost_alerts (rule_id, metric_key, feature, severity, message, current_value, previous_value, percent_change)
        VALUES (r.id, r.metric_key, r.feature, 'warning',
          format('%s exceeded absolute threshold %s (current %s)', r.name, r.threshold_value, v_current),
          v_current, 0, 0);
        INSERT INTO public.admin_alerts (severity, category, title, body, metadata)
        VALUES ('warning', 'cloud_spend', r.name,
          format('Metric %s = %s (threshold %s).', r.metric_key, v_current, r.threshold_value),
          jsonb_build_object('rule_id', r.id));
        v_fired := v_fired + 1;
      END IF;
    ELSE
      -- pct_change_dod / pct_change_wow
      SELECT COALESCE(SUM(CASE WHEN r.metric_key = 'estimated_cost' THEN estimated_cost
                               WHEN r.metric_key = 'total_bytes' THEN total_bytes
                               ELSE total_count END), 0)
        INTO v_baseline
      FROM public.daily_usage_rollups
      WHERE date = v_today - CASE WHEN r.threshold_type = 'pct_change_wow' THEN 7 ELSE 1 END
        AND (r.feature IS NULL OR feature = r.feature)
        AND (r.metric_key IN ('estimated_cost','total_bytes') OR metric_key = r.metric_key);

      IF v_baseline > 0 THEN
        v_change := ROUND(((v_current - v_baseline) / v_baseline * 100)::numeric, 2);
        IF v_change >= r.threshold_value THEN
          INSERT INTO public.cost_alerts (rule_id, metric_key, feature, severity, message, current_value, previous_value, percent_change)
          VALUES (r.id, r.metric_key, r.feature,
            CASE WHEN v_change >= r.threshold_value * 2 THEN 'critical' ELSE 'warning' END,
            format('%s up %s%% vs baseline (current %s, was %s)', r.name, v_change, v_current, v_baseline),
            v_current, v_baseline, v_change);
          INSERT INTO public.admin_alerts (severity, category, title, body, metadata)
          VALUES (CASE WHEN v_change >= r.threshold_value * 2 THEN 'critical' ELSE 'warning' END,
            'cloud_spend', r.name,
            format('%s changed %s%% (now %s, baseline %s).', r.metric_key, v_change, v_current, v_baseline),
            jsonb_build_object('rule_id', r.id, 'percent_change', v_change));
          v_fired := v_fired + 1;
        END IF;
      END IF;
    END IF;
  END LOOP;
  RETURN v_fired;
END;
$$;
REVOKE ALL ON FUNCTION public.evaluate_cost_alerts() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.evaluate_cost_alerts() TO service_role;