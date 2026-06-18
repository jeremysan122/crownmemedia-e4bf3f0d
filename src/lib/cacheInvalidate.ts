/**
 * Cross-surface cache invalidation bus.
 *
 * After a publish, edit, avatar change, username change, or moderation flip
 * we need every list/grid/preview surface (Feed, Profile, Discover, Map,
 * Search, Battles, Leaderboards, Share cards, comments, PostDetail) to
 * drop its cached row for that post or profile and refetch.
 *
 * Rather than threading callbacks through 30+ components, we broadcast a
 * single window CustomEvent that all subscribers listen for. The Discover
 * in-memory cache (`lib/discoverCache`) also subscribes via its own
 * realtime channel — these client-side events are a defence-in-depth
 * supplement for the cases where the realtime delta hasn't arrived yet
 * (the local user's own action).
 */
import { invalidateAll as invalidateDiscoverAll } from "@/lib/discoverCache";

export type InvalidationKind =
  | "post:published"
  | "post:updated"
  | "post:removed"
  | "post:moderation_changed"
  | "profile:updated"
  | "profile:avatar_changed"
  | "profile:username_changed";

export interface InvalidationDetail {
  kind: InvalidationKind;
  postId?: string;
  userId?: string;
  username?: string;
  previousUsername?: string;
}

export function broadcastCacheInvalidation(detail: InvalidationDetail): void {
  // Always drop the Discover in-memory cache — it covers Trending / Nearby /
  // Battles surfaces and is the most likely source of stale public content.
  try { invalidateDiscoverAll(); } catch { /* noop */ }
  try {
    window.dispatchEvent(new CustomEvent("crownme:cache-invalidate", { detail }));
  } catch { /* noop */ }
  if (detail.kind === "profile:username_changed" && detail.previousUsername) {
    // Best-effort: drop SW-cached HTML for both legacy /u/:username and
    // the new short /:username route so stale share cards don't 404.
    try {
      if ("caches" in self) {
        const prev = detail.previousUsername;
        const next = detail.username;
        caches.keys().then((keys) =>
          Promise.all(keys.map((k) => caches.open(k).then((c) => Promise.all([
            c.delete(`/u/${prev}`),
            c.delete(`/${prev}`),
            next ? c.delete(`/${next}`) : Promise.resolve(true),
          ])))),
        ).catch(() => {});
      }
    } catch { /* noop */ }
  }
}
