/**
 * Royal Filter System — type definitions.
 *
 * Filters are stored as metadata only (string id) on posts.
 * Originals on storage stay clean. The renderer applies the look at display
 * time using a CSS `filter` (for photos) and/or a CSS-class overlay (animated
 * video filters). No WebGL, no canvas baking, no AI.
 */

export type FilterMediaType = "photo" | "video";

export interface RoyalPhotoFilter {
  id: string;
  name: string;
  mediaType: "photo";
  description: string;
  /** Value passed to CSS `filter:` on the <img>. Use "none" for the original. */
  cssFilter: string;
  /** Optional decorative overlay class layered above the photo. */
  overlayClass?: string;
  premium?: boolean;
}

export interface RoyalVideoFilter {
  id: string;
  name: string;
  mediaType: "video";
  description: string;
  /** CSS class applied to a pointer-events-none overlay above the <video>. */
  overlayClass: string;
  premium?: boolean;
}

export type RoyalFilter = RoyalPhotoFilter | RoyalVideoFilter;
