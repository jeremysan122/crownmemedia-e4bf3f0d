
-- ============ Aggressive Notifications: follow + crown triggers + admin broadcast ============

-- 1) Follow notifications
CREATE OR REPLACE FUNCTION public.trg_notify_follow()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  follower_name text;
BEGIN
  IF NEW.follower_id = NEW.following_id THEN RETURN NEW; END IF;

  SELECT COALESCE(display_name, username, 'Someone') INTO follower_name
  FROM public.profiles WHERE id = NEW.follower_id;

  INSERT INTO public.notifications (user_id, type, title, body, payload)
  VALUES (
    NEW.following_id,
    'follow',
    follower_name || ' started following you',
    'Tap to view their profile',
    jsonb_build_object('follower_id', NEW.follower_id, 'link', '/u/' || NEW.follower_id)
  );
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS follows_notify ON public.follows;
CREATE TRIGGER follows_notify
AFTER INSERT ON public.follows
FOR EACH ROW EXECUTE FUNCTION public.trg_notify_follow();

-- 2) Crown won / lost notifications (fires when crown record activates or deactivates)
CREATE OR REPLACE FUNCTION public.trg_notify_crown_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- New crown awarded
  IF (TG_OP = 'INSERT' AND NEW.active) OR
     (TG_OP = 'UPDATE' AND NEW.active AND COALESCE(OLD.active, false) = false) THEN
    INSERT INTO public.notifications (user_id, type, title, body, payload)
    VALUES (
      NEW.user_id,
      'crown_won',
      '👑 You won the ' || NEW.title || ' crown!',
      'You now rule ' || NEW.region_name || ' (' || NEW.category::text || ')',
      jsonb_build_object('crown_id', NEW.id, 'post_id', NEW.post_id, 'region', NEW.region_name, 'link', '/leaderboard')
    );
  END IF;

  -- Crown lost (active -> false)
  IF TG_OP = 'UPDATE' AND OLD.active = true AND NEW.active = false THEN
    INSERT INTO public.notifications (user_id, type, title, body, payload)
    VALUES (
      OLD.user_id,
      'crown_lost',
      'You lost the ' || OLD.title || ' crown',
      'Reclaim ' || OLD.region_name || ' before someone else does',
      jsonb_build_object('crown_id', OLD.id, 'region', OLD.region_name, 'link', '/leaderboard')
    );
  END IF;

  RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS crowns_notify ON public.crowns;
CREATE TRIGGER crowns_notify
AFTER INSERT OR UPDATE OF active ON public.crowns
FOR EACH ROW EXECUTE FUNCTION public.trg_notify_crown_change();

-- 3) Admin broadcast: send a system notification to all users (or a segment)
CREATE OR REPLACE FUNCTION public.admin_broadcast_notification(
  _title text,
  _body text,
  _link text DEFAULT NULL,
  _only_active_days int DEFAULT NULL  -- limit to users active in last N days
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  inserted int;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;

  IF length(coalesce(_title, '')) = 0 THEN
    RAISE EXCEPTION 'Title required';
  END IF;

  WITH targets AS (
    SELECT p.id
    FROM public.profiles p
    WHERE _only_active_days IS NULL
       OR p.last_seen_at >= now() - (_only_active_days || ' days')::interval
  ), ins AS (
    INSERT INTO public.notifications (user_id, type, title, body, payload)
    SELECT t.id, 'system', _title, COALESCE(_body, ''),
           jsonb_build_object('link', COALESCE(_link, '/'), 'broadcast', true)
    FROM targets t
    RETURNING 1
  )
  SELECT count(*) INTO inserted FROM ins;

  RETURN inserted;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_broadcast_notification(text, text, text, int) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_broadcast_notification(text, text, text, int) TO authenticated;
