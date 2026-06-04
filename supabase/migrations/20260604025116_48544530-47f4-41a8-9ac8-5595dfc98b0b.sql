-- Phase 1: enforce valid (main_category_slug, subcategory_slug) on every post.
-- Backfill any null pairs to royal-crowns / overall first.
UPDATE public.posts
SET main_category_slug = COALESCE(main_category_slug, 'royal-crowns'),
    subcategory_slug = COALESCE(subcategory_slug, 'overall')
WHERE main_category_slug IS NULL OR subcategory_slug IS NULL;

CREATE OR REPLACE FUNCTION public.validate_post_category()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.main_category_slug IS NULL OR NEW.subcategory_slug IS NULL THEN
    RAISE EXCEPTION 'Posts must have main_category_slug and subcategory_slug';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.subcategories s
    JOIN public.main_categories m ON m.id = s.main_category_id
    WHERE m.slug = NEW.main_category_slug
      AND s.slug = NEW.subcategory_slug
      AND s.is_active = true
      AND m.is_active = true
  ) THEN
    RAISE EXCEPTION 'subcategory_slug % does not belong to main_category_slug %',
      NEW.subcategory_slug, NEW.main_category_slug;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS validate_post_category_trg ON public.posts;
CREATE TRIGGER validate_post_category_trg
BEFORE INSERT OR UPDATE OF main_category_slug, subcategory_slug ON public.posts
FOR EACH ROW EXECUTE FUNCTION public.validate_post_category();

CREATE INDEX IF NOT EXISTS posts_main_subcat_idx
  ON public.posts (main_category_slug, subcategory_slug)
  WHERE is_removed = false;