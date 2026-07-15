-- Wave 4a: canonicalize asset_url to the v2 gallery URL for every crown.
-- Prior to this migration 30 rows still carried the legacy /achievement-crowns/
-- local-public path in asset_url while gallery_asset_url/wearable_asset_url
-- already lived on v2. Unifying asset_url = gallery_asset_url means every
-- consumer (feed, share cards, admin tools) resolves the same artwork.
UPDATE public.achievement_crowns
SET asset_url = gallery_asset_url,
    updated_at = now()
WHERE gallery_asset_url IS NOT NULL
  AND (asset_url IS NULL OR asset_url NOT LIKE '%achievement-crowns-v2%');

-- Wave 4b: revoke anon EXECUTE on definer functions that either return
-- caller-scoped data (auth.uid()) or perform reconciliation work. These
-- functions never had a legitimate anonymous use-case; revoking closes
-- the door on empty/permission-checked calls from unauthenticated clients.
REVOKE EXECUTE ON FUNCTION public.my_achievement_crowns() FROM anon;
REVOKE EXECUTE ON FUNCTION public.recent_achievement_unlocks(uuid, integer) FROM anon;
REVOKE EXECUTE ON FUNCTION public.get_user_crown_metrics(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.reconcile_crown_unlocks_recent() FROM anon;