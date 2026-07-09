
-- =====================================================================
-- Batch B: server-side rate limiting on write actions
-- =====================================================================

-- Unique index for bucketed upsert (per user, per action, per window bucket).
CREATE UNIQUE INDEX IF NOT EXISTS rate_limits_user_key_window_uniq
  ON public.rate_limits (user_id, key, window_start)
  WHERE user_id IS NOT NULL;

-- Support index for cleanup
CREATE INDEX IF NOT EXISTS idx_rate_limits_window_start
  ON public.rate_limits (window_start);

-- =====================================================================
-- Reusable helper
-- =====================================================================
CREATE OR REPLACE FUNCTION public.enforce_rate_limit(
  _action_key text,
  _max_count int,
  _window_seconds int
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_window_start timestamptz;
  v_count int;
BEGIN
  -- Only rate-limit authenticated end-user actions. Service_role and
  -- unauthenticated background paths bypass entirely.
  IF v_uid IS NULL THEN
    RETURN;
  END IF;

  -- Admins bypass so moderation/maintenance is not throttled.
  IF public.has_role(v_uid, 'admin'::app_role) THEN
    RETURN;
  END IF;

  -- Bucket to the current window (e.g. every 3600s bucket for hourly limits).
  v_window_start := to_timestamp(
    (extract(epoch from now())::bigint / GREATEST(_window_seconds, 1))
      * GREATEST(_window_seconds, 1)
  );

  INSERT INTO public.rate_limits (key, bucket, user_id, window_start, count)
  VALUES (_action_key, _action_key, v_uid, v_window_start, 1)
  ON CONFLICT (user_id, key, window_start)
    DO UPDATE SET count = public.rate_limits.count + 1
  RETURNING count INTO v_count;

  IF v_count > _max_count THEN
    RAISE EXCEPTION USING
      MESSAGE = 'You''re doing that too fast. Try again soon.',
      ERRCODE = 'P0001',
      HINT = 'rate_limit:' || _action_key;
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.enforce_rate_limit(text, int, int) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.enforce_rate_limit(text, int, int) TO service_role;

-- =====================================================================
-- Per-surface trigger functions
-- =====================================================================

-- Posts: publish (10/hour) + reposts (30/hour)
CREATE OR REPLACE FUNCTION public.enforce_post_publish_rate_limit()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.user_id IS NULL OR NEW.user_id <> auth.uid() THEN
    RETURN NEW;
  END IF;
  IF NEW.parent_post_id IS NULL THEN
    PERFORM public.enforce_rate_limit('post_publish_hour', 10, 3600);
    PERFORM public.enforce_rate_limit('post_publish_day', 50, 86400);
  ELSE
    PERFORM public.enforce_rate_limit('repost_hour', 30, 3600);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_posts_rate_limit ON public.posts;
CREATE TRIGGER trg_posts_rate_limit
  BEFORE INSERT ON public.posts
  FOR EACH ROW EXECUTE FUNCTION public.enforce_post_publish_rate_limit();

-- Comments: 60/hour (existing burst trigger stays as extra defense)
CREATE OR REPLACE FUNCTION public.enforce_comment_rate_limit()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF auth.uid() IS NULL THEN RETURN NEW; END IF;
  PERFORM public.enforce_rate_limit('comment_hour', 60, 3600);
  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS trg_comments_hourly_rate_limit ON public.comments;
CREATE TRIGGER trg_comments_hourly_rate_limit
  BEFORE INSERT ON public.comments
  FOR EACH ROW EXECUTE FUNCTION public.enforce_comment_rate_limit();

-- Votes: 300/hour
CREATE OR REPLACE FUNCTION public.enforce_vote_rate_limit()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF auth.uid() IS NULL THEN RETURN NEW; END IF;
  PERFORM public.enforce_rate_limit('vote_hour', 300, 3600);
  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS trg_votes_hourly_rate_limit ON public.votes;
CREATE TRIGGER trg_votes_hourly_rate_limit
  BEFORE INSERT ON public.votes
  FOR EACH ROW EXECUTE FUNCTION public.enforce_vote_rate_limit();

-- Follows / unfollows: 100/hour combined
CREATE OR REPLACE FUNCTION public.enforce_follow_rate_limit()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN COALESCE(NEW, OLD);
  END IF;
  PERFORM public.enforce_rate_limit('follow_hour', 100, 3600);
  RETURN COALESCE(NEW, OLD);
END; $$;

DROP TRIGGER IF EXISTS trg_follows_rate_limit ON public.follows;
CREATE TRIGGER trg_follows_rate_limit
  BEFORE INSERT OR DELETE ON public.follows
  FOR EACH ROW EXECUTE FUNCTION public.enforce_follow_rate_limit();

-- Reports: 20/day
CREATE OR REPLACE FUNCTION public.enforce_report_rate_limit()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF auth.uid() IS NULL THEN RETURN NEW; END IF;
  PERFORM public.enforce_rate_limit('report_day', 20, 86400);
  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS trg_reports_rate_limit ON public.reports;
CREATE TRIGGER trg_reports_rate_limit
  BEFORE INSERT ON public.reports
  FOR EACH ROW EXECUTE FUNCTION public.enforce_report_rate_limit();

-- DMs: 60/hour
CREATE OR REPLACE FUNCTION public.enforce_message_rate_limit()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF auth.uid() IS NULL THEN RETURN NEW; END IF;
  PERFORM public.enforce_rate_limit('dm_hour', 60, 3600);
  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS trg_messages_rate_limit ON public.messages;
CREATE TRIGGER trg_messages_rate_limit
  BEFORE INSERT ON public.messages
  FOR EACH ROW EXECUTE FUNCTION public.enforce_message_rate_limit();

-- Gifts: 100/hour
CREATE OR REPLACE FUNCTION public.enforce_gift_rate_limit()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF auth.uid() IS NULL THEN RETURN NEW; END IF;
  PERFORM public.enforce_rate_limit('gift_hour', 100, 3600);
  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS trg_gifts_rate_limit ON public.gift_transactions;
CREATE TRIGGER trg_gifts_rate_limit
  BEFORE INSERT ON public.gift_transactions
  FOR EACH ROW EXECUTE FUNCTION public.enforce_gift_rate_limit();

-- Profile edits: 20/day
CREATE OR REPLACE FUNCTION public.enforce_profile_update_rate_limit()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF auth.uid() IS NULL OR NEW.id <> auth.uid() THEN
    RETURN NEW;
  END IF;
  PERFORM public.enforce_rate_limit('profile_update_day', 20, 86400);
  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS trg_profiles_rate_limit ON public.profiles;
CREATE TRIGGER trg_profiles_rate_limit
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.enforce_profile_update_rate_limit();

-- Battle challenges: 20/day
CREATE OR REPLACE FUNCTION public.enforce_battle_rate_limit()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF auth.uid() IS NULL THEN RETURN NEW; END IF;
  PERFORM public.enforce_rate_limit('battle_challenge_day', 20, 86400);
  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS trg_battles_rate_limit ON public.battles;
CREATE TRIGGER trg_battles_rate_limit
  BEFORE INSERT ON public.battles
  FOR EACH ROW EXECUTE FUNCTION public.enforce_battle_rate_limit();

-- =====================================================================
-- Cleanup old rate_limits rows (>7 days) hourly via pg_cron
-- =====================================================================
CREATE OR REPLACE FUNCTION public.cleanup_rate_limits()
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  DELETE FROM public.rate_limits WHERE window_start < now() - interval '7 days';
END; $$;

REVOKE ALL ON FUNCTION public.cleanup_rate_limits() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.cleanup_rate_limits() TO service_role;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    PERFORM cron.unschedule(jobid)
      FROM cron.job WHERE jobname = 'cleanup_rate_limits_hourly';
    PERFORM cron.schedule(
      'cleanup_rate_limits_hourly',
      '17 * * * *',
      $cron$ SELECT public.cleanup_rate_limits(); $cron$
    );
  END IF;
END $$;
