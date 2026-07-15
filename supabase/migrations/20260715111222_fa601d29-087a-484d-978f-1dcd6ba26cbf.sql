
INSERT INTO public.achievement_crown_url_snapshots
  (snapshot_label, crown_id, slug, crown_number, asset_url, gallery_asset_url, wearable_asset_url, thumbnail_url, master_asset_url, legacy_asset_url, asset_version, image_quality_verified)
SELECT
  'pre_r10_071_090_switch',
  id, slug, crown_number,
  gallery_asset_url,
  gallery_asset_url, wearable_asset_url, thumbnail_url, master_asset_url,
  master_asset_url,
  asset_version, image_quality_verified
FROM public.achievement_crowns
WHERE crown_number BETWEEN 71 AND 90;

UPDATE public.achievement_crowns
SET
  master_asset_url  = 'https://bailrqskqpmzvsgivhvm.supabase.co/storage/v1/object/public/achievement-crowns-v2-masters/masters/crown-' || lpad(crown_number::text, 3, '0') || '-master-2048.png?v=r10',
  gallery_asset_url = 'https://bailrqskqpmzvsgivhvm.supabase.co/storage/v1/object/public/achievement-crowns-v2/gallery/crown-'  || lpad(crown_number::text, 3, '0') || '-gallery.webp?v=r10',
  wearable_asset_url= 'https://bailrqskqpmzvsgivhvm.supabase.co/storage/v1/object/public/achievement-crowns-v2/wearable/crown-' || lpad(crown_number::text, 3, '0') || '-wearable.webp?v=r10',
  thumbnail_url     = 'https://bailrqskqpmzvsgivhvm.supabase.co/storage/v1/object/public/achievement-crowns-v2/thumbnails/crown-' || lpad(crown_number::text, 3, '0') || '-thumb.webp?v=r10',
  asset_version     = 2,
  image_quality_verified = false,
  updated_at        = now()
WHERE crown_number BETWEEN 71 AND 90;
