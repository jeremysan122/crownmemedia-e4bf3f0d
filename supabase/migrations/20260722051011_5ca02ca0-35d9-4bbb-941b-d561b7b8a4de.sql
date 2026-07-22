-- Recipient update policy: preserve identity/content
DROP POLICY IF EXISTS "Recipient can mark read" ON public.messages;
CREATE POLICY "Recipient can mark read"
ON public.messages
FOR UPDATE
TO authenticated
USING (auth.uid() = receiver_id)
WITH CHECK (
  auth.uid() = receiver_id
  AND id = (SELECT old_message.id FROM public.messages old_message WHERE old_message.id = messages.id)
  AND sender_id = (SELECT old_message.sender_id FROM public.messages old_message WHERE old_message.id = messages.id)
  AND receiver_id = (SELECT old_message.receiver_id FROM public.messages old_message WHERE old_message.id = messages.id)
  AND body IS NOT DISTINCT FROM (SELECT old_message.body FROM public.messages old_message WHERE old_message.id = messages.id)
  AND shared_post_id IS NOT DISTINCT FROM (SELECT old_message.shared_post_id FROM public.messages old_message WHERE old_message.id = messages.id)
  AND shared_profile_id IS NOT DISTINCT FROM (SELECT old_message.shared_profile_id FROM public.messages old_message WHERE old_message.id = messages.id)
  AND attachment_path IS NOT DISTINCT FROM (SELECT old_message.attachment_path FROM public.messages old_message WHERE old_message.id = messages.id)
  AND attachment_name IS NOT DISTINCT FROM (SELECT old_message.attachment_name FROM public.messages old_message WHERE old_message.id = messages.id)
  AND attachment_size IS NOT DISTINCT FROM (SELECT old_message.attachment_size FROM public.messages old_message WHERE old_message.id = messages.id)
  AND attachment_type IS NOT DISTINCT FROM (SELECT old_message.attachment_type FROM public.messages old_message WHERE old_message.id = messages.id)
  AND kind = (SELECT old_message.kind FROM public.messages old_message WHERE old_message.id = messages.id)
  AND gift_transaction_id IS NOT DISTINCT FROM (SELECT old_message.gift_transaction_id FROM public.messages old_message WHERE old_message.id = messages.id)
  AND thread_id IS NOT DISTINCT FROM (SELECT old_message.thread_id FROM public.messages old_message WHERE old_message.id = messages.id)
  AND created_at = (SELECT old_message.created_at FROM public.messages old_message WHERE old_message.id = messages.id)
);

DROP POLICY IF EXISTS "Public voters are visible" ON public.votes;

CREATE OR REPLACE FUNCTION public.get_post_public_voters(_post_id uuid, _limit int DEFAULT 50)
RETURNS TABLE(user_id uuid, username text, profile_photo_url text, vote_type text, created_at timestamptz)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT v.user_id, p.username, p.profile_photo_url, v.vote_type::text, v.created_at
  FROM public.votes v
  JOIN public.profiles p ON p.id = v.user_id
  WHERE v.post_id = _post_id
    AND p.vote_privacy = 'public'
  ORDER BY v.created_at DESC
  LIMIT LEAST(GREATEST(COALESCE(_limit, 50), 1), 50);
$$;

REVOKE ALL ON FUNCTION public.get_post_public_voters(uuid, int) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_post_public_voters(uuid, int) TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.dedupe_recent_db_health_alert()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM public.admin_alerts existing
    WHERE existing.category = NEW.category
      AND existing.title = NEW.title
      AND existing.acknowledged = false
      AND existing.created_at >= now() - interval '1 hour'
  ) THEN
    RETURN NULL;
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.dedupe_recent_db_health_alert()
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.dedupe_recent_db_health_alert() TO service_role;

DROP TRIGGER IF EXISTS admin_alerts_dedupe_db_health ON public.admin_alerts;
CREATE TRIGGER admin_alerts_dedupe_db_health
BEFORE INSERT ON public.admin_alerts
FOR EACH ROW
WHEN (NEW.category = 'db_health')
EXECUTE FUNCTION public.dedupe_recent_db_health_alert();

UPDATE public.admin_alerts
SET acknowledged = true,
    acknowledged_at = now(),
    metadata = metadata || jsonb_build_object(
      'system_ack_reason', 'pre-launch db-health alert consolidation'
    )
WHERE category = 'db_health'
  AND acknowledged = false
  AND created_at < now() - interval '1 hour';

CREATE OR REPLACE FUNCTION public.alert_on_db_health_snapshot()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  connection_pct numeric := 0;
BEGIN
  IF NEW.connections_max > 0 THEN
    connection_pct := round(NEW.connections_active::numeric / NEW.connections_max::numeric * 100, 1);
  END IF;

  IF connection_pct >= 90 THEN
    INSERT INTO public.admin_alerts (severity, category, title, body, metadata)
    VALUES (
      'critical', 'db_health', 'Database connections critical',
      format('%s of %s connections are active (%s%%).', NEW.connections_active, NEW.connections_max, connection_pct),
      jsonb_build_object('snapshot_id', NEW.id, 'connection_pct', connection_pct)
    );
  ELSIF connection_pct >= 75 THEN
    INSERT INTO public.admin_alerts (severity, category, title, body, metadata)
    VALUES (
      'warning', 'db_health', 'Database connections elevated',
      format('%s of %s connections are active (%s%%).', NEW.connections_active, NEW.connections_max, connection_pct),
      jsonb_build_object('snapshot_id', NEW.id, 'connection_pct', connection_pct)
    );
  END IF;

  IF NEW.deadlocks_delta > 0 THEN
    INSERT INTO public.admin_alerts (severity, category, title, body, metadata)
    VALUES (
      'critical', 'db_health', 'Database deadlock detected',
      format('%s new deadlock(s) occurred in the latest health interval.', NEW.deadlocks_delta),
      jsonb_build_object('snapshot_id', NEW.id, 'deadlocks_delta', NEW.deadlocks_delta)
    );
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.alert_on_db_health_snapshot()
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.alert_on_db_health_snapshot() TO service_role;

DROP TRIGGER IF EXISTS db_health_snapshot_launch_alerts ON public.db_health_snapshots;
CREATE TRIGGER db_health_snapshot_launch_alerts
AFTER INSERT ON public.db_health_snapshots
FOR EACH ROW
EXECUTE FUNCTION public.alert_on_db_health_snapshot();

CREATE OR REPLACE FUNCTION public.evaluate_launch_operational_alerts()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  event_row record;
  reversal_row record;
  fired integer := 0;
BEGIN
  UPDATE public.admin_alerts alert
  SET acknowledged = true,
      acknowledged_at = now(),
      metadata = alert.metadata || jsonb_build_object('auto_resolved', true)
  FROM public.stripe_events event
  WHERE alert.category = 'stripe_webhook'
    AND alert.acknowledged = false
    AND alert.metadata->>'stripe_event_id' = event.id
    AND event.processed_at IS NOT NULL;

  FOR event_row IN
    SELECT id, type, attempt_count, last_error, processing_started_at
    FROM public.stripe_events
    WHERE processed_at IS NULL
      AND (
        last_error IS NOT NULL
        OR processing_started_at < now() - interval '10 minutes'
        OR attempt_count >= 3
      )
  LOOP
    IF NOT EXISTS (
      SELECT 1 FROM public.admin_alerts alert
      WHERE alert.category = 'stripe_webhook'
        AND alert.acknowledged = false
        AND alert.metadata->>'stripe_event_id' = event_row.id
    ) THEN
      INSERT INTO public.admin_alerts (severity, category, title, body, metadata)
      VALUES (
        CASE WHEN event_row.attempt_count >= 3 THEN 'critical' ELSE 'warning' END,
        'stripe_webhook',
        'Stripe webhook requires attention',
        format(
          'Event %s (%s) is unprocessed after %s attempt(s).',
          event_row.id, event_row.type, event_row.attempt_count
        ),
        jsonb_build_object(
          'stripe_event_id', event_row.id,
          'event_type', event_row.type,
          'attempt_count', event_row.attempt_count,
          'last_error', left(COALESCE(event_row.last_error, 'stale claim'), 500),
          'processing_started_at', event_row.processing_started_at
        )
      );
      fired := fired + 1;
    END IF;
  END LOOP;

  FOR reversal_row IN
    SELECT id, stripe_session_id, stripe_event_id, user_id, metadata
    FROM public.stripe_store_reversals
    WHERE status = 'needs_reconciliation'
  LOOP
    IF NOT EXISTS (
      SELECT 1 FROM public.admin_alerts alert
      WHERE alert.category = 'stripe_store_refund_needs_reconciliation'
        AND alert.acknowledged = false
        AND alert.metadata->>'reversal_id' = reversal_row.id::text
    ) THEN
      INSERT INTO public.admin_alerts (severity, category, title, body, metadata)
      VALUES (
        'critical',
        'stripe_store_refund_needs_reconciliation',
        'Store refund needs reconciliation',
        format('Refund reversal %s for session %s still requires reconciliation.', reversal_row.id, reversal_row.stripe_session_id),
        jsonb_build_object(
          'reversal_id', reversal_row.id,
          'stripe_session_id', reversal_row.stripe_session_id,
          'stripe_event_id', reversal_row.stripe_event_id,
          'user_id', reversal_row.user_id
        ) || reversal_row.metadata
      );
      fired := fired + 1;
    END IF;
  END LOOP;

  RETURN fired;
END;
$$;

REVOKE ALL ON FUNCTION public.evaluate_launch_operational_alerts()
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.evaluate_launch_operational_alerts() TO service_role;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'evaluate-launch-ops-5m') THEN
    PERFORM cron.schedule(
      'evaluate-launch-ops-5m',
      '*/5 * * * *',
      'SELECT public.evaluate_launch_operational_alerts();'
    );
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.finalize_expired_battles()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  battle_row record;
  official_result jsonb;
  challenger_count integer;
  opponent_count integer;
  host_count integer;
  async_finalized integer := 0;
  live_finalized integer := 0;
BEGIN
  FOR battle_row IN
    SELECT *
    FROM public.battles
    WHERE status = 'active'
      AND ends_at IS NOT NULL
      AND ends_at <= now()
    FOR UPDATE SKIP LOCKED
  LOOP
    official_result := public.get_battle_official_result(battle_row.id);
    SELECT count(*)::integer INTO challenger_count
    FROM public.battle_votes
    WHERE battle_id = battle_row.id
      AND voted_for_user_id = battle_row.challenger_id;
    SELECT count(*)::integer INTO opponent_count
    FROM public.battle_votes
    WHERE battle_id = battle_row.id
      AND voted_for_user_id = battle_row.opponent_id;

    UPDATE public.battles
    SET status = 'completed',
        challenger_votes = challenger_count,
        opponent_votes = opponent_count,
        winner_id = CASE
          WHEN battle_row.accepted_at IS NOT NULL
            AND battle_row.challenger_post_id IS NOT NULL
            AND battle_row.opponent_post_id IS NOT NULL
            AND official_result->>'kind' = 'winner'
          THEN (official_result->>'winner_id')::uuid
          ELSE NULL
        END
    WHERE id = battle_row.id
      AND status = 'active';
    IF FOUND THEN async_finalized := async_finalized + 1; END IF;
  END LOOP;

  FOR battle_row IN
    SELECT *
    FROM public.live_battles
    WHERE status = 'live'
      AND ends_at IS NOT NULL
      AND ends_at <= now()
    FOR UPDATE SKIP LOCKED
  LOOP
    SELECT count(*)::integer INTO host_count
    FROM public.live_battle_votes
    WHERE battle_id = battle_row.id AND choice = 'host';
    SELECT count(*)::integer INTO opponent_count
    FROM public.live_battle_votes
    WHERE battle_id = battle_row.id AND choice = 'opponent';

    UPDATE public.live_battles
    SET status = 'ended',
        ended_reason = COALESCE(ended_reason, 'duration_elapsed'),
        host_votes = host_count,
        opponent_votes = opponent_count,
        winner_id = CASE
          WHEN host_count > opponent_count THEN host_id
          WHEN opponent_count > host_count THEN opponent_id
          ELSE NULL
        END,
        updated_at = now()
    WHERE id = battle_row.id
      AND status = 'live';
    IF FOUND THEN live_finalized := live_finalized + 1; END IF;
  END LOOP;

  RETURN jsonb_build_object(
    'async_finalized', async_finalized,
    'live_finalized', live_finalized
  );
END;
$$;

REVOKE ALL ON FUNCTION public.finalize_expired_battles()
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.finalize_expired_battles() TO service_role;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'finalize-expired-battles-1m') THEN
    PERFORM cron.schedule(
      'finalize-expired-battles-1m',
      '* * * * *',
      'SELECT public.finalize_expired_battles();'
    );
  END IF;
END;
$$;

SELECT public.finalize_expired_battles();