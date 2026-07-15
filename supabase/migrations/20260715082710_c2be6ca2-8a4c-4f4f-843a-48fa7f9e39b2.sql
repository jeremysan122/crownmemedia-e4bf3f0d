
UPDATE public.achievement_crowns
SET
  master_asset_url = regexp_replace(master_asset_url, '\?.*$', '') || '?v=r4',
  gallery_asset_url = regexp_replace(gallery_asset_url, '\?.*$', '') || '?v=r4',
  wearable_asset_url = regexp_replace(wearable_asset_url, '\?.*$', '') || '?v=r4',
  thumbnail_url = regexp_replace(thumbnail_url, '\?.*$', '') || '?v=r4',
  asset_version = 2,
  image_quality_verified = true,
  updated_at = now()
WHERE slug BETWEEN 'crown-031' AND 'crown-040';
