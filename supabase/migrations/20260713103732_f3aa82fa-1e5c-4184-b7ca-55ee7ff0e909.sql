
-- Wave 2: Event emitters, idempotent batch processor, time-based evaluator

-- ============================================================================
-- 1) EMITTER: idempotent event insertion
-- ============================================================================
CREATE OR REPLACE FUNCTION public.emit_achievement_event(
  _user_id uuid,
  _event_type text,
  _source_table text DEFAULT NULL,
  _source_id uuid DEFAULT NULL,
  _delta jsonb DEFAULT '{}'::jsonb,
  _event_key text DEFAULT NULL,
  _occurred_at timestamptz DEFAULT now()
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_key text;
  v_id uuid;
BEGIN
  IF _user_id IS NULL OR _event_type IS NULL THEN
    RAISE EXCEPTION 'user_id and event_type are required';
  END IF;

  -- Derive idempotency key when not provided (prefer source-based to prevent double emission)
  v_key := COALESCE(
    _event_key,
    CASE WHEN _source_table IS NOT NULL AND _source_id IS NOT NULL
         THEN _event_type || ':' || _source_table || ':' || _source_id::text
         ELSE _event_type || ':' || _user_id::text || ':' || encode(gen_random_bytes(8),'hex')
    END
  );

  INSERT INTO public.achievement_progress_events
    (user_id, event_type, source_table, source_id, delta, event_key, occurred_at, processing_status)
  VALUES
    (_user_id, _event_type, _source_table, _source_id, COALESCE(_delta,'{}'::jsonb), v_key, _occurred_at, 'pending')
  ON CONFLICT (event_key) DO NOTHING
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

REVOKE ALL ON FUNCTION public.emit_achievement_event(uuid,text,text,uuid,jsonb,text,timestamptz) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.emit_achievement_event(uuid,text,text,uuid,jsonb,text,timestamptz) TO authenticated, service_role;

-- Ensure event_key uniqueness for idempotency (safe if already exists)
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes WHERE schemaname='public' AND indexname='achievement_progress_events_event_key_key'
  ) THEN
    BEGIN
      ALTER TABLE public.achievement_progress_events ADD CONSTRAINT achievement_progress_events_event_key_key UNIQUE (event_key);
    EXCEPTION WHEN duplicate_table OR duplicate_object THEN NULL;
    END;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS achievement_progress_events_pending_idx
  ON public.achievement_progress_events (occurred_at)
  WHERE processing_status = 'pending';

-- ============================================================================
-- 2) QUALIFIED ACTIVE DAY tracker (time-based fairness)
-- ============================================================================
CREATE OR REPLACE FUNCTION public.record_qualified_active_day(
  _user_id uuid,
  _event_type text,
  _event_id uuid DEFAULT NULL,
  _occurred_at timestamptz DEFAULT now()
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.user_active_days
    (user_id, activity_date, first_qualifying_event_type, first_qualifying_event_id, qualifying_action_count)
  VALUES
    (_user_id, (_occurred_at AT TIME ZONE 'UTC')::date, _event_type, _event_id, 1)
  ON CONFLICT (user_id, activity_date)
  DO UPDATE SET qualifying_action_count = public.user_active_days.qualifying_action_count + 1;
END;
$$;

REVOKE ALL ON FUNCTION public.record_qualified_active_day(uuid,text,uuid,timestamptz) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.record_qualified_active_day(uuid,text,uuid,timestamptz) TO authenticated, service_role;

-- Ensure uniqueness for upsert
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes WHERE schemaname='public' AND indexname='user_active_days_user_date_key'
  ) THEN
    BEGIN
      ALTER TABLE public.user_active_days ADD CONSTRAINT user_active_days_user_date_key UNIQUE (user_id, activity_date);
    EXCEPTION WHEN duplicate_table OR duplicate_object THEN NULL;
    END;
  END IF;
END $$;

-- ============================================================================
-- 3) EVALUATOR: recompute progress/completion for one (user, achievement)
-- ============================================================================
CREATE OR REPLACE FUNCTION public.evaluate_user_achievement(
  _user_id uuid,
  _achievement_id uuid
)
RETURNS TABLE(completion_percent numeric, highest_checkpoint int, status text, gates_ok boolean)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_def public.achievement_definitions;
  v_progress jsonb;
  v_metrics jsonb;
  v_key text;
  v_needed numeric;
  v_have numeric;
  v_metric_pct numeric;
  v_min_pct numeric := 100;
  v_completion numeric := 0;
  v_checkpoint int := 0;
  v_status text := 'in_progress';
  v_gates_ok boolean := true;
  v_account_age int;
  v_qad int;
  v_weeks int;
BEGIN
  SELECT * INTO v_def FROM public.achievement_definitions WHERE id = _achievement_id AND is_active = true;
  IF NOT FOUND THEN
    RETURN QUERY SELECT 0::numeric, 0, 'not_found'::text, false;
    RETURN;
  END IF;

  SELECT p.progress INTO v_progress
    FROM public.user_achievement_progress p
   WHERE p.user_id = _user_id AND p.achievement_id = _achievement_id;
  v_progress := COALESCE(v_progress, '{}'::jsonb);

  -- Compute gate state
  SELECT EXTRACT(EPOCH FROM (now() - u.created_at))/86400 INTO v_account_age FROM auth.users u WHERE u.id = _user_id;
  SELECT count(*) INTO v_qad FROM public.user_active_days WHERE user_id = _user_id;
  SELECT count(DISTINCT date_trunc('week', activity_date)) INTO v_weeks FROM public.user_active_days WHERE user_id = _user_id;

  IF COALESCE(v_def.minimum_account_age_days,0) > COALESCE(v_account_age,0) THEN v_gates_ok := false; END IF;
  IF COALESCE(v_def.minimum_qualified_active_days,0) > COALESCE(v_qad,0) THEN v_gates_ok := false; END IF;
  IF COALESCE(v_def.minimum_distinct_active_weeks,0) > COALESCE(v_weeks,0) THEN v_gates_ok := false; END IF;

  -- Compute completion as MIN(metric_pct) across all required metrics
  v_metrics := COALESCE(v_def.requirement_logic->'metrics', '{}'::jsonb);
  IF jsonb_typeof(v_metrics) = 'object' AND (SELECT count(*) FROM jsonb_object_keys(v_metrics)) > 0 THEN
    FOR v_key IN SELECT * FROM jsonb_object_keys(v_metrics) LOOP
      v_needed := NULLIF(v_metrics->>v_key,'')::numeric;
      v_have := COALESCE(NULLIF(v_progress->>v_key,'')::numeric, 0);
      IF v_needed IS NULL OR v_needed <= 0 THEN CONTINUE; END IF;
      v_metric_pct := LEAST(100, (v_have / v_needed) * 100);
      IF v_metric_pct < v_min_pct THEN v_min_pct := v_metric_pct; END IF;
    END LOOP;
    v_completion := v_min_pct;
  ELSE
    v_completion := 0;
  END IF;

  -- Highest checkpoint reached
  IF v_completion >= 100 THEN v_checkpoint := 100;
  ELSIF v_completion >= 75 THEN v_checkpoint := 75;
  ELSIF v_completion >= 50 THEN v_checkpoint := 50;
  ELSIF v_completion >= 25 THEN v_checkpoint := 25;
  ELSE v_checkpoint := 0;
  END IF;

  IF v_completion >= 100 AND v_gates_ok THEN
    v_status := 'completed';
  ELSIF v_completion >= 100 AND NOT v_gates_ok THEN
    v_status := 'gated';
  ELSE
    v_status := 'in_progress';
  END IF;

  -- Persist
  INSERT INTO public.user_achievement_progress
    (user_id, achievement_id, progress, completion_percent, highest_checkpoint, status, started_at, last_progress_at)
  VALUES
    (_user_id, _achievement_id, v_progress, v_completion, v_checkpoint, v_status, now(), now())
  ON CONFLICT (user_id, achievement_id) DO UPDATE
    SET completion_percent = EXCLUDED.completion_percent,
        highest_checkpoint = GREATEST(public.user_achievement_progress.highest_checkpoint, EXCLUDED.highest_checkpoint),
        status = EXCLUDED.status,
        last_progress_at = now(),
        completed_at = CASE WHEN EXCLUDED.status='completed' AND public.user_achievement_progress.completed_at IS NULL THEN now() ELSE public.user_achievement_progress.completed_at END,
        version = public.user_achievement_progress.version + 1,
        updated_at = now();

  RETURN QUERY SELECT v_completion, v_checkpoint, v_status, v_gates_ok;
END;
$$;

REVOKE ALL ON FUNCTION public.evaluate_user_achievement(uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.evaluate_user_achievement(uuid,uuid) TO service_role;

-- Ensure progress uniqueness (user, achievement)
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes WHERE schemaname='public' AND indexname='user_achievement_progress_user_ach_key'
  ) THEN
    BEGIN
      ALTER TABLE public.user_achievement_progress ADD CONSTRAINT user_achievement_progress_user_ach_key UNIQUE (user_id, achievement_id);
    EXCEPTION WHEN duplicate_table OR duplicate_object THEN NULL;
    END;
  END IF;
END $$;

-- ============================================================================
-- 4) BATCH PROCESSOR: idempotent, advisory-locked
-- ============================================================================
CREATE OR REPLACE FUNCTION public.process_achievement_events_batch(
  _batch_size int DEFAULT 500
)
RETURNS TABLE(processed int, failed int, affected_progress int)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_processed int := 0;
  v_failed int := 0;
  v_affected int := 0;
  v_evt record;
  v_ach record;
  v_metric_key text;
  v_delta_val numeric;
  v_new_progress jsonb;
BEGIN
  -- Serialize batch runs
  IF NOT pg_try_advisory_xact_lock(hashtext('process_achievement_events_batch')) THEN
    RETURN QUERY SELECT 0,0,0;
    RETURN;
  END IF;

  FOR v_evt IN
    SELECT id, user_id, event_type, delta
      FROM public.achievement_progress_events
     WHERE processing_status = 'pending'
     ORDER BY occurred_at ASC
     LIMIT _batch_size
     FOR UPDATE SKIP LOCKED
  LOOP
    BEGIN
      -- Fan out to every active achievement whose requirement_logic.metrics references this event's delta keys
      -- We treat delta keys as canonical metric names; achievements accumulate any matching metric.
      FOR v_ach IN
        SELECT DISTINCT ad.id
          FROM public.achievement_definitions ad,
               jsonb_object_keys(ad.requirement_logic->'metrics') mk
         WHERE ad.is_active = true
           AND (v_evt.delta ? mk)
      LOOP
        -- Merge deltas into progress jsonb
        SELECT COALESCE(p.progress,'{}'::jsonb) INTO v_new_progress
          FROM public.user_achievement_progress p
         WHERE p.user_id = v_evt.user_id AND p.achievement_id = v_ach.id;
        v_new_progress := COALESCE(v_new_progress,'{}'::jsonb);

        FOR v_metric_key IN SELECT * FROM jsonb_object_keys(v_evt.delta) LOOP
          v_delta_val := NULLIF(v_evt.delta->>v_metric_key,'')::numeric;
          IF v_delta_val IS NULL THEN CONTINUE; END IF;
          v_new_progress := jsonb_set(
            v_new_progress,
            ARRAY[v_metric_key],
            to_jsonb(COALESCE(NULLIF(v_new_progress->>v_metric_key,'')::numeric,0) + v_delta_val)
          );
        END LOOP;

        INSERT INTO public.user_achievement_progress
          (user_id, achievement_id, progress, started_at, last_progress_at)
        VALUES
          (v_evt.user_id, v_ach.id, v_new_progress, now(), now())
        ON CONFLICT (user_id, achievement_id) DO UPDATE
          SET progress = EXCLUDED.progress,
              last_progress_at = now(),
              version = public.user_achievement_progress.version + 1,
              updated_at = now();

        PERFORM public.evaluate_user_achievement(v_evt.user_id, v_ach.id);
        v_affected := v_affected + 1;
      END LOOP;

      UPDATE public.achievement_progress_events
         SET processing_status='processed', processed_at=now()
       WHERE id = v_evt.id;
      v_processed := v_processed + 1;
    EXCEPTION WHEN OTHERS THEN
      UPDATE public.achievement_progress_events
         SET processing_status='failed',
             error_message=SQLERRM,
             retry_count = COALESCE(retry_count,0) + 1
       WHERE id = v_evt.id;
      v_failed := v_failed + 1;
    END;
  END LOOP;

  RETURN QUERY SELECT v_processed, v_failed, v_affected;
END;
$$;

REVOKE ALL ON FUNCTION public.process_achievement_events_batch(int) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.process_achievement_events_batch(int) TO service_role;

-- ============================================================================
-- 5) TIME-BASED EVALUATOR: re-check gated rows whose gates may now clear
-- ============================================================================
CREATE OR REPLACE FUNCTION public.evaluate_time_based_achievements(
  _limit int DEFAULT 1000
)
RETURNS TABLE(reevaluated int, unlocked int)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row record;
  v_reeval int := 0;
  v_unlocked int := 0;
  v_res record;
BEGIN
  IF NOT pg_try_advisory_xact_lock(hashtext('evaluate_time_based_achievements')) THEN
    RETURN QUERY SELECT 0,0;
    RETURN;
  END IF;

  FOR v_row IN
    SELECT p.user_id, p.achievement_id, p.status
      FROM public.user_achievement_progress p
      JOIN public.achievement_definitions d ON d.id = p.achievement_id
     WHERE p.status IN ('gated','in_progress')
       AND p.completion_percent >= 25
       AND (
             COALESCE(d.minimum_account_age_days,0) > 0
          OR COALESCE(d.minimum_qualified_active_days,0) > 0
          OR COALESCE(d.minimum_distinct_active_weeks,0) > 0
       )
     ORDER BY p.last_progress_at ASC NULLS FIRST
     LIMIT _limit
  LOOP
    SELECT * INTO v_res FROM public.evaluate_user_achievement(v_row.user_id, v_row.achievement_id);
    v_reeval := v_reeval + 1;
    IF v_res.status = 'completed' AND v_row.status <> 'completed' THEN
      v_unlocked := v_unlocked + 1;
    END IF;
  END LOOP;

  RETURN QUERY SELECT v_reeval, v_unlocked;
END;
$$;

REVOKE ALL ON FUNCTION public.evaluate_time_based_achievements(int) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.evaluate_time_based_achievements(int) TO service_role;

-- ============================================================================
-- 6) PIPELINE WRAPPER for cron / edge function
-- ============================================================================
CREATE OR REPLACE FUNCTION public.run_achievement_pipeline(_batch_size int DEFAULT 500, _time_limit int DEFAULT 500)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_b record;
  v_t record;
BEGIN
  SELECT * INTO v_b FROM public.process_achievement_events_batch(_batch_size);
  SELECT * INTO v_t FROM public.evaluate_time_based_achievements(_time_limit);
  RETURN jsonb_build_object(
    'batch', jsonb_build_object('processed', v_b.processed, 'failed', v_b.failed, 'affected_progress', v_b.affected_progress),
    'time_based', jsonb_build_object('reevaluated', v_t.reevaluated, 'unlocked', v_t.unlocked),
    'ran_at', now()
  );
END;
$$;

REVOKE ALL ON FUNCTION public.run_achievement_pipeline(int,int) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.run_achievement_pipeline(int,int) TO service_role;
