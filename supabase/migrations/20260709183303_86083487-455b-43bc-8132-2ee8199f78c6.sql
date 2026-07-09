
-- Admin-only storage usage RPC
CREATE OR REPLACE FUNCTION public.admin_storage_usage()
RETURNS TABLE(bucket_id text, object_count bigint, total_bytes bigint, last_upload timestamptz)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, storage
AS $$
  SELECT
    o.bucket_id,
    COUNT(*)::bigint AS object_count,
    COALESCE(SUM((o.metadata->>'size')::bigint), 0)::bigint AS total_bytes,
    MAX(o.created_at) AS last_upload
  FROM storage.objects o
  WHERE public.is_any_admin(auth.uid())
  GROUP BY o.bucket_id
  ORDER BY total_bytes DESC;
$$;

REVOKE ALL ON FUNCTION public.admin_storage_usage() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_storage_usage() TO authenticated;

-- Admin-only platform health summary RPC
CREATE OR REPLACE FUNCTION public.admin_platform_health_summary()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  since timestamptz := now() - interval '24 hours';
  result jsonb;
BEGIN
  IF NOT public.is_any_admin(auth.uid()) THEN
    RAISE EXCEPTION 'not_authorized';
  END IF;

  SELECT jsonb_build_object(
    'upload_failures_24h', (
      SELECT COUNT(*) FROM public.error_logs
      WHERE created_at >= since
        AND (metadata->>'event') IN (
          'upload_validation_failed','storage_upload_failed','video_upload_failed',
          'thumbnail_generation_failed','dm_attachment_upload_failed','verification_doc_upload_failed'
        )
    ),
    'webhook_failures_24h', (
      SELECT COUNT(*) FROM public.error_logs
      WHERE created_at >= since
        AND (metadata->>'event') IN (
          'stripe_webhook_failed','revenuecat_webhook_failed','checkout_failed',
          'invoice_payment_failed','subscription_sync_failed','verification_checkout_failed'
        )
    ),
    'email_failed_24h', (
      SELECT COUNT(DISTINCT message_id) FROM public.email_send_log
      WHERE created_at >= since AND status IN ('failed','dlq','bounced')
    ),
    'email_pending_over_5m', (
      SELECT COUNT(*) FROM (
        SELECT DISTINCT ON (message_id) message_id, status, created_at
        FROM public.email_send_log
        WHERE message_id IS NOT NULL
        ORDER BY message_id, created_at DESC
      ) latest
      WHERE status = 'pending' AND created_at < now() - interval '5 minutes'
    ),
    'oldest_pending_email_age_seconds', (
      SELECT COALESCE(EXTRACT(EPOCH FROM (now() - MIN(latest.created_at)))::int, 0)
      FROM (
        SELECT DISTINCT ON (message_id) message_id, status, created_at
        FROM public.email_send_log
        WHERE message_id IS NOT NULL
        ORDER BY message_id, created_at DESC
      ) latest
      WHERE status = 'pending'
    ),
    'push_failures_24h', (
      SELECT COUNT(*) FROM public.error_logs
      WHERE created_at >= since
        AND (metadata->>'event') IN ('push_send_failed','notification_send_failed')
    ),
    'realtime_errors_24h', (
      SELECT COUNT(*) FROM public.error_logs
      WHERE created_at >= since
        AND (metadata->>'event') IN ('realtime_reconnect','realtime_error','poll_fallback_active')
    ),
    'realtime_reconnects_24h', (
      SELECT COUNT(*) FROM public.error_logs
      WHERE created_at >= since AND metadata->>'event' = 'realtime_reconnect'
    ),
    'captured_at', now()
  ) INTO result;

  RETURN result;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_platform_health_summary() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_platform_health_summary() TO authenticated;

-- Seed default cost alert rules (idempotent by name)
INSERT INTO public.cost_alert_rules (name, metric_key, feature, threshold_type, threshold_value, comparison_window, is_active)
SELECT * FROM (VALUES
  ('Storage GB growth spike',        'storage_gb_growth',       'storage',   'percent_change',  25, '1d', true),
  ('Storage upload failures spike',  'upload_failures',         'storage',   'absolute',        50, '1d', true),
  ('Edge function invocation spike', 'edge_invocations',        'functions', 'percent_change',  50, '1d', true),
  ('Realtime reconnect spike',       'realtime_reconnects',     'realtime',  'absolute',       100, '1d', true),
  ('Email failure spike',            'email_failures',          'email',     'absolute',        25, '1d', true),
  ('Push failure spike',             'push_failures',           'push',      'absolute',        25, '1d', true),
  ('Payment webhook failure spike',  'webhook_failures',        'payments',  'absolute',         5, '1d', true)
) AS v(name, metric_key, feature, threshold_type, threshold_value, comparison_window, is_active)
WHERE NOT EXISTS (
  SELECT 1 FROM public.cost_alert_rules r WHERE r.name = v.name
);
