-- Tier 3: scheduling, repost/quote, tagged people --------------------------
ALTER TABLE public.posts
  ADD COLUMN IF NOT EXISTS scheduled_for timestamptz,
  ADD COLUMN IF NOT EXISTS parent_post_id uuid REFERENCES public.posts(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS repost_caption text,
  ADD COLUMN IF NOT EXISTS tagged_user_ids uuid[] NOT NULL DEFAULT '{}'::uuid[];

CREATE INDEX IF NOT EXISTS posts_scheduled_for_idx ON public.posts (scheduled_for) WHERE scheduled_for IS NOT NULL;
CREATE INDEX IF NOT EXISTS posts_parent_post_id_idx ON public.posts (parent_post_id) WHERE parent_post_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS posts_tagged_user_ids_idx ON public.posts USING GIN (tagged_user_ids);

-- Hide future-scheduled posts from non-owners ------------------------------
DROP POLICY IF EXISTS "Posts viewable per privacy" ON public.posts;
CREATE POLICY "Posts viewable per privacy" ON public.posts
FOR SELECT USING (
  (
    is_removed = false
    AND can_view_posts_of(user_id)
    AND (scheduled_for IS NULL OR scheduled_for <= now())
  )
  OR auth.uid() = user_id
  OR has_role(auth.uid(), 'moderator'::app_role)
  OR has_role(auth.uid(), 'admin'::app_role)
);

-- Allow owners to update their new editable fields, keep protections -------
CREATE OR REPLACE FUNCTION public.posts_guard_owner_updates()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
DECLARE
  v_content_changed boolean := false;
BEGIN
  IF auth.uid() IS NULL
     OR public.has_role(auth.uid(), 'admin'::app_role)
     OR public.has_role(auth.uid(), 'moderator'::app_role) THEN
    RETURN NEW;
  END IF;

  IF pg_trigger_depth() > 1 THEN
    RETURN NEW;
  END IF;

  IF auth.uid() <> OLD.user_id THEN
    RETURN NEW;
  END IF;

  IF NEW.crown_score IS DISTINCT FROM OLD.crown_score
     OR NEW.vote_count IS DISTINCT FROM OLD.vote_count
     OR NEW.comment_count IS DISTINCT FROM OLD.comment_count
     OR NEW.share_count IS DISTINCT FROM OLD.share_count
     OR NEW.battle_wins IS DISTINCT FROM OLD.battle_wins
     OR NEW.user_id IS DISTINCT FROM OLD.user_id
     OR NEW.created_at IS DISTINCT FROM OLD.created_at
     OR NEW.media_type IS DISTINCT FROM OLD.media_type
     OR NEW.video_url IS DISTINCT FROM OLD.video_url
     OR NEW.duration_ms IS DISTINCT FROM OLD.duration_ms
     OR NEW.parent_post_id IS DISTINCT FROM OLD.parent_post_id
  THEN
    RAISE EXCEPTION 'Users cannot modify protected post fields';
  END IF;

  IF NEW.caption        IS DISTINCT FROM OLD.caption
     OR NEW.image_url   IS DISTINCT FROM OLD.image_url
     OR NEW.image_urls  IS DISTINCT FROM OLD.image_urls
     OR NEW.filter      IS DISTINCT FROM OLD.filter
     OR NEW.photo_filter IS DISTINCT FROM OLD.photo_filter
     OR NEW.video_filter IS DISTINCT FROM OLD.video_filter
     OR NEW.filter_type IS DISTINCT FROM OLD.filter_type
     OR NEW.alt_texts   IS DISTINCT FROM OLD.alt_texts
     OR NEW.category    IS DISTINCT FROM OLD.category
     OR NEW.city        IS DISTINCT FROM OLD.city
     OR NEW.state       IS DISTINCT FROM OLD.state
     OR NEW.country     IS DISTINCT FROM OLD.country
     OR NEW.tagged_user_ids IS DISTINCT FROM OLD.tagged_user_ids
     OR NEW.repost_caption  IS DISTINCT FROM OLD.repost_caption
     OR NEW.scheduled_for   IS DISTINCT FROM OLD.scheduled_for
  THEN
    v_content_changed := true;
  END IF;

  IF v_content_changed AND NEW.edited_at IS NOT DISTINCT FROM OLD.edited_at THEN
    NEW.edited_at := now();
  END IF;

  RETURN NEW;
END;
$$;

-- Tag notifications --------------------------------------------------------
CREATE OR REPLACE FUNCTION public.posts_notify_tagged()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_uid uuid;
  v_username text;
  v_added uuid[];
BEGIN
  IF TG_OP = 'INSERT' THEN
    v_added := COALESCE(NEW.tagged_user_ids, '{}'::uuid[]);
  ELSE
    v_added := ARRAY(
      SELECT u FROM unnest(COALESCE(NEW.tagged_user_ids, '{}'::uuid[])) AS u
      WHERE u <> ALL (COALESCE(OLD.tagged_user_ids, '{}'::uuid[]))
    );
  END IF;

  IF array_length(v_added, 1) IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT username INTO v_username FROM public.profiles WHERE id = NEW.user_id;

  FOREACH v_uid IN ARRAY v_added LOOP
    IF v_uid IS NULL OR v_uid = NEW.user_id THEN CONTINUE; END IF;
    INSERT INTO public.notifications (user_id, type, title, body, payload)
    VALUES (
      v_uid,
      'mention'::notification_type,
      'You were tagged',
      COALESCE('@' || v_username, 'Someone') || ' tagged you in a post',
      jsonb_build_object('post_id', NEW.id, 'actor_id', NEW.user_id)
    );
  END LOOP;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS posts_notify_tagged_ins ON public.posts;
CREATE TRIGGER posts_notify_tagged_ins
AFTER INSERT ON public.posts
FOR EACH ROW EXECUTE FUNCTION public.posts_notify_tagged();

DROP TRIGGER IF EXISTS posts_notify_tagged_upd ON public.posts;
CREATE TRIGGER posts_notify_tagged_upd
AFTER UPDATE OF tagged_user_ids ON public.posts
FOR EACH ROW EXECUTE FUNCTION public.posts_notify_tagged();
