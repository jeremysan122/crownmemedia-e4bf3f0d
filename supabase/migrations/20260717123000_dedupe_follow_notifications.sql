-- One follow previously emitted two notifications: the legacy follower-count
-- trigger inserted a generic row and follows_notify inserted the richer row.
-- Keep trg_follow_counts responsible only for cached counters and leave
-- notification delivery to trg_notify_follow/follows_notify.

BEGIN;

CREATE OR REPLACE FUNCTION public.trg_follow_counts()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE public.profiles
      SET followers_count = followers_count + 1
      WHERE id = NEW.following_id;
    UPDATE public.profiles
      SET following_count = following_count + 1
      WHERE id = NEW.follower_id;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE public.profiles
      SET followers_count = GREATEST(followers_count - 1, 0)
      WHERE id = OLD.following_id;
    UPDATE public.profiles
      SET following_count = GREATEST(following_count - 1, 0)
      WHERE id = OLD.follower_id;
  END IF;
  RETURN NULL;
END;
$$;

COMMENT ON FUNCTION public.trg_follow_counts() IS
  'Maintains profile follow counters only. Follow notifications are emitted by follows_notify.';

COMMIT;
