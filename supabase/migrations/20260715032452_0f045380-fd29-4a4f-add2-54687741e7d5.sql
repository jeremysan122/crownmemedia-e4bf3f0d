ALTER TABLE public.achievement_crowns
ADD COLUMN IF NOT EXISTS wearable_asset_url text;

UPDATE public.achievement_crowns
SET wearable_asset_url = asset_url
WHERE wearable_asset_url IS NULL
  AND asset_url LIKE '/achievement-crowns/crown-%.webp';