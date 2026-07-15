// Asset preloading for Achievement Crown artwork.
// Warms the browser HTTP cache for equipped + "next up" crowns so gallery
// tiles, share cards, and profile CrownAvatar swaps render without flicker.
//
// The public CDN URLs already include ?v=rN cache-busters, so once fetched
// the browser will re-use the response across sessions until we bump the
// version. We keep an in-memory dedupe set so we don't refetch on every
// gallery mount.

const inflight = new Set<string>();

function preloadOne(url: string) {
  if (!url || inflight.has(url)) return;
  inflight.add(url);
  try {
    // <img> preload is the most compatible path across mobile Safari + Chrome.
    const img = new Image();
    // Hint to browser: low priority so we don't fight the LCP.
    if ("fetchPriority" in img) {
      (img as unknown as { fetchPriority: string }).fetchPriority = "low";
    }
    img.decoding = "async";
    img.loading = "eager";
    img.src = url;
  } catch {
    /* non-fatal */
  }
}

export interface PreloadTarget {
  gallery_asset_url?: string | null;
  wearable_asset_url?: string | null;
  thumbnail_url?: string | null;
  asset_url?: string | null;
  owned?: boolean;
  equipped?: boolean;
  completion_percent?: number;
}

/**
 * Preload artwork for the crowns most likely to matter next:
 *   1. Every equipped crown (needed by CrownAvatar site-wide).
 *   2. Every owned crown (share cards + collection carousels).
 *   3. Top 8 "closest to unlock" (>= 25% progress) for the Next Up rail.
 */
export function preloadCrownAssets(rows: PreloadTarget[]): void {
  if (!Array.isArray(rows) || rows.length === 0) return;

  const owned = rows.filter((r) => r.owned);
  const equipped = rows.filter((r) => r.equipped);
  const nextUp = rows
    .filter((r) => !r.owned && (r.completion_percent ?? 0) >= 25)
    .sort((a, b) => (b.completion_percent ?? 0) - (a.completion_percent ?? 0))
    .slice(0, 8);

  const queue: PreloadTarget[] = [...equipped, ...owned, ...nextUp];

  for (const r of queue) {
    // Wearable is smallest + used on avatar overlays — prioritize it.
    if (r.wearable_asset_url) preloadOne(r.wearable_asset_url);
    if (r.gallery_asset_url) preloadOne(r.gallery_asset_url);
    else if (r.thumbnail_url) preloadOne(r.thumbnail_url);
    else if (r.asset_url) preloadOne(r.asset_url);
  }
}

export function _resetCrownPreloadCacheForTests() {
  inflight.clear();
}
