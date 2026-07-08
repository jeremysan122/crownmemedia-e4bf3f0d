
-- ============================================================
-- Crown Map marker accuracy: public region centers
-- ============================================================
-- Adds a safe reference table of public region centers (country /
-- state / province / city) and reworks refresh_crown_map_points()
-- to source coordinates from it via LEFT JOIN. Exact user, device,
-- or profile location is never touched.

-- 1) Reference table
CREATE TABLE IF NOT EXISTS public.geo_public_centers (
  region_type text NOT NULL,
  region_name_key text NOT NULL,   -- lower(trim()) normalized key
  region_name_display text NOT NULL,
  lat double precision NOT NULL,
  lng double precision NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (region_type, region_name_key)
);

GRANT SELECT ON public.geo_public_centers TO anon, authenticated;
GRANT ALL    ON public.geo_public_centers TO service_role;

ALTER TABLE public.geo_public_centers ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "geo_public_centers readable to all" ON public.geo_public_centers;
CREATE POLICY "geo_public_centers readable to all"
  ON public.geo_public_centers FOR SELECT
  TO anon, authenticated
  USING (true);

DROP POLICY IF EXISTS "geo_public_centers admin write" ON public.geo_public_centers;
CREATE POLICY "geo_public_centers admin write"
  ON public.geo_public_centers FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::public.app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));

-- 2) Seed (idempotent). Coordinates rounded to 1 decimal (~11 km).
INSERT INTO public.geo_public_centers (region_type, region_name_key, region_name_display, lat, lng) VALUES
  -- Countries
  ('country','united states','United States',37.1,-95.7),
  ('country','canada','Canada',56.1,-106.3),
  ('country','mexico','Mexico',23.6,-102.6),
  ('country','united kingdom','United Kingdom',55.4,-3.4),
  ('country','france','France',46.2,2.2),
  ('country','germany','Germany',51.2,10.5),
  ('country','spain','Spain',40.5,-3.7),
  ('country','italy','Italy',41.9,12.6),
  ('country','brazil','Brazil',-14.2,-51.9),
  ('country','argentina','Argentina',-38.4,-63.6),
  ('country','india','India',20.6,79.0),
  ('country','china','China',35.9,104.2),
  ('country','japan','Japan',36.2,138.3),
  ('country','south korea','South Korea',35.9,127.8),
  ('country','australia','Australia',-25.3,133.8),
  ('country','new zealand','New Zealand',-40.9,174.9),
  ('country','south africa','South Africa',-30.6,22.9),
  ('country','nigeria','Nigeria',9.1,8.7),
  ('country','united arab emirates','United Arab Emirates',23.4,53.8),
  ('country','saudi arabia','Saudi Arabia',23.9,45.1),
  -- US states (subset — grows as needed)
  ('state','california','California',36.1,-119.7),
  ('state','texas','Texas',31.1,-97.6),
  ('state','new york','New York',42.2,-74.9),
  ('state','florida','Florida',27.8,-81.7),
  ('state','illinois','Illinois',40.3,-89.0),
  ('state','wisconsin','Wisconsin',44.3,-89.6),
  ('state','tennessee','Tennessee',35.7,-86.7),
  ('state','washington','Washington',47.4,-121.5),
  ('state','ohio','Ohio',40.4,-82.8),
  ('state','georgia','Georgia',33.0,-83.6),
  ('state','north carolina','North Carolina',35.6,-79.8),
  ('state','minnesota','Minnesota',45.7,-93.9),
  ('state','missouri','Missouri',38.5,-92.3),
  ('state','indiana','Indiana',39.8,-86.3),
  ('state','massachusetts','Massachusetts',42.2,-71.5),
  ('state','pennsylvania','Pennsylvania',40.6,-77.2),
  ('state','arizona','Arizona',33.7,-111.4),
  ('state','colorado','Colorado',39.1,-105.3),
  ('state','nevada','Nevada',38.3,-117.1),
  ('state','louisiana','Louisiana',31.2,-91.9),
  -- Canadian provinces
  ('state','alberta','Alberta',53.9,-116.6),
  ('state','british columbia','British Columbia',53.7,-127.6),
  ('state','manitoba','Manitoba',53.8,-98.8),
  ('state','new brunswick','New Brunswick',46.6,-66.5),
  ('state','newfoundland and labrador','Newfoundland and Labrador',53.1,-57.7),
  ('state','northwest territories','Northwest Territories',64.8,-124.8),
  ('state','nova scotia','Nova Scotia',44.7,-63.7),
  ('state','nunavut','Nunavut',70.3,-83.1),
  ('state','ontario','Ontario',51.3,-85.3),
  ('state','prince edward island','Prince Edward Island',46.5,-63.4),
  ('state','quebec','Quebec',52.9,-73.5),
  ('state','saskatchewan','Saskatchewan',52.9,-106.5),
  ('state','yukon','Yukon',64.3,-135.0),
  -- Cities (US)
  ('city','new york','New York',40.7,-74.0),
  ('city','los angeles','Los Angeles',34.1,-118.2),
  ('city','chicago','Chicago',41.9,-87.6),
  ('city','houston','Houston',29.8,-95.4),
  ('city','phoenix','Phoenix',33.4,-112.1),
  ('city','philadelphia','Philadelphia',40.0,-75.2),
  ('city','san antonio','San Antonio',29.4,-98.5),
  ('city','san diego','San Diego',32.7,-117.2),
  ('city','dallas','Dallas',32.8,-96.8),
  ('city','san jose','San Jose',37.3,-121.9),
  ('city','austin','Austin',30.3,-97.7),
  ('city','miami','Miami',25.8,-80.2),
  ('city','atlanta','Atlanta',33.7,-84.4),
  ('city','boston','Boston',42.4,-71.1),
  ('city','seattle','Seattle',47.6,-122.3),
  ('city','san francisco','San Francisco',37.8,-122.4),
  ('city','denver','Denver',39.7,-105.0),
  ('city','las vegas','Las Vegas',36.2,-115.1),
  ('city','detroit','Detroit',42.3,-83.0),
  ('city','green bay','Green Bay',44.5,-88.0),
  ('city','appleton','Appleton',44.3,-88.4),
  ('city','oshkosh','Oshkosh',44.0,-88.5),
  ('city','milwaukee','Milwaukee',43.0,-87.9),
  ('city','madison','Madison',43.1,-89.4),
  ('city','memphis','Memphis',35.1,-90.0),
  ('city','nashville','Nashville',36.2,-86.8),
  ('city','st louis','St. Louis',38.6,-90.2),
  ('city','saint louis','Saint Louis',38.6,-90.2),
  ('city','kansas city','Kansas City',39.1,-94.6),
  ('city','minneapolis','Minneapolis',45.0,-93.3),
  ('city','charlotte','Charlotte',35.2,-80.8),
  ('city','orlando','Orlando',28.5,-81.4),
  ('city','tampa','Tampa',28.0,-82.5),
  ('city','new orleans','New Orleans',30.0,-90.1),
  ('city','cleveland','Cleveland',41.5,-81.7),
  ('city','columbus','Columbus',40.0,-83.0),
  ('city','indianapolis','Indianapolis',39.8,-86.2),
  -- Cities (Canada)
  ('city','toronto','Toronto',43.7,-79.3),
  ('city','vancouver','Vancouver',49.3,-123.1),
  ('city','montreal','Montreal',45.5,-73.6),
  ('city','edmonton','Edmonton',53.5,-113.5),
  ('city','calgary','Calgary',51.0,-114.1),
  ('city','ottawa','Ottawa',45.4,-75.7),
  ('city','winnipeg','Winnipeg',49.9,-97.1),
  ('city','quebec city','Quebec City',46.8,-71.2),
  ('city','halifax','Halifax',44.6,-63.6),
  ('city','regina','Regina',50.4,-104.6),
  ('city','saskatoon','Saskatoon',52.1,-106.7),
  -- Cities (world)
  ('city','london','London',51.5,-0.1),
  ('city','paris','Paris',48.9,2.4),
  ('city','berlin','Berlin',52.5,13.4),
  ('city','madrid','Madrid',40.4,-3.7),
  ('city','rome','Rome',41.9,12.5),
  ('city','amsterdam','Amsterdam',52.4,4.9),
  ('city','dublin','Dublin',53.3,-6.3),
  ('city','tokyo','Tokyo',35.7,139.7),
  ('city','seoul','Seoul',37.6,127.0),
  ('city','beijing','Beijing',39.9,116.4),
  ('city','shanghai','Shanghai',31.2,121.5),
  ('city','hong kong','Hong Kong',22.4,114.1),
  ('city','singapore','Singapore',1.4,103.8),
  ('city','sydney','Sydney',-33.9,151.2),
  ('city','melbourne','Melbourne',-37.8,144.9),
  ('city','mexico city','Mexico City',19.4,-99.1),
  ('city','sao paulo','São Paulo',-23.6,-46.6),
  ('city','rio de janeiro','Rio de Janeiro',-22.9,-43.2),
  ('city','buenos aires','Buenos Aires',-34.6,-58.4),
  ('city','dubai','Dubai',25.2,55.3),
  ('city','mumbai','Mumbai',19.1,72.9),
  ('city','delhi','Delhi',28.7,77.1)
ON CONFLICT (region_type, region_name_key) DO UPDATE
  SET lat = EXCLUDED.lat,
      lng = EXCLUDED.lng,
      region_name_display = EXCLUDED.region_name_display,
      updated_at = now();

-- 3) Rework refresh_crown_map_points() to use the safe center lookup.
--    Coordinates are populated ONLY from public.geo_public_centers via
--    LEFT JOIN — never from profiles, devices, or user exact coords.
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
    -- Safe public center only. NULL when the region isn't in our
    -- curated list — we NEVER fall back to user/device coordinates.
    g.lat::double precision,
    g.lng::double precision,
    '{}'::jsonb,
    now()
  FROM public.crowns c
  LEFT JOIN public.geo_public_centers g
    ON g.region_type = c.region_type::text
   AND g.region_name_key = lower(btrim(c.region_name))
  WHERE c.active = true;

  GET DIAGNOSTICS _count = ROW_COUNT;
  RETURN _count;
END;
$$;

REVOKE ALL ON FUNCTION public.refresh_crown_map_points() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.refresh_crown_map_points() TO service_role;

-- 4) Kick a refresh so the cache picks up the new safe coordinates.
SELECT public.refresh_crown_map_points();
