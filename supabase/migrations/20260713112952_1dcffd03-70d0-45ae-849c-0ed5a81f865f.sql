
-- 1) Rarity stats: cached counts of completed achievements per definition.
CREATE MATERIALIZED VIEW IF NOT EXISTS public.achievement_rarity_stats AS
SELECT
  d.id AS achievement_id,
  d.slug,
  COUNT(uap.user_id) FILTER (WHERE uap.status = 'completed') AS completed_count,
  (SELECT COUNT(DISTINCT user_id) FROM public.user_achievement_progress) AS active_players
FROM public.achievement_definitions d
LEFT JOIN public.user_achievement_progress uap ON uap.achievement_id = d.id
GROUP BY d.id, d.slug;

CREATE UNIQUE INDEX IF NOT EXISTS achievement_rarity_stats_pk
  ON public.achievement_rarity_stats(achievement_id);

CREATE OR REPLACE FUNCTION public.refresh_achievement_rarity()
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;
  REFRESH MATERIALIZED VIEW CONCURRENTLY public.achievement_rarity_stats;
END; $$;
GRANT EXECUTE ON FUNCTION public.refresh_achievement_rarity() TO authenticated;

-- 2) Public rarity read.
CREATE OR REPLACE FUNCTION public.achievement_rarity()
RETURNS TABLE (achievement_id uuid, slug text, completed_count bigint, active_players bigint, rarity_pct numeric)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT
    s.achievement_id, s.slug, s.completed_count, s.active_players,
    CASE WHEN s.active_players > 0
      THEN ROUND(100.0 * s.completed_count / s.active_players, 2)
      ELSE 0 END AS rarity_pct
  FROM public.achievement_rarity_stats s;
$$;
GRANT EXECUTE ON FUNCTION public.achievement_rarity() TO anon, authenticated;

-- 3) Profile showcase — top rarest completed achievements for a given user.
CREATE OR REPLACE FUNCTION public.profile_showcased_achievements(_user_id uuid, _limit int DEFAULT 3)
RETURNS TABLE (
  achievement_id uuid, slug text, name text, description text,
  rarity text, completed_at timestamptz, rarity_pct numeric,
  avatar_frame_id uuid
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT
    d.id, d.slug, d.name, d.description, d.rarity,
    uap.completed_at,
    CASE WHEN s.active_players > 0
      THEN ROUND(100.0 * s.completed_count / s.active_players, 2)
      ELSE 100 END,
    d.avatar_frame_id
  FROM public.user_achievement_progress uap
  JOIN public.achievement_definitions d ON d.id = uap.achievement_id
  LEFT JOIN public.achievement_rarity_stats s ON s.achievement_id = d.id
  WHERE uap.user_id = _user_id
    AND uap.status = 'completed'
    AND d.is_active
    AND d.is_secret = false
  ORDER BY
    CASE WHEN s.active_players > 0
      THEN 100.0 * s.completed_count / s.active_players
      ELSE 100 END ASC,
    uap.completed_at DESC
  LIMIT GREATEST(1, LEAST(_limit, 10));
$$;
GRANT EXECUTE ON FUNCTION public.profile_showcased_achievements(uuid, int) TO anon, authenticated;

-- 4) Frame-unlock notification: insert a `notifications` row when a
--    permanent avatar frame reward is granted. Realtime subscribers on the
--    notifications table already toast newly inserted rows.
CREATE OR REPLACE FUNCTION public.trg_notify_frame_unlock() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  ach_name text;
  frame_key text;
BEGIN
  IF NEW.reward_type <> 'frame_permanent' THEN RETURN NEW; END IF;

  SELECT d.name, f.key
    INTO ach_name, frame_key
    FROM public.achievement_definitions d
    LEFT JOIN public.avatar_frames f ON f.id = d.avatar_frame_id
   WHERE d.id = NEW.achievement_id;

  BEGIN
    INSERT INTO public.notifications (user_id, type, title, body, data)
    VALUES (
      NEW.user_id,
      'frame_unlocked',
      'New royal frame unlocked',
      COALESCE(ach_name, 'A new frame is available'),
      jsonb_build_object(
        'achievement_id', NEW.achievement_id,
        'frame_key', frame_key,
        'reward_id', NEW.reward_id
      )
    );
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'frame unlock notification failed: %', SQLERRM;
  END;
  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS ach_frame_unlock_notify ON public.user_achievement_rewards;
CREATE TRIGGER ach_frame_unlock_notify
  AFTER INSERT ON public.user_achievement_rewards
  FOR EACH ROW EXECUTE FUNCTION public.trg_notify_frame_unlock();
