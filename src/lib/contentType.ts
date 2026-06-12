// Post vs Scroll classification helpers.
//
// CrownMe stores both surfaces in the `posts` table, distinguished by the
// `content_type` column ('post' | 'scroll'). Until the migration, scrolls
// were inferred from `media_type='video'`. To keep older rows that were
// inserted before the column existed working, we accept either signal at
// the read layer — `content_type` is authoritative when present, falling
// back to `media_type='video' ⇒ scroll`.
//
// Upload behaviour
// ----------------
// - Picking **Post** allows photo or video and is stored as `content_type='post'`.
// - Picking **Scroll** forces vertical short-form video and is stored as
//   `content_type='scroll'`. The Scrolls/Reels surface only reads scrolls.
//
// The aspect-ratio guidance returned by `aspectGuide` is what the Upload
// preview / crop editor uses to constrain user output to the standard
// social-media sizes (Post: 1:1 or 4:5, Scroll: 9:16).

export type ContentType = "post" | "scroll";

export const CONTENT_TYPES: ReadonlyArray<ContentType> = ["post", "scroll"];

export interface PostRowLike {
  content_type?: string | null;
  media_type?: string | null;
}

/**
 * Returns the effective content type of a stored row.
 * `content_type` is authoritative; otherwise we infer from `media_type`.
 * Unknown values collapse to "post" so legacy rows never disappear.
 */
export function effectiveContentType(row: PostRowLike): ContentType {
  const explicit = (row.content_type || "").toLowerCase();
  if (explicit === "post" || explicit === "scroll") return explicit;
  if ((row.media_type || "").toLowerCase() === "video") return "scroll";
  return "post";
}

export function isScroll(row: PostRowLike): boolean {
  return effectiveContentType(row) === "scroll";
}
export function isPost(row: PostRowLike): boolean {
  return effectiveContentType(row) === "post";
}

/**
 * Filter a list of post rows down to a single content surface, applying the
 * same fallback rules so legacy rows route correctly into the new tabs.
 */
export function filterByContentType<T extends PostRowLike>(rows: ReadonlyArray<T>, type: ContentType): T[] {
  return rows.filter((r) => effectiveContentType(r) === type);
}

// ---- Upload-side guidance ----

export type UploadMode = "photo" | "video";

export interface AspectGuide {
  label: string;
  ratios: ReadonlyArray<{ w: number; h: number; label: string }>;
  /** Hint shown under the selector explaining how this surface is consumed. */
  description: string;
}

export const POST_GUIDE: AspectGuide = {
  label: "Post",
  description: "Square or vertical post for the main feed and your profile grid.",
  ratios: [
    { w: 1, h: 1, label: "Square 1:1" },
    { w: 4, h: 5, label: "Portrait 4:5" },
  ],
};

export const SCROLL_GUIDE: AspectGuide = {
  label: "Scroll",
  description: "Vertical full-screen short for the Scrolls feed. Video, 9:16, up to 30s.",
  ratios: [{ w: 9, h: 16, label: "Vertical 9:16" }],
};

export function aspectGuide(type: ContentType): AspectGuide {
  return type === "scroll" ? SCROLL_GUIDE : POST_GUIDE;
}

/**
 * Resolve which upload mode is allowed for a given content type.
 * Scrolls force video. Posts allow either (caller decides which UI tab).
 */
export function allowedUploadModes(type: ContentType): ReadonlyArray<UploadMode> {
  return type === "scroll" ? ["video"] : ["photo", "video"];
}

/**
 * Validate that the user's selection is internally consistent before
 * publishing. Returns null if OK, or a human-readable reason to block.
 * The server publish RPC re-validates content_type independently — this
 * client-side check is purely UX.
 */
export function validateUploadSelection(
  type: ContentType,
  mode: UploadMode,
  media: { width?: number | null; height?: number | null; durationMs?: number | null },
): string | null {
  if (type === "scroll") {
    if (mode !== "video") return "Scrolls must be a vertical video.";
    if (media.width && media.height && media.height < media.width) {
      return "Scrolls must be vertical (9:16). Rotate or re-record before publishing.";
    }
    if (media.durationMs != null && media.durationMs > 30_000) {
      return "Scrolls are limited to 30 seconds.";
    }
  }
  // Posts: allow anything the existing upload limits already accept.
  return null;
}
