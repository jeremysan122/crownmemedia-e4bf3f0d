// Lightweight, debounced page-level usage tracking for the Cloud Spend
// dashboard. Fires through the existing privacy-safe analytics pipeline
// (analytics_events, user_hash only). Each event is sent at most once per
// session per (event + key) pair, scheduled via requestIdleCallback so it
// never blocks UI work.
//
// Do NOT use this for per-render events (image loads, scroll positions,
// keystrokes). It is intentionally coarse-grained.

import { trackEvent, type TrackPayload } from "@/lib/analytics";

type UsageEvent =
  | "feed_opened"
  | "scrolls_opened"
  | "crown_map_opened"
  | "crown_map_marker_opened"
  | "leaderboard_opened"
  | "profile_opened"
  | "post_viewed"
  | "share_card_previewed"
  | "share_card_downloaded"
  | "dm_opened"
  | "dm_sent"
  | "notifications_opened"
  | "post_page_opened"
  | "share_dialog_opened"
  | "vote_attempted"
  | "vote_success"
  | "vote_failed"
  | "verification_page_opened";

const fired = new Set<string>();

function schedule(cb: () => void) {
  const w = window as Window & { requestIdleCallback?: (cb: () => void) => number };
  if (typeof w.requestIdleCallback === "function") {
    w.requestIdleCallback(cb);
  } else {
    setTimeout(cb, 0);
  }
}

/**
 * Fire a usage event at most once per (event + key) per session.
 * @param event   The event name (must be in the analytics EventName union).
 * @param key     Disambiguator (e.g. postId, "self"). Default "default".
 * @param payload Extra metadata; kept minimal and privacy-safe.
 */
export function trackUsage(event: UsageEvent, key = "default", payload: TrackPayload = {}): void {
  const sig = `${event}:${key}`;
  if (fired.has(sig)) return;
  fired.add(sig);
  schedule(() => {
    void trackEvent(event, payload);
  });
}
