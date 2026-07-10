
-- 1. Expand status CHECK to allow 'scheduled'
ALTER TABLE public.live_battles DROP CONSTRAINT IF EXISTS live_battles_status_check;
ALTER TABLE public.live_battles
  ADD CONSTRAINT live_battles_status_check
  CHECK (status = ANY (ARRAY['pending','scheduled','live','ended','declined','cancelled']));

-- 2. Rewrite notify_followers_on_battle_live with correct columns + safe TG_OP handling
CREATE OR REPLACE FUNCTION public.notify_followers_on_battle_live()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  should_notify boolean := false;
BEGIN
  IF TG_OP = 'INSERT' THEN
    should_notify := (NEW.status = 'live');
  ELSIF TG_OP = 'UPDATE' THEN
    should_notify := (NEW.status = 'live' AND OLD.status IS DISTINCT FROM 'live');
  END IF;

  IF should_notify THEN
    INSERT INTO public.notifications (user_id, type, title, body, payload)
    SELECT DISTINCT bf.follower_id,
           'system'::notification_type,
           'A battler you follow is live',
           'Tap to watch the battle.',
           jsonb_build_object(
             'kind', 'battle_going_live',
             'battle_id', NEW.id,
             'host_id', NEW.host_id,
             'opponent_id', NEW.opponent_id,
             'link', '/live/' || NEW.id::text
           )
    FROM public.battler_follows bf
    WHERE bf.battler_id IN (NEW.host_id, NEW.opponent_id)
      AND bf.follower_id <> NEW.host_id
      AND (NEW.opponent_id IS NULL OR bf.follower_id <> NEW.opponent_id);
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_notify_followers_on_battle_live ON public.live_battles;
CREATE TRIGGER trg_notify_followers_on_battle_live
  AFTER INSERT OR UPDATE OF status ON public.live_battles
  FOR EACH ROW EXECUTE FUNCTION public.notify_followers_on_battle_live();
