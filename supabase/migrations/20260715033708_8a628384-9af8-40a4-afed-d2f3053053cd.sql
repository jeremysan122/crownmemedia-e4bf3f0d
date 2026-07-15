UPDATE public.achievement_crowns
SET wearable_asset_url = regexp_replace(
  asset_url,
  '^/achievement-crowns/(crown-[0-9]{3}\.webp)$',
  '/achievement-crowns/wearables/\1'
)
WHERE asset_url LIKE '/achievement-crowns/crown-%.webp';