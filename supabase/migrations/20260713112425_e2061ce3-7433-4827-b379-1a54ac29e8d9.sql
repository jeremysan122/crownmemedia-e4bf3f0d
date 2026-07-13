
-- ---------- 1. Trigger helper -------------------------------------------
CREATE OR REPLACE FUNCTION public._ach_emit(
  _user_id uuid, _event_type text, _source_table text, _source_id uuid, _delta jsonb
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF _user_id IS NULL OR _source_id IS NULL THEN RETURN; END IF;
  PERFORM public.emit_achievement_event(
    _user_id, _event_type, _source_table, _source_id, COALESCE(_delta, '{}'::jsonb), NULL, now()
  );
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'ach_emit failed for %/%: %', _event_type, _source_id, SQLERRM;
END; $$;
REVOKE ALL ON FUNCTION public._ach_emit(uuid, text, text, uuid, jsonb) FROM PUBLIC, anon, authenticated;

-- ---------- 2. Weekly quest engine (defined first — triggers call it) ----

INSERT INTO public.weekly_quest_definitions (slug, name, description, requirement_logic, rewards, is_active, display_order)
VALUES
  ('weekly-post', 'Weekly Publisher', 'Publish 3 posts this week.',
     '{"metric":"posts","target":3}'::jsonb,
     '[{"type":"badge","key":"weekly-publisher"},{"type":"crowns","amount":25}]'::jsonb, true, 1),
  ('weekly-vote', 'Weekly Voter', 'Cast 10 votes this week.',
     '{"metric":"votes","target":10}'::jsonb,
     '[{"type":"badge","key":"weekly-voter"},{"type":"crowns","amount":15}]'::jsonb, true, 2),
  ('weekly-win', 'Weekly Champion', 'Win 3 battles this week.',
     '{"metric":"battle_wins","target":3}'::jsonb,
     '[{"type":"badge","key":"weekly-champion"},{"type":"crowns","amount":50}]'::jsonb, true, 3)
ON CONFLICT (slug) DO UPDATE SET
  name=EXCLUDED.name, description=EXCLUDED.description,
  requirement_logic=EXCLUDED.requirement_logic, rewards=EXCLUDED.rewards,
  is_active=EXCLUDED.is_active, display_order=EXCLUDED.display_order, updated_at=now();

CREATE UNIQUE INDEX IF NOT EXISTS user_weekly_quests_uidx
  ON public.user_weekly_quests(user_id, quest_id, week_start);

CREATE OR REPLACE FUNCTION public._current_week_start() RETURNS date
LANGUAGE sql IMMUTABLE AS $$
  SELECT (date_trunc('week', (now() at time zone 'utc'))::date);
$$;

-- progress stored as {"count": N}
CREATE OR REPLACE FUNCTION public.tick_weekly_quests(
  _user_id uuid, _slug text, _amount int
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  qid uuid; target int; wk date := public._current_week_start();
  cur int; nxt int; pct int; new_status text;
BEGIN
  IF _user_id IS NULL OR _slug IS NULL OR COALESCE(_amount,0) <= 0 THEN RETURN; END IF;

  SELECT id, GREATEST(1, COALESCE((requirement_logic->>'target')::int,1))
    INTO qid, target
    FROM public.weekly_quest_definitions
   WHERE slug=_slug AND is_active LIMIT 1;
  IF qid IS NULL THEN RETURN; END IF;

  SELECT COALESCE((progress->>'count')::int, 0) INTO cur
    FROM public.user_weekly_quests
   WHERE user_id=_user_id AND quest_id=qid AND week_start=wk;
  IF cur IS NULL THEN cur := 0; END IF;

  nxt := cur + _amount;
  pct := LEAST(100, (nxt * 100) / target);
  new_status := CASE WHEN nxt >= target THEN 'completed' ELSE 'in_progress' END;

  INSERT INTO public.user_weekly_quests
    (user_id, quest_id, week_start, progress, completion_percent, status,
     completed_at)
  VALUES (_user_id, qid, wk, jsonb_build_object('count', nxt), pct, new_status,
     CASE WHEN new_status='completed' THEN now() ELSE NULL END)
  ON CONFLICT (user_id, quest_id, week_start) DO UPDATE
    SET progress = jsonb_build_object('count', nxt),
        completion_percent = pct,
        status = new_status,
        completed_at = CASE WHEN new_status='completed'
                            AND user_weekly_quests.completed_at IS NULL
                            THEN now() ELSE user_weekly_quests.completed_at END,
        updated_at = now();
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'tick_weekly_quests failed %/%: %', _user_id, _slug, SQLERRM;
END; $$;
REVOKE ALL ON FUNCTION public.tick_weekly_quests(uuid, text, int) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.my_weekly_quests()
RETURNS TABLE (
  quest_id uuid, slug text, name text, description text,
  target int, progress int, completion_percent int, status text,
  rewards jsonb, week_start date
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT
    d.id, d.slug, d.name, d.description,
    COALESCE((d.requirement_logic->>'target')::int, 1)::int,
    COALESCE((uq.progress->>'count')::int, 0)::int,
    COALESCE(uq.completion_percent, 0)::int,
    COALESCE(uq.status, 'in_progress')::text,
    d.rewards,
    public._current_week_start()
  FROM public.weekly_quest_definitions d
  LEFT JOIN public.user_weekly_quests uq
    ON uq.quest_id = d.id
   AND uq.user_id = auth.uid()
   AND uq.week_start = public._current_week_start()
  WHERE d.is_active
  ORDER BY d.display_order NULLS LAST, d.name;
$$;
GRANT EXECUTE ON FUNCTION public.my_weekly_quests() TO authenticated;

-- ---------- 3. Domain triggers ------------------------------------------

CREATE OR REPLACE FUNCTION public.trg_ach_posts() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM public._ach_emit(NEW.user_id, 'post_published', 'posts', NEW.id,
    jsonb_build_object('qualifying_posts', 1));
  PERFORM public.tick_weekly_quests(NEW.user_id, 'weekly-post', 1);
  RETURN NEW;
END; $$;
DROP TRIGGER IF EXISTS ach_posts_insert ON public.posts;
CREATE TRIGGER ach_posts_insert AFTER INSERT ON public.posts
FOR EACH ROW EXECUTE FUNCTION public.trg_ach_posts();

CREATE OR REPLACE FUNCTION public.trg_ach_votes() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM public._ach_emit(NEW.user_id, 'vote_cast', 'votes', NEW.id,
    jsonb_build_object('qualified_votes_cast', 1));
  PERFORM public.tick_weekly_quests(NEW.user_id, 'weekly-vote', 1);
  RETURN NEW;
END; $$;
DROP TRIGGER IF EXISTS ach_votes_insert ON public.votes;
CREATE TRIGGER ach_votes_insert AFTER INSERT ON public.votes
FOR EACH ROW EXECUTE FUNCTION public.trg_ach_votes();

CREATE OR REPLACE FUNCTION public.trg_ach_follows() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM public._ach_emit(NEW.following_id, 'follower_gained', 'follows', NEW.id,
    jsonb_build_object('legitimate_followers', 1));
  RETURN NEW;
END; $$;
DROP TRIGGER IF EXISTS ach_follows_insert ON public.follows;
CREATE TRIGGER ach_follows_insert AFTER INSERT ON public.follows
FOR EACH ROW EXECUTE FUNCTION public.trg_ach_follows();

CREATE OR REPLACE FUNCTION public.trg_ach_battles() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.winner_id IS NOT NULL AND NEW.winner_id IS DISTINCT FROM OLD.winner_id THEN
    PERFORM public._ach_emit(NEW.winner_id, 'battle_won', 'battles', NEW.id,
      jsonb_build_object('qualified_battle_wins', 1));
    PERFORM public.tick_weekly_quests(NEW.winner_id, 'weekly-win', 1);
  END IF;
  RETURN NEW;
END; $$;
DROP TRIGGER IF EXISTS ach_battles_update ON public.battles;
CREATE TRIGGER ach_battles_update AFTER UPDATE OF winner_id ON public.battles
FOR EACH ROW EXECUTE FUNCTION public.trg_ach_battles();

CREATE OR REPLACE FUNCTION public.trg_ach_crowns() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM public._ach_emit(NEW.user_id, 'crown_earned', 'crowns', NEW.id,
    jsonb_build_object('crowns_earned', 1));
  RETURN NEW;
END; $$;
DROP TRIGGER IF EXISTS ach_crowns_insert ON public.crowns;
CREATE TRIGGER ach_crowns_insert AFTER INSERT ON public.crowns
FOR EACH ROW EXECUTE FUNCTION public.trg_ach_crowns();

CREATE OR REPLACE FUNCTION public.trg_ach_live_gifts() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM public._ach_emit(NEW.recipient_id, 'gift_received', 'live_battle_gifts', NEW.id,
    jsonb_build_object('gifts_received', 1));
  RETURN NEW;
END; $$;
DROP TRIGGER IF EXISTS ach_live_gifts_insert ON public.live_battle_gifts;
CREATE TRIGGER ach_live_gifts_insert AFTER INSERT ON public.live_battle_gifts
FOR EACH ROW EXECUTE FUNCTION public.trg_ach_live_gifts();

-- ---------- 4. Admin telemetry ------------------------------------------
CREATE OR REPLACE FUNCTION public.admin_achievement_stats()
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE result jsonb;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;
  SELECT jsonb_build_object(
    'events_pending',   (SELECT count(*) FROM public.achievement_progress_events WHERE processing_status='pending'),
    'events_failed',    (SELECT count(*) FROM public.achievement_progress_events WHERE processing_status='failed'),
    'events_processed', (SELECT count(*) FROM public.achievement_progress_events WHERE processing_status='processed'),
    'users_with_progress', (SELECT count(DISTINCT user_id) FROM public.user_achievement_progress),
    'total_unlocks',    (SELECT count(*) FROM public.user_achievement_rewards WHERE reward_type='frame_permanent'),
    'total_rewards',    (SELECT count(*) FROM public.user_achievement_rewards),
    'active_definitions', (SELECT count(*) FROM public.achievement_definitions WHERE is_active),
    'weekly_quests_active', (SELECT count(*) FROM public.weekly_quest_definitions WHERE is_active),
    'weekly_quests_completed_this_week', (
      SELECT count(*) FROM public.user_weekly_quests
      WHERE week_start=public._current_week_start() AND status='completed'
    ),
    'last_processed_at', (SELECT max(processed_at) FROM public.achievement_progress_events)
  ) INTO result;
  RETURN result;
END; $$;
GRANT EXECUTE ON FUNCTION public.admin_achievement_stats() TO authenticated;
