-- 1) Add columns for dimension validation + idempotency
ALTER TABLE public.posts
  ADD COLUMN IF NOT EXISTS media_width int,
  ADD COLUMN IF NOT EXISTS media_height int,
  ADD COLUMN IF NOT EXISTS submission_key text;

-- 2) Per-user idempotency on submission_key (allows nulls, blocks duplicates)
CREATE UNIQUE INDEX IF NOT EXISTS posts_user_submission_key_uidx
  ON public.posts (user_id, submission_key)
  WHERE submission_key IS NOT NULL;

-- 3) Server-side 1080x1080 enforcement via trigger
CREATE OR REPLACE FUNCTION public.posts_validate_dimensions()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $function$
BEGIN
  -- Skip when admins/moderators repair posts; they may have legacy sizes.
  IF auth.uid() IS NOT NULL
     AND (public.has_role(auth.uid(), 'admin'::app_role)
          OR public.has_role(auth.uid(), 'moderator'::app_role)) THEN
    RETURN NEW;
  END IF;

  -- Only enforce on insert or when the dimensions/url change on update.
  IF TG_OP = 'UPDATE'
     AND NEW.media_width IS NOT DISTINCT FROM OLD.media_width
     AND NEW.media_height IS NOT DISTINCT FROM OLD.media_height
     AND NEW.image_url IS NOT DISTINCT FROM OLD.image_url
     AND NEW.video_url IS NOT DISTINCT FROM OLD.video_url THEN
    RETURN NEW;
  END IF;

  IF NEW.media_width IS NULL OR NEW.media_height IS NULL THEN
    RAISE EXCEPTION 'Media size required: every photo or video must be exactly 1080x1080 pixels.';
  END IF;
  IF NEW.media_width <> 1080 OR NEW.media_height <> 1080 THEN
    RAISE EXCEPTION 'Media must be exactly 1080x1080 pixels (got %x%). Please use the in-app camera or crop your media to a perfect square.', NEW.media_width, NEW.media_height;
  END IF;

  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS posts_validate_dimensions_trg ON public.posts;
CREATE TRIGGER posts_validate_dimensions_trg
  BEFORE INSERT OR UPDATE ON public.posts
  FOR EACH ROW
  EXECUTE FUNCTION public.posts_validate_dimensions();

-- 4) Allow user UPDATE policy to also write media_width/height/submission_key
-- (existing posts_guard_owner_updates trigger already locks down protected fields)
-- Add submission_key + media_width + media_height to the guard's allowlist by
-- explicitly NOT raising for them (they aren't in the protected list).
-- The existing trigger already permits any field not in its blocklist, so no
-- change needed there.