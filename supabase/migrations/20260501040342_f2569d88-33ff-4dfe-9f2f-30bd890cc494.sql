-- Add multi-photo support to posts (up to 10)
ALTER TABLE public.posts
  ADD COLUMN IF NOT EXISTS image_urls TEXT[] NOT NULL DEFAULT '{}';

-- Backfill: ensure existing single-image posts also expose image_urls
UPDATE public.posts
SET image_urls = ARRAY[image_url]
WHERE (image_urls IS NULL OR array_length(image_urls, 1) IS NULL)
  AND image_url IS NOT NULL;

-- Cap at 10 images per post
CREATE OR REPLACE FUNCTION public.posts_validate_image_urls()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.image_urls IS NULL THEN
    NEW.image_urls := '{}';
  END IF;
  IF array_length(NEW.image_urls, 1) > 10 THEN
    RAISE EXCEPTION 'A post can contain at most 10 images';
  END IF;
  -- Keep image_url synced with first element for back-compat
  IF array_length(NEW.image_urls, 1) >= 1 THEN
    NEW.image_url := NEW.image_urls[1];
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS posts_validate_image_urls_trg ON public.posts;
CREATE TRIGGER posts_validate_image_urls_trg
BEFORE INSERT OR UPDATE ON public.posts
FOR EACH ROW
EXECUTE FUNCTION public.posts_validate_image_urls();