
CREATE OR REPLACE FUNCTION public.snapshot_post_ranks()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_captured_at timestamptz := now();
  v_limit int := 200;
BEGIN
  WITH eligible AS (
    SELECT p.id, p.category, p.city, p.state, p.crown_score, p.created_at,
           s.slug AS subcategory_slug, mc.slug AS main_category_slug
      FROM public.posts p
      JOIN public.subcategories s
        ON s.slug = p.subcategory_slug AND s.is_active = true
      JOIN public.main_categories mc
        ON mc.id = s.main_category_id
     WHERE COALESCE(p.is_removed, false) = false
       AND COALESCE(p.is_archived, false) = false
       AND p.moderation_status = 'approved'
       AND p.subcategory_slug IS NOT NULL
  ),
  global_ranked AS (
    SELECT id, category, main_category_slug, subcategory_slug,
           crown_score, 'global'::text AS scope, 'Global'::text AS region,
           ROW_NUMBER() OVER (
             PARTITION BY subcategory_slug
             ORDER BY crown_score DESC, created_at ASC, id ASC
           ) AS rnk,
           COUNT(*) OVER (PARTITION BY subcategory_slug) AS total
      FROM eligible
  ),
  city_ranked AS (
    SELECT id, category, main_category_slug, subcategory_slug,
           crown_score, 'city'::text AS scope, city AS region,
           ROW_NUMBER() OVER (
             PARTITION BY subcategory_slug, city
             ORDER BY crown_score DESC, created_at ASC, id ASC
           ) AS rnk,
           COUNT(*) OVER (PARTITION BY subcategory_slug, city) AS total
      FROM eligible
     WHERE city IS NOT NULL AND city <> ''
  ),
  state_ranked AS (
    SELECT id, category, main_category_slug, subcategory_slug,
           crown_score, 'state'::text AS scope, state AS region,
           ROW_NUMBER() OVER (
             PARTITION BY subcategory_slug, state
             ORDER BY crown_score DESC, created_at ASC, id ASC
           ) AS rnk,
           COUNT(*) OVER (PARTITION BY subcategory_slug, state) AS total
      FROM eligible
     WHERE state IS NOT NULL AND state <> ''
  ),
  all_ranked AS (
    SELECT * FROM global_ranked WHERE rnk <= v_limit
    UNION ALL
    SELECT * FROM city_ranked   WHERE rnk <= v_limit
    UNION ALL
    SELECT * FROM state_ranked  WHERE rnk <= v_limit
  )
  INSERT INTO public.rank_snapshots
    (post_id, category, scope, region, rank, total, crown_score,
     captured_at, main_category_slug, subcategory_slug)
  SELECT id, category, scope::public.region_type, region,
         rnk::int, total::int, crown_score,
         v_captured_at, main_category_slug, subcategory_slug
    FROM all_ranked;
END;
$$;
