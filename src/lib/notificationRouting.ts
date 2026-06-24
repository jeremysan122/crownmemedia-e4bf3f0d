// Central notification routing helper.
//
// Maps a notification row (type + payload) to an in-app destination.
// Returns `null` when required metadata is missing or the type is unknown —
// callers should show a safe "no longer available" fallback instead of
// generating a broken/404 link.
//
// IMPORTANT: this helper never trusts content visibility. It only builds a
// link; the destination route is responsible for enforcing RLS and showing
// its own unavailable state when the target was deleted/hidden/private.

export interface NotificationLike {
  type?: string | null;
  payload?: Record<string, any> | null;
}

const safePath = (p: unknown): string | null =>
  typeof p === "string" && p.startsWith("/") ? p : null;

/**
 * Resolve the deep-link destination for a notification. Returns `null` when
 * the notification is missing required metadata or the type isn't routable.
 */
export function getNotificationTarget(n: NotificationLike): string | null {
  if (!n) return null;
  const p: Record<string, any> = n.payload ?? {};

  // 1. Explicit payload.link / payload.deeplink wins (server-authored deep links).
  const explicit = safePath(p.link) ?? safePath(p.deeplink);
  if (explicit) return explicit;

  const type = (n.type ?? "").toString();

  switch (type) {
    case "dm":
    case "dm_gift":
    case "dm_share": {
      if (p.thread_id) return `/messages?thread=${p.thread_id}`;
      if (p.sender_id) return `/messages?with=${p.sender_id}`;
      return "/messages";
    }
    case "follow": {
      if (p.follower_username) return `/${p.follower_username}`;
      if (p.follower_id) return `/${p.follower_id}`;
      return null;
    }
    case "vote": {
      if (p.battle_id) return `/battles?b=${p.battle_id}`;
      if (p.post_id) return `/post/${p.post_id}`;
      return null;
    }
    case "comment": {
      if (p.post_id) {
        const anchor = p.comment_id ? `#c-${p.comment_id}` : "";
        return `/post/${p.post_id}${anchor}`;
      }
      return null;
    }
    case "crown_won":
    case "crown_lost": {
      if (p.post_id) return `/post/${p.post_id}`;
      if (p.username) return `/${p.username}`;
      return "/leaderboard";
    }
    case "battle_challenge":
    case "battle_won":
    case "battle_lost": {
      if (p.battle_id) return `/battles?b=${p.battle_id}`;
      return "/battles";
    }
    case "system": {
      // Common system subtypes encoded in payload.kind
      const kind = (p.kind ?? "").toString();
      if (kind === "reward" || kind === "daily_reward") return "/rewards";
      if (kind === "verification") return "/verification";
      if (kind === "payout") return "/wallet";
      if (kind === "moderation" && p.post_id) return `/post/${p.post_id}`;
      if (kind === "security") return "/settings";
      return null;
    }
    default:
      return null;
  }
}

/** True when a notification can be opened to a route. */
export function isNotificationRoutable(n: NotificationLike): boolean {
  return getNotificationTarget(n) !== null;
}
