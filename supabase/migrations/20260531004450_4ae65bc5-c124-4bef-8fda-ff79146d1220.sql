-- 1. Add reply_count column for comment reply UI
ALTER TABLE public.comments
  ADD COLUMN IF NOT EXISTS reply_count integer NOT NULL DEFAULT 0;

-- 2. Index for fast lookup of replies under a parent
CREATE INDEX IF NOT EXISTS comments_parent_id_idx ON public.comments(parent_id) WHERE parent_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS comments_post_id_created_idx ON public.comments(post_id, created_at DESC);

-- 3. Validation trigger: parent must be on same post AND must itself be top-level (depth cap = 1)
CREATE OR REPLACE FUNCTION public.validate_comment_parent()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  parent_row public.comments%ROWTYPE;
BEGIN
  IF NEW.parent_id IS NULL THEN
    RETURN NEW;
  END IF;
  SELECT * INTO parent_row FROM public.comments WHERE id = NEW.parent_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Parent comment not found';
  END IF;
  IF parent_row.parent_id IS NOT NULL THEN
    RAISE EXCEPTION 'Replies cannot be nested more than one level';
  END IF;
  IF parent_row.post_id <> NEW.post_id THEN
    RAISE EXCEPTION 'Reply must belong to the same post as its parent';
  END IF;
  IF parent_row.is_removed THEN
    RAISE EXCEPTION 'Cannot reply to a removed comment';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_validate_comment_parent ON public.comments;
CREATE TRIGGER trg_validate_comment_parent
BEFORE INSERT ON public.comments
FOR EACH ROW
EXECUTE FUNCTION public.validate_comment_parent();

-- 4. Maintain reply_count on parent
CREATE OR REPLACE FUNCTION public.bump_reply_count()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' AND NEW.parent_id IS NOT NULL THEN
    UPDATE public.comments
      SET reply_count = reply_count + 1
      WHERE id = NEW.parent_id;
  ELSIF TG_OP = 'DELETE' AND OLD.parent_id IS NOT NULL THEN
    UPDATE public.comments
      SET reply_count = GREATEST(0, reply_count - 1)
      WHERE id = OLD.parent_id;
  END IF;
  RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS trg_bump_reply_count ON public.comments;
CREATE TRIGGER trg_bump_reply_count
AFTER INSERT OR DELETE ON public.comments
FOR EACH ROW
EXECUTE FUNCTION public.bump_reply_count();

-- 5. Backfill existing reply_count once
UPDATE public.comments p
SET reply_count = sub.cnt
FROM (
  SELECT parent_id, COUNT(*)::int AS cnt
  FROM public.comments
  WHERE parent_id IS NOT NULL
  GROUP BY parent_id
) sub
WHERE p.id = sub.parent_id
  AND p.reply_count IS DISTINCT FROM sub.cnt;

-- 6. RPC: mark all of caller's notifications as read
CREATE OR REPLACE FUNCTION public.mark_all_notifications_read()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  uid uuid := auth.uid();
  affected integer;
BEGIN
  IF uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;
  UPDATE public.notifications
    SET read = true
    WHERE user_id = uid AND read = false;
  GET DIAGNOSTICS affected = ROW_COUNT;
  RETURN affected;
END;
$$;

REVOKE ALL ON FUNCTION public.mark_all_notifications_read() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.mark_all_notifications_read() TO authenticated;

-- 7. RPC: mark all of caller's received messages as read
CREATE OR REPLACE FUNCTION public.mark_all_messages_read()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  uid uuid := auth.uid();
  affected integer;
BEGIN
  IF uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;
  UPDATE public.messages
    SET read = true
    WHERE receiver_id = uid AND read = false;
  GET DIAGNOSTICS affected = ROW_COUNT;
  RETURN affected;
END;
$$;

REVOKE ALL ON FUNCTION public.mark_all_messages_read() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.mark_all_messages_read() TO authenticated;