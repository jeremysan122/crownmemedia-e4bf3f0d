DROP FUNCTION IF EXISTS public.my_achievement_crowns();

CREATE FUNCTION public.my_achievement_crowns()
RETURNS TABLE (
  crown_id uuid,
  slug text,
  name text,
  description text,
  lore text,
  unlock_hint text,
  rarity text,
  tier_index integer,
  collection_slug text,
  collection_name text,
  asset_url text,
  gallery_asset_url text,
  wearable_asset_url text,
  thumbnail_url text,
  asset_version integer,
  image_quality_verified boolean,
  render_config jsonb,
  requirement_logic jsonb,
  is_secret boolean,
  sort_order integer,
  owned boolean,
  equipped boolean,
  unlocked_at timestamptz,
  progress numeric,
  target numeric,
  completion_percent numeric,
  last_evaluated_at timestamptz
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    c.id,
    c.slug,
    c.name,
    c.description,
    c.lore,
    c.unlock_hint,
    c.rarity,
    c.tier_index,
    c.collection_slug,
    c.collection_name,
    c.asset_url,
    c.gallery_asset_url,
    c.wearable_asset_url,
    c.thumbnail_url,
    c.asset_version,
    c.image_quality_verified,
    c.render_config,
    c.requirement_logic,
    c.is_secret,
    c.sort_order,
    (o.crown_id IS NOT NULL) AS owned,
    (p.equipped_achievement_crown_id = c.id) AS equipped,
    o.unlocked_at,
    COALESCE(pr.progress, 0) AS progress,
    COALESCE(pr.target, 0) AS target,
    COALESCE(pr.completion_percent, 0) AS completion_percent,
    pr.last_evaluated_at
  FROM public.achievement_crowns c
  LEFT JOIN public.user_achievement_crowns o
    ON o.crown_id = c.id AND o.user_id = auth.uid()
  LEFT JOIN public.user_crown_progress pr
    ON pr.crown_id = c.id AND pr.user_id = auth.uid()
  LEFT JOIN public.profiles p
    ON p.id = auth.uid()
  WHERE c.is_active = true
  ORDER BY c.sort_order, c.tier_index;
$$;

REVOKE EXECUTE ON FUNCTION public.my_achievement_crowns() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.my_achievement_crowns() TO authenticated;

DROP POLICY IF EXISTS "Public can view achievement crown v2 files" ON storage.objects;
DROP POLICY IF EXISTS "Admins can upload achievement crown v2 files" ON storage.objects;
DROP POLICY IF EXISTS "Admins can update achievement crown v2 files" ON storage.objects;
DROP POLICY IF EXISTS "Admins can delete achievement crown v2 files" ON storage.objects;

CREATE POLICY "Public can view achievement crown v2 files"
ON storage.objects
FOR SELECT
TO public
USING (bucket_id = 'achievement-crowns-v2');

CREATE POLICY "Admins can upload achievement crown v2 files"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'achievement-crowns-v2' AND public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can update achievement crown v2 files"
ON storage.objects
FOR UPDATE
TO authenticated
USING (bucket_id = 'achievement-crowns-v2' AND public.has_role(auth.uid(), 'admin'))
WITH CHECK (bucket_id = 'achievement-crowns-v2' AND public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can delete achievement crown v2 files"
ON storage.objects
FOR DELETE
TO authenticated
USING (bucket_id = 'achievement-crowns-v2' AND public.has_role(auth.uid(), 'admin'));