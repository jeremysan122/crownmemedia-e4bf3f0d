-- 1) Extend notification_type enum with 'repost' (idempotent)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_enum e
    JOIN pg_type t ON t.oid = e.enumtypid
    WHERE t.typname = 'notification_type' AND e.enumlabel = 'repost'
  ) THEN
    ALTER TYPE public.notification_type ADD VALUE 'repost';
  END IF;
END $$;

-- 2) Trigger: when a repost row is inserted, notify the parent post owner
CREATE OR REPLACE FUNCTION public.notify_on_repost()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_parent_owner uuid;
  v_reposter_username text;
BEGIN
  IF NEW.parent_post_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT user_id INTO v_parent_owner FROM public.posts WHERE id = NEW.parent_post_id;
  IF v_parent_owner IS NULL OR v_parent_owner = NEW.user_id THEN
    RETURN NEW;
  END IF;

  SELECT username INTO v_reposter_username FROM public.profiles WHERE user_id = NEW.user_id;

  INSERT INTO public.notifications (user_id, type, title, body, payload)
  VALUES (
    v_parent_owner,
    'repost'::public.notification_type,
    'New repost',
    COALESCE('@' || v_reposter_username, 'Someone') || ' reposted your post',
    jsonb_build_object(
      'repost_id', NEW.id,
      'parent_post_id', NEW.parent_post_id,
      'reposter_user_id', NEW.user_id
    )
  );

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_notify_on_repost ON public.posts;
CREATE TRIGGER trg_notify_on_repost
AFTER INSERT ON public.posts
FOR EACH ROW
WHEN (NEW.parent_post_id IS NOT NULL)
EXECUTE FUNCTION public.notify_on_repost();

-- 3) undo_repost RPC — owner-only, within 5 minute window
CREATE OR REPLACE FUNCTION public.undo_repost(p_repost_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user uuid := auth.uid();
  v_row public.posts%ROWTYPE;
BEGIN
  IF v_user IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'code', 'not_authenticated');
  END IF;

  SELECT * INTO v_row FROM public.posts WHERE id = p_repost_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'code', 'not_found');
  END IF;
  IF v_row.user_id <> v_user THEN
    RETURN jsonb_build_object('ok', false, 'code', 'not_owner');
  END IF;
  IF v_row.parent_post_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'code', 'not_a_repost');
  END IF;
  IF v_row.created_at < now() - interval '5 minutes' THEN
    RETURN jsonb_build_object('ok', false, 'code', 'window_expired');
  END IF;

  -- Remove any pending repost notification for the parent owner tied to this repost
  DELETE FROM public.notifications
   WHERE type = 'repost'::public.notification_type
     AND (payload->>'repost_id')::uuid = p_repost_id;

  DELETE FROM public.posts WHERE id = p_repost_id;

  RETURN jsonb_build_object('ok', true, 'code', 'undone', 'parent_post_id', v_row.parent_post_id);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.undo_repost(uuid) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.undo_repost(uuid) TO authenticated, service_role;

-- 4) Enable realtime updates for posts (idempotent add to publication)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'posts'
  ) THEN
    EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.posts';
  END IF;
END $$;

ALTER TABLE public.posts REPLICA IDENTITY FULL;