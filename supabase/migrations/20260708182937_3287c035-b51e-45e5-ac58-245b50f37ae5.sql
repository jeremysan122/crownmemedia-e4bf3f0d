
-- =====================================================================
-- Crown Map: pin crowned POSTS, not users.
-- =====================================================================

-- 1. Post location fields (safe-by-default; consent-driven).
ALTER TABLE public.posts
  ADD COLUMN IF NOT EXISTS location_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS location_source text,
  ADD COLUMN IF NOT EXISTS location_label text,
  ADD COLUMN IF NOT EXISTS region_name text,
  ADD COLUMN IF NOT EXISTS region_type text,
  ADD COLUMN IF NOT EXISTS post_lat double precision,
  ADD COLUMN IF NOT EXISTS post_lng double precision,
  ADD COLUMN IF NOT EXISTS post_location_precision text
    NOT NULL DEFAULT 'none',
  ADD COLUMN IF NOT EXISTS location_captured_at timestamptz;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname='posts_location_source_chk'
  ) THEN
    ALTER TABLE public.posts
      ADD CONSTRAINT posts_location_source_chk
      CHECK (location_source IS NULL
             OR location_source IN ('current_location','manual','none'));
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname='posts_location_precision_chk'
  ) THEN
    ALTER TABLE public.posts
      ADD CONSTRAINT posts_location_precision_chk
      CHECK (post_location_precision
             IN ('exact','city','state','country','none'));
  END IF;
END $$;

-- Trigger: enforce that exact lat/lng only ever land on a post with
-- explicit 'current_location' source. Anything else nulls them.
CREATE OR REPLACE FUNCTION public.posts_enforce_location_privacy()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.location_source IS DISTINCT FROM 'current_location'
     OR NEW.location_enabled = false THEN
    NEW.post_lat := NULL;
    NEW.post_lng := NULL;
    IF NEW.post_location_precision = 'exact' THEN
      NEW.post_location_precision := COALESCE(NEW.post_location_precision,'none');
      IF NEW.location_source IS DISTINCT FROM 'current_location' THEN
        NEW.post_location_precision := 'none';
      END IF;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_posts_location_privacy ON public.posts;
CREATE TRIGGER trg_posts_location_privacy
  BEFORE INSERT OR UPDATE OF location_enabled, location_source,
    post_lat, post_lng, post_location_precision
  ON public.posts
  FOR EACH ROW EXECUTE FUNCTION public.posts_enforce_location_privacy();

-- 2. Extend crown_map_points to represent crowned POSTS.
ALTER TABLE public.crown_map_points
  ADD COLUMN IF NOT EXISTS post_id uuid,
  ADD COLUMN IF NOT EXISTS crown_id uuid,
  ADD COLUMN IF NOT EXISTS city text,
  ADD COLUMN IF NOT EXISTS state text,
  ADD COLUMN IF NOT EXISTS country text,
  ADD COLUMN IF NOT EXISTS location_precision text
    NOT NULL DEFAULT 'none',
  ADD COLUMN IF NOT EXISTS location_source text;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname='cmp_location_precision_chk'
  ) THEN
    ALTER TABLE public.crown_map_points
      ADD CONSTRAINT cmp_location_precision_chk
      CHECK (location_precision IN ('exact','city','state','country','none'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS crown_map_points_post_id_idx
  ON public.crown_map_points(post_id);
CREATE INDEX IF NOT EXISTS crown_map_points_category_region_idx
  ON public.crown_map_points(category, region_type);

-- 3. Refresh crowned-post map cache.
--    Priority:
--      1. crowned post with exact post_lat/post_lng + consent
--      2. safe city center from geo_public_centers matched on posts.city
--      3. safe region center matched on region_name
--      4. NULL lat/lng ('none' precision) — client marks unmapped, never
--         invents a coordinate.
CREATE OR REPLACE FUNCTION public.refresh_crown_map_points()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE _count int;
BEGIN
  IF auth.uid() IS NOT NULL
     AND NOT public.has_role(auth.uid(), 'admin'::public.app_role) THEN
    RAISE EXCEPTION 'not authorized';
  END IF;

  DELETE FROM public.crown_map_points;

  INSERT INTO public.crown_map_points
    (user_id, post_id, crown_id, category, region_type, region_name,
     city, state, country, score, rank,
     lat, lng, location_precision, location_source,
     metadata, refreshed_at)
  SELECT
    p.user_id,
    c.post_id,
    c.id                                                  AS crown_id,
    c.category::text,
    c.region_type::text,
    c.region_name,
    NULLIF(btrim(p.city), ''),
    NULLIF(btrim(p.state), ''),
    NULLIF(btrim(p.country), ''),
    c.crown_score::numeric,
    NULL::int,
    -- coord priority
    COALESCE(
      CASE WHEN p.location_enabled
             AND p.location_source = 'current_location'
             AND p.post_lat IS NOT NULL
           THEN p.post_lat END,
      gc_city.lat,
      gc_region.lat
    )::double precision                                   AS lat,
    COALESCE(
      CASE WHEN p.location_enabled
             AND p.location_source = 'current_location'
             AND p.post_lng IS NOT NULL
           THEN p.post_lng END,
      gc_city.lng,
      gc_region.lng
    )::double precision                                   AS lng,
    CASE
      WHEN p.location_enabled
       AND p.location_source = 'current_location'
       AND p.post_lat IS NOT NULL THEN 'exact'
      WHEN gc_city.lat IS NOT NULL THEN 'city'
      WHEN gc_region.lat IS NOT NULL THEN 'state'
      ELSE 'none'
    END                                                   AS location_precision,
    p.location_source,
    jsonb_build_object(
      'title', c.title,
      'caption', left(coalesce(p.caption,''), 140),
      'image_url', p.image_url,
      'media_type', p.media_type
    ),
    now()
  FROM public.crowns c
  JOIN public.posts p ON p.id = c.post_id
  LEFT JOIN public.geo_public_centers gc_city
    ON gc_city.region_type = 'city'
   AND gc_city.region_name_key = lower(btrim(p.city))
   AND NULLIF(btrim(p.city), '') IS NOT NULL
  LEFT JOIN public.geo_public_centers gc_region
    ON gc_region.region_type = c.region_type::text
   AND gc_region.region_name_key = lower(btrim(c.region_name))
  WHERE c.active = true
    AND p.is_removed = false
    AND p.is_archived = false
    AND p.publish_status = 'approved';

  GET DIAGNOSTICS _count = ROW_COUNT;
  RETURN _count;
END;
$$;

-- 4. Public RPC: crowned post map points.
--    No user_id, no profile location. Includes post_id so the UI can
--    open the crowned post from a pin.
DROP FUNCTION IF EXISTS public.get_crowned_post_map_points(text, text, integer);
CREATE FUNCTION public.get_crowned_post_map_points(
  _category    text    DEFAULT NULL,
  _region_type text    DEFAULT NULL,
  _limit       integer DEFAULT 1000
)
RETURNS TABLE (
  post_id             uuid,
  category            text,
  region_type         text,
  region_name         text,
  city                text,
  state               text,
  country             text,
  lat                 double precision,
  lng                 double precision,
  location_precision  text,
  score               numeric,
  rank                integer,
  metadata            jsonb,
  refreshed_at        timestamptz
)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    p.post_id,
    p.category,
    p.region_type,
    p.region_name,
    p.city,
    p.state,
    p.country,
    p.lat,
    p.lng,
    p.location_precision,
    p.score,
    p.rank,
    p.metadata,
    p.refreshed_at
  FROM public.crown_map_points p
  WHERE p.post_id IS NOT NULL
    AND (_category    IS NULL OR p.category    = _category)
    AND (_region_type IS NULL OR p.region_type = _region_type)
  ORDER BY p.score DESC NULLS LAST
  LIMIT COALESCE(_limit, 1000);
$$;

REVOKE ALL ON FUNCTION public.get_crowned_post_map_points(text,text,integer) FROM public;
GRANT EXECUTE ON FUNCTION public.get_crowned_post_map_points(text,text,integer)
  TO anon, authenticated, service_role;
