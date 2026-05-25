-- Notification preferences per user
CREATE TABLE IF NOT EXISTS public.notification_preferences (
  user_id uuid PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE,
  reply_alerts boolean NOT NULL DEFAULT true,
  mention_alerts boolean NOT NULL DEFAULT true,
  dm_alerts boolean NOT NULL DEFAULT true,
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.notification_preferences ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users view own notif prefs" ON public.notification_preferences;
CREATE POLICY "Users view own notif prefs"
  ON public.notification_preferences FOR SELECT
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users insert own notif prefs" ON public.notification_preferences;
CREATE POLICY "Users insert own notif prefs"
  ON public.notification_preferences FOR INSERT
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users update own notif prefs" ON public.notification_preferences;
CREATE POLICY "Users update own notif prefs"
  ON public.notification_preferences FOR UPDATE
  USING (auth.uid() = user_id);

-- Auto-create a default row for every new profile
CREATE OR REPLACE FUNCTION public.create_default_notification_prefs()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  INSERT INTO public.notification_preferences (user_id)
  VALUES (NEW.id)
  ON CONFLICT (user_id) DO NOTHING;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS profiles_create_notif_prefs ON public.profiles;
CREATE TRIGGER profiles_create_notif_prefs
AFTER INSERT ON public.profiles
FOR EACH ROW EXECUTE FUNCTION public.create_default_notification_prefs();

-- Backfill defaults for existing profiles
INSERT INTO public.notification_preferences (user_id)
SELECT id FROM public.profiles
ON CONFLICT (user_id) DO NOTHING;

-- Helper to read a single preference (defaults to TRUE if missing)
CREATE OR REPLACE FUNCTION public.notif_pref(_user_id uuid, _kind text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT COALESCE(
    (SELECT CASE _kind
        WHEN 'reply' THEN reply_alerts
        WHEN 'mention' THEN mention_alerts
        WHEN 'dm' THEN dm_alerts
        ELSE true
      END
     FROM public.notification_preferences WHERE user_id = _user_id),
    true
  );
$$;

-- Recreate reply trigger to honour preference
CREATE OR REPLACE FUNCTION public.trg_notify_comment_reply()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_parent_author uuid;
  v_post_owner uuid;
BEGIN
  IF NEW.parent_id IS NULL THEN
    RETURN NULL;
  END IF;

  SELECT user_id INTO v_parent_author FROM public.comments WHERE id = NEW.parent_id;
  SELECT user_id INTO v_post_owner FROM public.posts WHERE id = NEW.post_id;

  IF v_parent_author IS NULL OR v_parent_author = NEW.user_id THEN
    RETURN NULL;
  END IF;
  IF v_parent_author = v_post_owner THEN
    RETURN NULL;
  END IF;
  IF NEW.mention_user_ids IS NOT NULL AND v_parent_author = ANY(NEW.mention_user_ids) THEN
    RETURN NULL;
  END IF;
  IF NOT public.notif_pref(v_parent_author, 'reply') THEN
    RETURN NULL;
  END IF;

  INSERT INTO public.notifications (user_id, type, title, body, payload)
  VALUES (
    v_parent_author,
    'comment',
    'New reply to your comment',
    left(NEW.body, 80),
    jsonb_build_object('post_id', NEW.post_id, 'comment_id', NEW.id, 'parent_id', NEW.parent_id, 'author_id', NEW.user_id, 'reply', true)
  );
  RETURN NULL;
END;
$function$;

-- Recreate mentions trigger to honour preference (find existing fn name, recreate generic)
CREATE OR REPLACE FUNCTION public.trg_notify_mentions()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  m uuid;
BEGIN
  IF NEW.mention_user_ids IS NULL THEN RETURN NULL; END IF;
  FOREACH m IN ARRAY NEW.mention_user_ids LOOP
    IF m = NEW.user_id THEN CONTINUE; END IF;
    IF NOT public.notif_pref(m, 'mention') THEN CONTINUE; END IF;
    INSERT INTO public.notifications (user_id, type, title, body, payload)
    VALUES (
      m,
      'comment',
      'You were mentioned',
      left(NEW.body, 80),
      jsonb_build_object('post_id', NEW.post_id, 'comment_id', NEW.id, 'author_id', NEW.user_id, 'mention', true)
    );
  END LOOP;
  RETURN NULL;
END;
$function$;
