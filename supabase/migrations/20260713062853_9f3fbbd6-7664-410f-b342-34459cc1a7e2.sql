
CREATE OR REPLACE FUNCTION public.my_frame_reward_stats()
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  uid uuid := auth.uid();
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;
  RETURN public.frame_reward_stats(uid);
END;
$$;

REVOKE ALL ON FUNCTION public.my_frame_reward_stats() FROM public, anon;
GRANT EXECUTE ON FUNCTION public.my_frame_reward_stats() TO authenticated;

-- Notification trigger for newly unlocked frames.
CREATE OR REPLACE FUNCTION public.tg_notify_frame_unlock()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  BEGIN
    INSERT INTO public.notifications (user_id, type, data)
    VALUES (
      NEW.user_id,
      'frame_unlocked',
      jsonb_build_object('frame_key', NEW.frame_key)
    );
  EXCEPTION WHEN OTHERS THEN
    -- Never block the unlock if notifications insert fails.
    NULL;
  END;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_notify_frame_unlock ON public.avatar_frame_unlocks;
CREATE TRIGGER trg_notify_frame_unlock
AFTER INSERT ON public.avatar_frame_unlocks
FOR EACH ROW EXECUTE FUNCTION public.tg_notify_frame_unlock();
