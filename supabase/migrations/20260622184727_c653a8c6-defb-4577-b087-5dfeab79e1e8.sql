CREATE OR REPLACE FUNCTION public.prune_logs_retention()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_result jsonb := '{}'::jsonb;
  v_deleted bigint;
BEGIN
  DELETE FROM public.db_health_snapshots WHERE created_at < now() - interval '30 days';
  GET DIAGNOSTICS v_deleted = ROW_COUNT; v_result := v_result || jsonb_build_object('db_health_snapshots', v_deleted);

  DELETE FROM public.rank_snapshots WHERE created_at < now() - interval '90 days';
  GET DIAGNOSTICS v_deleted = ROW_COUNT; v_result := v_result || jsonb_build_object('rank_snapshots', v_deleted);

  DELETE FROM public.analytics_events WHERE created_at < now() - interval '180 days';
  GET DIAGNOSTICS v_deleted = ROW_COUNT; v_result := v_result || jsonb_build_object('analytics_events', v_deleted);

  DELETE FROM public.cron_error_log WHERE created_at < now() - interval '30 days';
  GET DIAGNOSTICS v_deleted = ROW_COUNT; v_result := v_result || jsonb_build_object('cron_error_log', v_deleted);

  DELETE FROM public.email_send_log WHERE created_at < now() - interval '180 days';
  GET DIAGNOSTICS v_deleted = ROW_COUNT; v_result := v_result || jsonb_build_object('email_send_log', v_deleted);

  DELETE FROM public.error_logs WHERE created_at < now() - interval '90 days';
  GET DIAGNOSTICS v_deleted = ROW_COUNT; v_result := v_result || jsonb_build_object('error_logs', v_deleted);

  DELETE FROM public.profile_visits WHERE created_at < now() - interval '90 days';
  GET DIAGNOSTICS v_deleted = ROW_COUNT; v_result := v_result || jsonb_build_object('profile_visits', v_deleted);

  INSERT INTO public.admin_audit_log (action, target_type, metadata)
  VALUES ('logs_retention_prune', 'system', v_result)
  ON CONFLICT DO NOTHING;

  RETURN v_result;
EXCEPTION WHEN OTHERS THEN
  INSERT INTO public.cron_error_log (job_name, error_message)
  VALUES ('prune_logs_retention', SQLERRM);
  RETURN v_result;
END $$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname='pg_cron') THEN
    PERFORM cron.unschedule(jobid) FROM cron.job WHERE jobname='prune_logs_retention';
    PERFORM cron.schedule('prune_logs_retention', '15 3 * * *', $cron$SELECT public.prune_logs_retention();$cron$);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_posts_user_created ON public.posts(user_id, created_at DESC) WHERE is_removed = false;
CREATE INDEX IF NOT EXISTS idx_posts_category_score ON public.posts(main_category_slug, crown_score DESC) WHERE is_removed = false;
CREATE INDEX IF NOT EXISTS idx_posts_mod_flagged ON public.posts(moderation_status) WHERE moderation_status = 'flagged';
CREATE INDEX IF NOT EXISTS idx_shekel_ledger_user_created ON public.shekel_ledger(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_votes_post ON public.votes(post_id);