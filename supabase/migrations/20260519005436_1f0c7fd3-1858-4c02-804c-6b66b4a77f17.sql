
-- 1) Add edited_at + pinned_at to posts
ALTER TABLE public.posts
  ADD COLUMN IF NOT EXISTS edited_at timestamptz,
  ADD COLUMN IF NOT EXISTS pinned_at timestamptz;

CREATE INDEX IF NOT EXISTS posts_user_pinned_idx
  ON public.posts (user_id, pinned_at DESC NULLS LAST);

-- 2) Relax owner-update guard: allow category/location edits, auto-stamp edited_at
CREATE OR REPLACE FUNCTION public.posts_guard_owner_updates()
  RETURNS trigger
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public'
AS $function$
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

  -- Protected fields owners may never touch
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
  THEN
    RAISE EXCEPTION 'Users cannot modify protected post fields';
  END IF;

  -- Detect a real content edit (so we auto-stamp edited_at)
  IF NEW.caption     IS DISTINCT FROM OLD.caption
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
  THEN
    v_content_changed := true;
  END IF;

  IF v_content_changed AND NEW.edited_at IS NOT DISTINCT FROM OLD.edited_at THEN
    NEW.edited_at := now();
  END IF;

  RETURN NEW;
END;
$function$;

-- 3) Bookmarks table
CREATE TABLE IF NOT EXISTS public.post_bookmarks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  post_id uuid NOT NULL REFERENCES public.posts(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, post_id)
);

CREATE INDEX IF NOT EXISTS post_bookmarks_user_idx
  ON public.post_bookmarks (user_id, created_at DESC);

ALTER TABLE public.post_bookmarks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "users read own bookmarks"
  ON public.post_bookmarks FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "users add own bookmarks"
  ON public.post_bookmarks FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "users remove own bookmarks"
  ON public.post_bookmarks FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);
