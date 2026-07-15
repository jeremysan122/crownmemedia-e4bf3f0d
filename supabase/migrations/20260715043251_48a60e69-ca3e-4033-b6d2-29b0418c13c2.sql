ALTER TABLE public.achievement_crowns
  ADD COLUMN IF NOT EXISTS master_asset_url text,
  ADD COLUMN IF NOT EXISTS gallery_asset_url text,
  ADD COLUMN IF NOT EXISTS thumbnail_url text,
  ADD COLUMN IF NOT EXISTS asset_version integer NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS image_width integer,
  ADD COLUMN IF NOT EXISTS image_height integer,
  ADD COLUMN IF NOT EXISTS image_format text,
  ADD COLUMN IF NOT EXISTS image_file_size_bytes bigint,
  ADD COLUMN IF NOT EXISTS image_quality_verified boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS render_config jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS legacy_asset_url text;

UPDATE public.achievement_crowns
SET legacy_asset_url = asset_url
WHERE legacy_asset_url IS NULL;

DROP FUNCTION IF EXISTS public.my_achievement_crowns();

CREATE OR REPLACE FUNCTION public.my_achievement_crowns()
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
  master_asset_url text,
  asset_version integer,
  render_config jsonb,
  requirement_logic jsonb,
  is_secret boolean,
  sort_order integer,
  owned boolean,
  equipped boolean,
  unlocked_at timestamptz,
  progress integer,
  target integer,
  completion_percent integer,
  last_evaluated_at timestamptz
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    c.id AS crown_id,
    c.slug,
    c.name,
    c.description,
    c.lore,
    c.unlock_hint,
    c.rarity,
    c.tier_index,
    c.collection_slug,
    c.collection_name,
    COALESCE(c.gallery_asset_url, c.asset_url) AS asset_url,
    c.gallery_asset_url,
    COALESCE(c.wearable_asset_url, c.gallery_asset_url) AS wearable_asset_url,
    c.thumbnail_url,
    c.master_asset_url,
    c.asset_version,
    c.render_config,
    c.requirement_logic,
    c.is_secret,
    c.sort_order,
    (uac.crown_id IS NOT NULL) AS owned,
    (p.equipped_achievement_crown_id = c.id) AS equipped,
    uac.unlocked_at,
    COALESCE(ucp.progress, 0)::integer AS progress,
    COALESCE(ucp.target, 0)::integer AS target,
    COALESCE(ucp.completion_percent, 0)::integer AS completion_percent,
    ucp.last_evaluated_at
  FROM public.achievement_crowns c
  LEFT JOIN public.user_achievement_crowns uac
    ON uac.crown_id = c.id AND uac.user_id = auth.uid()
  LEFT JOIN public.user_crown_progress ucp
    ON ucp.crown_id = c.id AND ucp.user_id = auth.uid()
  LEFT JOIN public.profiles p
    ON p.id = auth.uid()
  WHERE c.is_active = true
  ORDER BY c.sort_order, c.tier_index;
$$;

GRANT EXECUTE ON FUNCTION public.my_achievement_crowns() TO authenticated, anon;

DROP FUNCTION IF EXISTS public.admin_crown_asset_review();

CREATE OR REPLACE FUNCTION public.admin_crown_asset_review()
RETURNS TABLE (
  crown_id uuid,
  slug text,
  name text,
  collection_slug text,
  collection_name text,
  tier_index integer,
  rarity text,
  asset_url text,
  legacy_asset_url text,
  master_asset_url text,
  gallery_asset_url text,
  wearable_asset_url text,
  thumbnail_url text,
  asset_version integer,
  image_width integer,
  image_height integer,
  image_format text,
  image_file_size_bytes bigint,
  image_quality_verified boolean,
  render_config jsonb,
  updated_at timestamptz
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    id, slug, name, collection_slug, collection_name, tier_index, rarity,
    asset_url, legacy_asset_url, master_asset_url, gallery_asset_url,
    wearable_asset_url, thumbnail_url, asset_version,
    image_width, image_height, image_format, image_file_size_bytes,
    image_quality_verified, render_config, updated_at
  FROM public.achievement_crowns
  WHERE public.has_role(auth.uid(), 'admin')
  ORDER BY tier_index, collection_slug;
$$;

REVOKE ALL ON FUNCTION public.admin_crown_asset_review() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_crown_asset_review() TO authenticated;

CREATE OR REPLACE FUNCTION public.admin_set_crown_quality(
  _crown_id uuid,
  _verified boolean
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'admin required';
  END IF;
  UPDATE public.achievement_crowns
  SET image_quality_verified = _verified,
      updated_at = now()
  WHERE id = _crown_id;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_set_crown_quality(uuid, boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_set_crown_quality(uuid, boolean) TO authenticated;

CREATE OR REPLACE FUNCTION public.admin_set_crown_render_config(
  _crown_id uuid,
  _config jsonb
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'admin required';
  END IF;
  UPDATE public.achievement_crowns
  SET render_config = COALESCE(_config, '{}'::jsonb),
      updated_at = now()
  WHERE id = _crown_id;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_set_crown_render_config(uuid, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_set_crown_render_config(uuid, jsonb) TO authenticated;