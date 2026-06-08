CREATE INDEX IF NOT EXISTS idx_rank_snapshots_post_captured
  ON public.rank_snapshots (post_id, captured_at DESC);

CREATE INDEX IF NOT EXISTS idx_rank_snapshots_post_sub_scope_region_time
  ON public.rank_snapshots (post_id, subcategory_slug, scope, region, captured_at DESC);

CREATE INDEX IF NOT EXISTS idx_rank_snapshots_post_main_scope_region_time
  ON public.rank_snapshots (post_id, main_category_slug, scope, region, captured_at DESC);

CREATE INDEX IF NOT EXISTS idx_posts_sub_slug_score
  ON public.posts (subcategory_slug, crown_score DESC);

CREATE INDEX IF NOT EXISTS idx_posts_main_slug_score
  ON public.posts (main_category_slug, crown_score DESC);

CREATE INDEX IF NOT EXISTS idx_posts_city_sub_score
  ON public.posts (city, subcategory_slug, crown_score DESC);

CREATE INDEX IF NOT EXISTS idx_posts_state_sub_score
  ON public.posts (state, subcategory_slug, crown_score DESC);
