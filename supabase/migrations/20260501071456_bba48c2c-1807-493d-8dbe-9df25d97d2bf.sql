-- Notify the parent comment's author when someone replies
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
  -- Skip if parent author is the post owner (they already got the 'comment' notification)
  IF v_parent_author = v_post_owner THEN
    RETURN NULL;
  END IF;
  -- Skip if parent author was already mentioned (mention notif covers them)
  IF NEW.mention_user_ids IS NOT NULL AND v_parent_author = ANY(NEW.mention_user_ids) THEN
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

DROP TRIGGER IF EXISTS comments_notify_reply ON public.comments;
CREATE TRIGGER comments_notify_reply
AFTER INSERT ON public.comments
FOR EACH ROW EXECUTE FUNCTION public.trg_notify_comment_reply();