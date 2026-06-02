-- 1. Snapshots table
CREATE TABLE public.db_health_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  captured_at timestamptz NOT NULL DEFAULT now(),
  commits bigint NOT NULL DEFAULT 0,
  rollbacks bigint NOT NULL DEFAULT 0,
  commits_delta bigint NOT NULL DEFAULT 0,
  rollbacks_delta bigint NOT NULL DEFAULT 0,
  rollback_rate numeric NOT NULL DEFAULT 0,
  deadlocks bigint NOT NULL DEFAULT 0,
  deadlocks_delta bigint NOT NULL DEFAULT 0,
  db_size_bytes bigint NOT NULL DEFAULT 0,
  wal_size_bytes bigint NOT NULL DEFAULT 0,
  connections_active integer NOT NULL DEFAULT 0,
  connections_max integer NOT NULL DEFAULT 0,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb
);

CREATE INDEX idx_db_health_snapshots_captured_at
  ON public.db_health_snapshots (captured_at DESC);

GRANT SELECT ON public.db_health_snapshots TO authenticated;
GRANT ALL ON public.db_health_snapshots TO service_role;

ALTER TABLE public.db_health_snapshots ENABLE ROW LEVEL SECURITY;

CREATE POLICY "db_health_snapshots admin read"
  ON public.db_health_snapshots
  FOR SELECT
  TO authenticated
  USING (
    has_role(auth.uid(), 'admin'::app_role)
    OR has_role(auth.uid(), 'super_admin'::app_role)
    OR has_role(auth.uid(), 'security_admin'::app_role)
  );

-- 2. Helper: read current vitals (security definer; admin-callable + service_role)
CREATE OR REPLACE FUNCTION public.get_db_vitals()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
DECLARE
  v_commits bigint := 0;
  v_rollbacks bigint := 0;
  v_deadlocks bigint := 0;
  v_db_size bigint := 0;
  v_wal_size bigint := 0;
  v_conn_active int := 0;
  v_conn_max int := 0;
BEGIN
  SELECT xact_commit, xact_rollback, deadlocks, pg_database_size(datname)
    INTO v_commits, v_rollbacks, v_deadlocks, v_db_size
    FROM pg_stat_database
    WHERE datname = current_database();

  -- WAL size: sum of pg_wal files
  BEGIN
    SELECT COALESCE(SUM(size), 0) INTO v_wal_size FROM pg_ls_waldir();
  EXCEPTION WHEN OTHERS THEN
    v_wal_size := 0;
  END;

  SELECT count(*) INTO v_conn_active FROM pg_stat_activity;
  SELECT setting::int INTO v_conn_max FROM pg_settings WHERE name = 'max_connections';

  RETURN jsonb_build_object(
    'commits', v_commits,
    'rollbacks', v_rollbacks,
    'deadlocks', v_deadlocks,
    'db_size_bytes', v_db_size,
    'wal_size_bytes', v_wal_size,
    'connections_active', v_conn_active,
    'connections_max', v_conn_max
  );
END;
$$;

REVOKE ALL ON FUNCTION public.get_db_vitals() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_db_vitals() TO authenticated, service_role;

-- 3. Snapshot capture function: computes deltas vs prior row, inserts snapshot, fires alerts
CREATE OR REPLACE FUNCTION public.capture_db_health_snapshot()
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
DECLARE
  v jsonb;
  prev public.db_health_snapshots%ROWTYPE;
  v_commits_delta bigint := 0;
  v_rollbacks_delta bigint := 0;
  v_deadlocks_delta bigint := 0;
  v_total_delta bigint := 0;
  v_rate numeric := 0;
  new_id uuid;
  v_wal_pct numeric := 0;
  v_db_pct numeric := 0;
  -- Lovable Cloud default data disk is 8GB; warn relative to that as a soft target
  v_disk_budget_bytes bigint := 8::bigint * 1024 * 1024 * 1024;
BEGIN
  v := public.get_db_vitals();

  SELECT * INTO prev FROM public.db_health_snapshots
    ORDER BY captured_at DESC LIMIT 1;

  IF prev.id IS NOT NULL THEN
    v_commits_delta := GREATEST(0, (v->>'commits')::bigint - prev.commits);
    v_rollbacks_delta := GREATEST(0, (v->>'rollbacks')::bigint - prev.rollbacks);
    v_deadlocks_delta := GREATEST(0, (v->>'deadlocks')::bigint - prev.deadlocks);
  END IF;

  v_total_delta := v_commits_delta + v_rollbacks_delta;
  IF v_total_delta > 0 THEN
    v_rate := round((v_rollbacks_delta::numeric / v_total_delta::numeric) * 100, 2);
  END IF;

  INSERT INTO public.db_health_snapshots (
    commits, rollbacks, commits_delta, rollbacks_delta, rollback_rate,
    deadlocks, deadlocks_delta, db_size_bytes, wal_size_bytes,
    connections_active, connections_max
  ) VALUES (
    (v->>'commits')::bigint,
    (v->>'rollbacks')::bigint,
    v_commits_delta,
    v_rollbacks_delta,
    v_rate,
    (v->>'deadlocks')::bigint,
    v_deadlocks_delta,
    (v->>'db_size_bytes')::bigint,
    (v->>'wal_size_bytes')::bigint,
    (v->>'connections_active')::int,
    (v->>'connections_max')::int
  ) RETURNING id INTO new_id;

  -- Threshold-based alerts (only after we have a prior snapshot so deltas are meaningful)
  IF prev.id IS NOT NULL AND v_total_delta >= 200 THEN
    IF v_rate >= 25 THEN
      INSERT INTO public.admin_alerts (severity, category, title, body, metadata)
      VALUES ('critical', 'db_health', 'Rollback rate critical',
        format('Rollback rate is %s%% over the last interval (%s rollbacks of %s txns).',
          v_rate, v_rollbacks_delta, v_total_delta),
        jsonb_build_object('rollback_rate', v_rate, 'window_txns', v_total_delta));
    ELSIF v_rate >= 15 THEN
      INSERT INTO public.admin_alerts (severity, category, title, body, metadata)
      VALUES ('warning', 'db_health', 'Rollback rate elevated',
        format('Rollback rate is %s%% over the last interval (%s rollbacks of %s txns).',
          v_rate, v_rollbacks_delta, v_total_delta),
        jsonb_build_object('rollback_rate', v_rate, 'window_txns', v_total_delta));
    END IF;
  END IF;

  -- Disk / WAL pressure alerts (relative to soft 8GB budget; informational)
  v_wal_pct := round(((v->>'wal_size_bytes')::numeric / v_disk_budget_bytes::numeric) * 100, 1);
  v_db_pct  := round((((v->>'db_size_bytes')::bigint + (v->>'wal_size_bytes')::bigint)::numeric
                       / v_disk_budget_bytes::numeric) * 100, 1);

  IF v_db_pct >= 90 THEN
    INSERT INTO public.admin_alerts (severity, category, title, body, metadata)
    VALUES ('critical', 'db_health', 'Database disk usage critical',
      format('Combined DB + WAL is %s%% of the 8GB soft budget. Increase database disk size.', v_db_pct),
      jsonb_build_object('db_pct', v_db_pct, 'wal_pct', v_wal_pct));
  ELSIF v_db_pct >= 75 THEN
    INSERT INTO public.admin_alerts (severity, category, title, body, metadata)
    VALUES ('warning', 'db_health', 'Database disk usage elevated',
      format('Combined DB + WAL is %s%% of the 8GB soft budget.', v_db_pct),
      jsonb_build_object('db_pct', v_db_pct, 'wal_pct', v_wal_pct));
  END IF;

  RETURN new_id;
END;
$$;

REVOKE ALL ON FUNCTION public.capture_db_health_snapshot() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.capture_db_health_snapshot() TO service_role;
