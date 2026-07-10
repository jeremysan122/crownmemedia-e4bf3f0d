
-- 1. New columns on live_battles
ALTER TABLE public.live_battles
  ADD COLUMN IF NOT EXISTS scheduled_start_at timestamptz,
  ADD COLUMN IF NOT EXISTS keyword_filters jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS slow_mode_seconds integer NOT NULL DEFAULT 0;

CREATE INDEX IF NOT EXISTS live_battles_scheduled_start_at_idx
  ON public.live_battles (scheduled_start_at)
  WHERE status = 'scheduled';

-- 2. battler_follows
CREATE TABLE IF NOT EXISTS public.battler_follows (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  follower_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  battler_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (follower_id, battler_id),
  CHECK (follower_id <> battler_id)
);

GRANT SELECT, INSERT, DELETE ON public.battler_follows TO authenticated;
GRANT ALL ON public.battler_follows TO service_role;

ALTER TABLE public.battler_follows ENABLE ROW LEVEL SECURITY;

CREATE POLICY "battler_follows_select_authenticated"
  ON public.battler_follows FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "battler_follows_insert_own"
  ON public.battler_follows FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = follower_id);

CREATE POLICY "battler_follows_delete_own"
  ON public.battler_follows FOR DELETE
  TO authenticated
  USING (auth.uid() = follower_id);

CREATE INDEX IF NOT EXISTS battler_follows_battler_idx
  ON public.battler_follows (battler_id);

-- 3. Notify followers when a battle goes live
CREATE OR REPLACE FUNCTION public.notify_followers_on_battle_live()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.status = 'live' AND (OLD.status IS DISTINCT FROM 'live') THEN
    INSERT INTO public.notifications (user_id, type, actor_id, entity_id, data)
    SELECT DISTINCT bf.follower_id,
           'battle_going_live',
           NEW.host_id,
           NEW.id,
           jsonb_build_object(
             'battle_id', NEW.id,
             'host_id', NEW.host_id,
             'opponent_id', NEW.opponent_id
           )
    FROM public.battler_follows bf
    WHERE bf.battler_id IN (NEW.host_id, NEW.opponent_id)
      AND bf.follower_id NOT IN (NEW.host_id, NEW.opponent_id);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_notify_followers_on_battle_live ON public.live_battles;
CREATE TRIGGER trg_notify_followers_on_battle_live
  AFTER INSERT OR UPDATE OF status ON public.live_battles
  FOR EACH ROW EXECUTE FUNCTION public.notify_followers_on_battle_live();
