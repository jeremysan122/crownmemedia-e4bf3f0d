-- 1. Muted threads (per-user, per-post)
CREATE TABLE IF NOT EXISTS public.muted_threads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  post_id uuid NOT NULL REFERENCES public.posts(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, post_id)
);
ALTER TABLE public.muted_threads ENABLE ROW LEVEL SECURITY;

CREATE POLICY "users manage own muted threads select"
  ON public.muted_threads FOR SELECT TO authenticated
  USING (auth.uid() = user_id);
CREATE POLICY "users manage own muted threads insert"
  ON public.muted_threads FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);
CREATE POLICY "users manage own muted threads delete"
  ON public.muted_threads FOR DELETE TO authenticated
  USING (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS idx_muted_threads_user_post ON public.muted_threads(user_id, post_id);

-- 2. Helper: is a user muting this post?
CREATE OR REPLACE FUNCTION public.is_thread_muted(_user_id uuid, _post_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (SELECT 1 FROM public.muted_threads WHERE user_id = _user_id AND post_id = _post_id);
$$;

-- 3. Update reply + mention notification triggers to respect mute
CREATE OR REPLACE FUNCTION public.trg_notify_comment_reply()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_parent_author uuid;
  v_post_owner uuid;
BEGIN
  IF NEW.parent_id IS NULL THEN RETURN NULL; END IF;
  SELECT user_id INTO v_parent_author FROM public.comments WHERE id = NEW.parent_id;
  SELECT user_id INTO v_post_owner FROM public.posts WHERE id = NEW.post_id;

  IF v_parent_author IS NULL OR v_parent_author = NEW.user_id THEN RETURN NULL; END IF;
  IF v_parent_author = v_post_owner THEN RETURN NULL; END IF;
  IF NEW.mention_user_ids IS NOT NULL AND v_parent_author = ANY(NEW.mention_user_ids) THEN RETURN NULL; END IF;
  IF NOT public.notif_pref(v_parent_author, 'reply') THEN RETURN NULL; END IF;
  IF public.is_thread_muted(v_parent_author, NEW.post_id) THEN RETURN NULL; END IF;

  INSERT INTO public.notifications (user_id, type, title, body, payload)
  VALUES (
    v_parent_author, 'comment', 'New reply to your comment', left(NEW.body, 80),
    jsonb_build_object('post_id', NEW.post_id, 'comment_id', NEW.id, 'parent_id', NEW.parent_id, 'author_id', NEW.user_id, 'reply', true)
  );
  RETURN NULL;
END;
$$;

CREATE OR REPLACE FUNCTION public.trg_notify_mentions()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  m uuid;
BEGIN
  IF NEW.mention_user_ids IS NULL THEN RETURN NULL; END IF;
  FOREACH m IN ARRAY NEW.mention_user_ids LOOP
    IF m = NEW.user_id THEN CONTINUE; END IF;
    IF NOT public.notif_pref(m, 'mention') THEN CONTINUE; END IF;
    IF public.is_thread_muted(m, NEW.post_id) THEN CONTINUE; END IF;
    INSERT INTO public.notifications (user_id, type, title, body, payload)
    VALUES (
      m, 'comment', 'You were mentioned', left(NEW.body, 80),
      jsonb_build_object('post_id', NEW.post_id, 'comment_id', NEW.id, 'author_id', NEW.user_id, 'mention', true)
    );
  END LOOP;
  RETURN NULL;
END;
$$;

-- 4. Comment edited_at for tracking edits
ALTER TABLE public.comments ADD COLUMN IF NOT EXISTS edited_at timestamptz;

-- 5. Trigger to update notification bodies when a comment is edited
CREATE OR REPLACE FUNCTION public.trg_sync_comment_edit()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.body IS DISTINCT FROM OLD.body THEN
    NEW.edited_at := now();
    UPDATE public.notifications
      SET body = left(NEW.body, 80)
      WHERE type = 'comment'
        AND payload->>'comment_id' = NEW.id::text;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS comments_sync_edit ON public.comments;
CREATE TRIGGER comments_sync_edit
  BEFORE UPDATE ON public.comments
  FOR EACH ROW EXECUTE FUNCTION public.trg_sync_comment_edit();

-- 6. Allow users to update their own comment body
DROP POLICY IF EXISTS "users update own comments" ON public.comments;
CREATE POLICY "users update own comments"
  ON public.comments FOR UPDATE TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);