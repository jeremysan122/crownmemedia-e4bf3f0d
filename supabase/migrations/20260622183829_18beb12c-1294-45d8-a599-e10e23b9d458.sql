
ALTER TABLE public.posts
  ADD COLUMN IF NOT EXISTS ai_searchable_text TEXT,
  ADD COLUMN IF NOT EXISTS ai_suggested_main_category_slug TEXT;

-- Lightweight trigram-friendly btree on the suggested category for filter
-- recall fallbacks. The OCR text uses ILIKE in the existing search code, so
-- we don't add a heavy GIN index until usage proves it out.
CREATE INDEX IF NOT EXISTS idx_posts_ai_suggested_main_category
  ON public.posts(ai_suggested_main_category_slug)
  WHERE ai_suggested_main_category_slug IS NOT NULL;
