// ============================================================================
// Canonical post media frame.
//
// One source of truth for the aspect-ratio "frame" a post renders into across
// every surface (Feed, Profile detail, PostDetailDialog, Discover preview,
// ShareDialog, DM share). Without this, surfaces drift apart — e.g. Feed
// would render `aspect-square lg:aspect-[4/5]` while PostDetail rendered
// `aspect-square` on mobile and `aspect-auto` (= dialog box ratio) on
// desktop, with object-fit also flipping between `object-contain` and
// `object-cover`. That made the SAME post look different depending on
// viewport, which is the bug we're fixing.
//
// Today the upload pipeline (src/lib/mediaProcess.ts) normalises every photo
// to a 1080x1080 square, so 1:1 is the canonical frame for images. Videos
// (Shorts / scroll content) use 9:16 because that is how they were captured.
// When we add user-selectable aspect ratios (4:5, 1.91:1) we extend this
// helper — all surfaces will pick the new ratio up automatically.
//
// Reposts: pass the ORIGINAL post (parent), not the repost shell, so a
// repost always uses the original media's framing.
// ============================================================================
export interface PostMediaFrameInput {
  media_type?: string | null;
  content_type?: string | null;
  /** Future: persisted upload-time framing, e.g. "1:1" | "4:5" | "1.91:1" | "9:16". */
  aspect_ratio?: string | null;
}

/**
 * Returns the Tailwind `aspect-*` class to apply to a post's media frame.
 * The class is identical across breakpoints by design — the frame WIDTH may
 * adapt to the viewport, but the ratio must not change with screen size.
 */
export function postMediaFrameClass(post: PostMediaFrameInput | null | undefined): string {
  if (!post) return "aspect-square";

  // Explicit upload-time aspect ratio wins when present.
  switch ((post.aspect_ratio || "").trim()) {
    case "1:1":      return "aspect-square";
    case "4:5":      return "aspect-[4/5]";
    case "1.91:1":   return "aspect-[191/100]";
    case "9:16":     return "aspect-[9/16]";
  }

  // Scrolls are always 9:16.
  if ((post.content_type || "").toLowerCase() === "scroll") {
    return "aspect-[9/16]";
  }

  // Legacy rows without an explicit content_type: infer scroll from video
  // media so pre-migration content still frames correctly. A row that IS
  // explicitly a Post never falls into this branch — Post videos render
  // at the default frame (or their persisted aspect_ratio, above).
  if (!post.content_type && post.media_type === "video") {
    return "aspect-[9/16]";
  }

  // Photo posts and Post-videos-without-a-persisted-ratio default to 1:1,
  // matching the upload pipeline's 1080x1080 image output.
  return "aspect-square";
}

/**
 * object-fit class. We always use `object-cover` against the canonical frame:
 * because the upload pipeline already normalises media to the same ratio as
 * the frame, `cover` shows the whole image with no extra crop, AND it stays
 * stable when CSS subpixel rounding would otherwise let `contain` leave a
 * 1px gap on one edge. Legacy posts (rare) whose stored media doesn't match
 * the frame fall back gracefully — they're centered and any crop is
 * deterministic across surfaces, not breakpoint-dependent.
 */
export const POST_MEDIA_FIT_CLASS = "object-cover";
