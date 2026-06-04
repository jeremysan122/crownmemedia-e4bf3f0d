CREATE OR REPLACE FUNCTION public.validate_post_category()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
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