CREATE OR REPLACE FUNCTION public.trg_notify_follow()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  follower_name text;
  follower_uname text;
  link_path text;
BEGIN
  IF NEW.follower_id = NEW.following_id THEN RETURN NEW; END IF;

  SELECT COALESCE(display_name, username, 'Someone'), username
    INTO follower_name, follower_uname
  FROM public.profiles WHERE id = NEW.follower_id;

  link_path := '/u/' || COALESCE(follower_uname, NEW.follower_id::text);

  INSERT INTO public.notifications (user_id, type, title, body, payload)
  VALUES (
    NEW.following_id,
    'follow',
    follower_name || ' started following you',
    'Tap to view their profile',
    jsonb_build_object(
      'follower_id', NEW.follower_id,
      'follower_username', follower_uname,
      'link', link_path
    )
  );
  RETURN NEW;
END;
$$;