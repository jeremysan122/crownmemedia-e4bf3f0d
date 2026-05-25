/**
 * Royal Filter System — single source of truth for filter ids, CSS, and overlays.
 *
 * 20 photo filters (CSS `filter:` + decorative overlay class) and
 * 10 animated video filters (CSS-class overlay only). All overlays use
 * `pointer-events-none` and pure CSS animations so scrolling is never blocked.
 *
 * The original media on storage is never modified — the chosen filter id is
 * stored as post metadata (posts.photo_filter / posts.video_filter), and the
 * renderer (PostMedia / FilterOverlay) applies the look at display time.
 *
 * Legacy callers (`FilterId`, `FILTERS`, `FILTER_BY_ID`, `cssFor`, `isValidFilter`)
 * keep working — we extend the union with the new royal ids.
 */

import type { RoyalPhotoFilter, RoyalVideoFilter } from "@/types/filters";

// ───────────────────────── Photo filters (20 + Original) ─────────────────────────

export const ROYAL_PHOTO_FILTERS: RoyalPhotoFilter[] = [
  { id: "none", name: "Original", mediaType: "photo", description: "No filter — original media.", cssFilter: "none" },

  { id: "royal_gold_glow",  name: "Royal Gold Glow",  mediaType: "photo", description: "Warm gold highlights with soft royal glow.", cssFilter: "brightness(1.08) contrast(1.08) saturate(1.12) sepia(0.18)", overlayClass: "filter-overlay-gold-glow" },
  { id: "imperial_purple",  name: "Imperial Purple",  mediaType: "photo", description: "Deep purple shadows with cinematic contrast.", cssFilter: "brightness(0.95) contrast(1.18) saturate(1.2) hue-rotate(8deg)", overlayClass: "filter-overlay-purple-shadow" },
  { id: "crown_shine",      name: "Crown Shine",      mediaType: "photo", description: "High-contrast polish with gold highlights.", cssFilter: "brightness(1.05) contrast(1.25) saturate(1.15)", overlayClass: "filter-overlay-shine" },
  { id: "velvet_night",     name: "Velvet Night",     mediaType: "photo", description: "Dark velvet shadows with purple undertone.", cssFilter: "brightness(0.82) contrast(1.12) saturate(0.95)", overlayClass: "filter-overlay-velvet" },
  { id: "regal_matte",      name: "Regal Matte",      mediaType: "photo", description: "Desaturated luxury matte editorial finish.", cssFilter: "brightness(1.03) contrast(0.92) saturate(0.72)", overlayClass: "filter-overlay-matte" },
  { id: "diamond_luxe",     name: "Diamond Luxe",     mediaType: "photo", description: "Cool crisp whites with jewel-like clarity.", cssFilter: "brightness(1.07) contrast(1.12) saturate(0.98) hue-rotate(185deg)", overlayClass: "filter-overlay-diamond" },
  { id: "golden_hour_king", name: "Golden Hour King", mediaType: "photo", description: "Warm sunlight glow with soft bloom.", cssFilter: "brightness(1.12) contrast(1.04) saturate(1.18) sepia(0.28)", overlayClass: "filter-overlay-golden-hour" },
  { id: "platinum_ice",     name: "Platinum Ice",     mediaType: "photo", description: "Cool blue premium finish.", cssFilter: "brightness(1.04) contrast(1.14) saturate(0.92) hue-rotate(195deg)", overlayClass: "filter-overlay-ice" },
  { id: "royal_noir",       name: "Royal Noir",       mediaType: "photo", description: "Black & white with deep royal contrast.", cssFilter: "grayscale(1) contrast(1.32) brightness(0.98)", overlayClass: "filter-overlay-noir" },
  { id: "throne_contrast",  name: "Throne Contrast",  mediaType: "photo", description: "Bold contrast with subtle gold tint.", cssFilter: "brightness(0.98) contrast(1.38) saturate(1.1) sepia(0.14)", overlayClass: "filter-overlay-throne" },
  { id: "noble_fade",       name: "Noble Fade",       mediaType: "photo", description: "Soft faded vintage luxury tone.", cssFilter: "brightness(1.08) contrast(0.86) saturate(0.82) sepia(0.12)", overlayClass: "filter-overlay-fade" },
  { id: "crown_aura",       name: "Crown Aura",       mediaType: "photo", description: "Subtle center aura and royal brightness.", cssFilter: "brightness(1.05) contrast(1.05) saturate(1.08)", overlayClass: "filter-overlay-crown-aura" },
  { id: "sapphire_rich",    name: "Sapphire Rich",    mediaType: "photo", description: "Blue and purple rich saturation.", cssFilter: "brightness(0.96) contrast(1.16) saturate(1.32) hue-rotate(210deg)", overlayClass: "filter-overlay-sapphire" },
  { id: "kings_skin",       name: "King's Skin",      mediaType: "photo", description: "Warm portrait tone with soft glow.", cssFilter: "brightness(1.08) contrast(0.98) saturate(1.1) sepia(0.12)", overlayClass: "filter-overlay-skin" },
  { id: "royal_editorial",  name: "Royal Editorial",  mediaType: "photo", description: "Magazine-style balanced lighting.", cssFilter: "brightness(1.06) contrast(1.16) saturate(1.04)", overlayClass: "filter-overlay-editorial" },
  { id: "golden_edge",      name: "Golden Edge",      mediaType: "photo", description: "Golden vignette edge glow.", cssFilter: "brightness(1.03) contrast(1.08) saturate(1.08) sepia(0.1)", overlayClass: "filter-overlay-golden-edge" },
  { id: "dynasty_glow",     name: "Dynasty Glow",     mediaType: "photo", description: "Warm dynasty glow with soft highlights.", cssFilter: "brightness(1.1) contrast(0.98) saturate(1.16) sepia(0.2)", overlayClass: "filter-overlay-dynasty" },
  { id: "elite_clarity",    name: "Elite Clarity",    mediaType: "photo", description: "Clean, crisp, sharp premium clarity.", cssFilter: "brightness(1.05) contrast(1.2) saturate(1.02)", overlayClass: "filter-overlay-clarity" },
  { id: "dark_crown",       name: "Dark Crown",       mediaType: "photo", description: "Low-light royal enhancement with gold accents.", cssFilter: "brightness(0.88) contrast(1.25) saturate(1.05) sepia(0.08)", overlayClass: "filter-overlay-dark-crown" },
  { id: "emperor_tone",     name: "Emperor Tone",     mediaType: "photo", description: "Signature CrownMe gold + purple tone.", cssFilter: "brightness(1.04) contrast(1.13) saturate(1.18) sepia(0.12) hue-rotate(8deg)", overlayClass: "filter-overlay-emperor", premium: true },
];

// ───────────────────────── Video filters (10 + Original) ─────────────────────────

export const ROYAL_VIDEO_FILTERS: RoyalVideoFilter[] = [
  { id: "none", name: "Original", mediaType: "video", description: "No animated filter.", overlayClass: "" },

  { id: "gold_shimmer",      name: "Gold Shimmer",      mediaType: "video", description: "Gold light sweep across the video.", overlayClass: "video-overlay-gold-shimmer" },
  { id: "crown_sparkle",     name: "Crown Sparkle",     mediaType: "video", description: "Gold + purple sparkles around the frame.", overlayClass: "video-overlay-crown-sparkle" },
  { id: "pulse_glow",        name: "Pulse Glow",        mediaType: "video", description: "Slow breathing royal glow.", overlayClass: "video-overlay-pulse-glow" },
  { id: "royal_glitch",      name: "Royal Glitch",      mediaType: "video", description: "Gold + purple luxury distortion flicker.", overlayClass: "video-overlay-royal-glitch" },
  { id: "golden_dust",       name: "Golden Dust",       mediaType: "video", description: "Floating gold particles across the frame.", overlayClass: "video-overlay-golden-dust" },
  { id: "throne_light_rays", name: "Throne Light Rays", mediaType: "video", description: "Soft light beams from above.", overlayClass: "video-overlay-throne-rays" },
  { id: "crown_energy",      name: "Crown Energy",      mediaType: "video", description: "Animated aura ring behind the center.", overlayClass: "video-overlay-crown-energy" },
  { id: "scanline_prestige", name: "Scanline Prestige", mediaType: "video", description: "Subtle premium scanline texture.", overlayClass: "video-overlay-scanline" },
  { id: "diamond_flicker",   name: "Diamond Flicker",   mediaType: "video", description: "Diamond reflections flickering across the frame.", overlayClass: "video-overlay-diamond-flicker" },
  { id: "god_emperor_glow",  name: "God Emperor Glow",  mediaType: "video", description: "Strong aura, sparkle and royal glow combo.", overlayClass: "video-overlay-god-emperor", premium: true },
];

// ───────────────────────── Legacy compatibility layer ─────────────────────────
// A handful of older posts may still carry one of these ids in posts.filter.
// We render them as Original (no look applied) but keep them valid so reads
// don't crash. (DB allowlist still accepts them too.)
const LEGACY_IDS = [
  "sepia", "noir", "vivid", "fade", "chrome",
  "shimmer", "glitch", "pulse-glow", "scanlines", "gold-sparkle",
] as const;

export type FilterId =
  | (typeof ROYAL_PHOTO_FILTERS)[number]["id"]
  | (typeof ROYAL_VIDEO_FILTERS)[number]["id"]
  | (typeof LEGACY_IDS)[number];

/** Legacy combined view kept for older callers that don't care about media type. */
export interface FilterDef {
  id: FilterId;
  label: string;
  /** True when the filter relies on an animated overlay layer. */
  animated: boolean;
  css?: string;
  overlayClass?: string;
  mediaType: "photo" | "video";
}

const photoDefs: FilterDef[] = ROYAL_PHOTO_FILTERS.map((f) => ({
  id: f.id as FilterId,
  label: f.name,
  animated: false,
  css: f.cssFilter,
  overlayClass: f.overlayClass,
  mediaType: "photo",
}));

const videoDefs: FilterDef[] = ROYAL_VIDEO_FILTERS.map((f) => ({
  id: f.id as FilterId,
  label: f.name,
  animated: f.overlayClass.length > 0,
  css: undefined,
  overlayClass: f.overlayClass || undefined,
  mediaType: "video",
}));

/**
 * `none` exists in both photo+video lists; dedupe by id, preferring the photo
 * definition (because legacy callers expect `none` to render an <img>-style
 * filter). The video `none` is functionally equivalent.
 */
export const FILTERS: FilterDef[] = (() => {
  const seen = new Set<string>();
  const out: FilterDef[] = [];
  for (const f of [...photoDefs, ...videoDefs]) {
    if (seen.has(f.id)) continue;
    seen.add(f.id);
    out.push(f);
  }
  // Add minimal legacy stubs so isValidFilter() is true and cssFor() returns "none".
  for (const id of LEGACY_IDS) {
    if (!seen.has(id)) {
      out.push({ id: id as FilterId, label: id, animated: false, css: "none", mediaType: "photo" });
      seen.add(id);
    }
  }
  return out;
})();

export const FILTER_BY_ID: Record<FilterId, FilterDef> = FILTERS.reduce(
  (acc, f) => ({ ...acc, [f.id]: f }),
  {} as Record<FilterId, FilterDef>,
);

export function isValidFilter(id: string | null | undefined): id is FilterId {
  return !!id && id in FILTER_BY_ID;
}

/** CSS `filter:` value for an id, or "none" when missing/invalid. */
export function cssFor(id: FilterId | null | undefined): string {
  if (!id) return "none";
  return FILTER_BY_ID[id]?.css ?? "none";
}

/** Decorative overlay class (or undefined if the filter has none). */
export function overlayClassFor(id: FilterId | null | undefined): string | undefined {
  if (!id) return undefined;
  const cls = FILTER_BY_ID[id]?.overlayClass;
  return cls && cls.length > 0 ? cls : undefined;
}

/** Lookup helpers for the selector. */
export function filtersFor(media: "photo" | "video"): (RoyalPhotoFilter | RoyalVideoFilter)[] {
  return media === "photo" ? ROYAL_PHOTO_FILTERS : ROYAL_VIDEO_FILTERS;
}
