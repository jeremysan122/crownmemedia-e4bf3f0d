CREATE OR REPLACE FUNCTION public.trg_notify_follow()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  follower_uname text;
  link_path text;
BEGIN
  IF NEW.follower_id = NEW.following_id THEN RETURN NEW; END IF;

  SELECT username INTO follower_uname
  FROM public.profiles WHERE id = NEW.follower_id;

  link_path := '/' || COALESCE(follower_uname, NEW.follower_id::text);

  INSERT INTO public.notifications (user_id, type, title, body, payload)
  VALUES (
    NEW.following_id,
    'follow',
    COALESCE('@' || follower_uname, 'Someone') || ' started following you',
    'Tap to view their profile',
    jsonb_build_object(
      'follower_id', NEW.follower_id,
      'follower_username', follower_uname,
      'link', link_path
    )
  );
  RETURN NEW;
END;
$function$;