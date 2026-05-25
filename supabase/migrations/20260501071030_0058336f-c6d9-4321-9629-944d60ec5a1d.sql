-- Threaded replies + mentions for comments
ALTER TABLE public.comments
  ADD COLUMN IF NOT EXISTS parent_id uuid NULL REFERENCES public.comments(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS mention_user_ids uuid[] NOT NULL DEFAULT '{}'::uuid[];

CREATE INDEX IF NOT EXISTS idx_comments_parent_id ON public.comments(parent_id);
CREATE INDEX IF NOT EXISTS idx_comments_post_id ON public.comments(post_id);
CREATE INDEX IF NOT EXISTS idx_comments_mention_user_ids ON public.comments USING GIN(mention_user_ids);

-- Notify all mentioned users (besides the post owner who already gets a 'comment' notif)
CREATE OR REPLACE FUNCTION public.trg_notify_mentions()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_owner uuid;
  v_uid uuid;
BEGIN
  IF TG_OP <> 'INSERT' THEN
    RETURN NULL;
  END IF;
  IF NEW.mention_user_ids IS NULL OR array_length(NEW.mention_user_ids, 1) IS NULL THEN
    RETURN NULL;
  END IF;
  SELECT user_id INTO v_owner FROM public.posts WHERE id = NEW.post_id;
  FOREACH v_uid IN ARRAY NEW.mention_user_ids LOOP
    -- Don't notify yourself; don't double-notify the post owner (they already got a 'comment' notif)
    IF v_uid IS NULL OR v_uid = NEW.user_id OR v_uid = v_owner THEN
      CONTINUE;
    END IF;
    INSERT INTO public.notifications (user_id, type, title, body, payload)
    VALUES (
      v_uid, 'comment', 'You were mentioned',
      left(NEW.body, 80),
      jsonb_build_object('post_id', NEW.post_id, 'comment_id', NEW.id, 'author_id', NEW.user_id, 'mention', true)
    );
  END LOOP;
  RETURN NULL;
END;
$function$;

DROP TRIGGER IF EXISTS comments_notify_mentions ON public.comments;
CREATE TRIGGER comments_notify_mentions
AFTER INSERT ON public.comments
FOR EACH ROW EXECUTE FUNCTION public.trg_notify_mentions();