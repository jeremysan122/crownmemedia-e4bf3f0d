
-- ============================================================
-- Crown Map Points: privacy hardening + safe public read path
-- ============================================================

-- 1) Drop the unsafe "any signed-in user can read every row" policy
DROP POLICY IF EXISTS "crown_map_points readable to signed-in users" ON public.crown_map_points;

-- 2) Explicit GRANTs (RLS still gates every row)
REVOKE ALL ON public.crown_map_points FROM anon;
REVOKE ALL ON public.crown_map_points FROM authenticated;
GRANT SELECT ON public.crown_map_points TO authenticated;
GRANT ALL    ON public.crown_map_points TO service_role;

-- 3) RLS: owner-only raw reads; admin/security_admin can read all;
--    writes are admin-only from the client (service_role bypasses RLS).
ALTER TABLE public.crown_map_points ENABLE ROW LEVEL SECURITY;

CREATE POLICY "cmp_select_own_or_admin"
  ON public.crown_map_points
  FOR SELECT
  TO authenticated
  USING (
    auth.uid() = user_id
    OR public.has_role(auth.uid(), 'admin'::public.app_role)
    OR public.has_role(auth.uid(), 'security_admin'::public.app_role)
  );

CREATE POLICY "cmp_write_admin_only"
  ON public.crown_map_points
  FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::public.app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));

-- 4) Safe PUBLIC read RPC — returns aggregate / coarse map data only.
--    NEVER returns user_id, exact lat/lng, address, or metadata.
--    Coordinates are rounded to ~11 km (1 decimal). anon + authenticated may call it.
CREATE OR REPLACE FUNCTION public.get_crown_map_public_points(
  _category    text DEFAULT NULL,
  _region_type text DEFAULT NULL,
  _limit       int  DEFAULT 500
)
RETURNS TABLE (
  region_type  text,
  region_name  text,
  category     text,
  score        numeric,
  rank         int,
  crown_count  bigint,
  post_count   bigint,
  coarse_lat   numeric,
  coarse_lng   numeric,
  refreshed_at timestamptz
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    p.region_type,
    p.region_name,
    p.category,
    max(p.score)                                        AS score,
    min(p.rank)                                         AS rank,
    count(*)::bigint                                    AS crown_count,
    count(*)::bigint                                    AS post_count,
    CASE WHEN avg(p.lat) IS NULL THEN NULL
         ELSE round(avg(p.lat)::numeric, 1) END          AS coarse_lat,
    CASE WHEN avg(p.lng) IS NULL THEN NULL
         ELSE round(avg(p.lng)::numeric, 1) END          AS coarse_lng,
    max(p.refreshed_at)                                 AS refreshed_at
  FROM public.crown_map_points p
  WHERE (_category    IS NULL OR p.category    = _category)
    AND (_region_type IS NULL OR p.region_type = _region_type)
  GROUP BY p.region_type, p.region_name, p.category
  ORDER BY score DESC NULLS LAST
  LIMIT COALESCE(_limit, 500);
$$;

REVOKE ALL ON FUNCTION public.get_crown_map_public_points(text, text, int) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_crown_map_public_points(text, text, int) TO anon, authenticated;

-- 5) Owner-only RPC — returns ONLY auth.uid()'s own raw points.
CREATE OR REPLACE FUNCTION public.get_my_crown_map_points()
RETURNS SETOF public.crown_map_points
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT * FROM public.crown_map_points WHERE user_id = auth.uid();
$$;

REVOKE ALL ON FUNCTION public.get_my_crown_map_points() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_my_crown_map_points() TO authenticated;

-- 6) Refresh job — admin-only or service_role. Populates crown_map_points
--    from public/active crowns; no private profile/device location used.
CREATE OR REPLACE FUNCTION public.refresh_crown_map_points()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE _count int;
BEGIN
  -- service_role calls have auth.uid() = NULL and bypass this check.
  IF auth.uid() IS NOT NULL
     AND NOT public.has_role(auth.uid(), 'admin'::public.app_role) THEN
    RAISE EXCEPTION 'not authorized';
  END IF;

  DELETE FROM public.crown_map_points;

  INSERT INTO public.crown_map_points
    (user_id, category, region_type, region_name, score, rank, lat, lng, metadata, refreshed_at)
  SELECT
    c.user_id,
    c.category::text,
    c.region_type::text,
    c.region_name,
    c.crown_score::numeric,
    NULL::int,
    NULL::double precision,   -- exact coords intentionally not cached
    NULL::double precision,
    '{}'::jsonb,
    now()
  FROM public.crowns c
  WHERE c.active = true;

  GET DIAGNOSTICS _count = ROW_COUNT;
  RETURN _count;
END;
$$;

REVOKE ALL ON FUNCTION public.refresh_crown_map_points() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.refresh_crown_map_points() TO service_role;
