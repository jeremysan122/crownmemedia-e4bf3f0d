
-- 1. Extend posts with media metadata
ALTER TABLE public.posts
  ADD COLUMN IF NOT EXISTS media_type text NOT NULL DEFAULT 'image',
  ADD COLUMN IF NOT EXISTS video_url text,
  ADD COLUMN IF NOT EXISTS video_poster_url text,
  ADD COLUMN IF NOT EXISTS duration_ms integer,
  ADD COLUMN IF NOT EXISTS filter text,
  ADD COLUMN IF NOT EXISTS alt_texts text[] NOT NULL DEFAULT '{}'::text[];

-- 2. Validation: media_type, filter, duration
CREATE OR REPLACE FUNCTION public.posts_validate_media()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.media_type NOT IN ('image','video') THEN
    RAISE EXCEPTION 'Invalid media_type: %', NEW.media_type;
  END IF;
  IF NEW.filter IS NOT NULL AND NEW.filter NOT IN (
    'none','sepia','noir','vivid','fade','chrome',
    'shimmer','glitch','pulse-glow','scanlines','gold-sparkle'
  ) THEN
    RAISE EXCEPTION 'Invalid filter: %', NEW.filter;
  END IF;
  IF NEW.media_type = 'video' THEN
    IF NEW.video_url IS NULL OR length(NEW.video_url) = 0 THEN
      RAISE EXCEPTION 'Video posts must have a video_url';
    END IF;
    IF NEW.duration_ms IS NOT NULL AND NEW.duration_ms > 30000 THEN
      RAISE EXCEPTION 'Videos cannot exceed 30 seconds';
    END IF;
  END IF;
  IF NEW.alt_texts IS NULL THEN NEW.alt_texts := '{}'; END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS posts_validate_media_trg ON public.posts;
CREATE TRIGGER posts_validate_media_trg
  BEFORE INSERT OR UPDATE ON public.posts
  FOR EACH ROW EXECUTE FUNCTION public.posts_validate_media();

-- 3. Update owner-edit guard to allow filter and alt_texts
CREATE OR REPLACE FUNCTION public.posts_guard_owner_updates()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL
     OR public.has_role(auth.uid(), 'admin'::app_role)
     OR public.has_role(auth.uid(), 'moderator'::app_role) THEN
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
  THEN
    RAISE EXCEPTION 'Users cannot modify protected post fields';
  END IF;

  IF NEW.category IS DISTINCT FROM OLD.category
     OR NEW.city IS DISTINCT FROM OLD.city
     OR NEW.state IS DISTINCT FROM OLD.state
     OR NEW.country IS DISTINCT FROM OLD.country
  THEN
    RAISE EXCEPTION 'Users may only edit caption, photos, filter, and alt text on a post';
  END IF;

  RETURN NEW;
END;
$$;

-- 4. Media bucket
INSERT INTO storage.buckets (id, name, public)
VALUES ('media', 'media', true)
ON CONFLICT (id) DO NOTHING;

-- 5. Storage RLS for media bucket
DROP POLICY IF EXISTS "Media public read" ON storage.objects;
CREATE POLICY "Media public read"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'media');

DROP POLICY IF EXISTS "Users upload to own media folder" ON storage.objects;
CREATE POLICY "Users upload to own media folder"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'media'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );

DROP POLICY IF EXISTS "Users update own media" ON storage.objects;
CREATE POLICY "Users update own media"
  ON storage.objects FOR UPDATE
  USING (
    bucket_id = 'media'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );

DROP POLICY IF EXISTS "Users delete own media" ON storage.objects;
CREATE POLICY "Users delete own media"
  ON storage.objects FOR DELETE
  USING (
    bucket_id = 'media'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );
