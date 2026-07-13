
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
    INSERT INTO public.notifications (user_id, type, title, body, payload)
    VALUES (
      NEW.user_id,
      'system'::notification_type,
      'New royal frame unlocked',
      COALESCE(ach_name, 'A new frame is available'),
      jsonb_build_object(
        'kind', 'frame_unlocked',
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
