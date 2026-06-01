/**
 * Append/replace a `v=` query param so CDN/browser caches don't serve a
 * stale image after a post or profile is edited.
 *
 * Pass `version` as `updated_at` (or any monotonically-changing token)
 * so the URL is stable while the underlying media is unchanged and only
 * busts when the media actually changes.
 */
export function withCacheBust(
  url: string | null | undefined,
  version?: string | number | null,
): string {
  if (!url) return url ?? "";
  const v = version != null && version !== "" ? String(version) : "";
  // Fall back to a per-load timestamp only when no version is supplied —
  // otherwise edits to one post would re-download every other image too.
  const token = v || Date.now().toString();
  try {
    const base =
      typeof window !== "undefined" ? window.location.origin : "http://localhost";
    const u = new URL(url, base);
    u.searchParams.set("v", token);
    return u.toString();
  } catch {
    return `${url}${url.includes("?") ? "&" : "?"}v=${encodeURIComponent(token)}`;
  }
}
