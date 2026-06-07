ALTER TABLE public.rank_snapshots
  ADD COLUMN IF NOT EXISTS main_category_slug text,
  ADD COLUMN IF NOT EXISTS subcategory_slug text;

CREATE INDEX IF NOT EXISTS idx_rank_snapshots_subcat_time
  ON public.rank_snapshots (subcategory_slug, captured_at DESC)
  WHERE subcategory_slug IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_rank_snapshots_main_time
  ON public.rank_snapshots (main_category_slug, captured_at DESC)
  WHERE main_category_slug IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_rank_snapshots_post_subcat_scope
  ON public.rank_snapshots (post_id, subcategory_slug, scope, region, captured_at DESC)
  WHERE subcategory_slug IS NOT NULL;