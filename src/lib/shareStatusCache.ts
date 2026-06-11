/**
 * Lightweight in-memory cache for `get_post_share_status` RPC results.
 *
 * Goals:
 *  - Avoid re-hitting the RPC every time the same ShareDialog opens or a
 *    share button is pressed for the same post.
 *  - Never let a stale entry expose a deleted / removed / hidden post —
 *    deleted/removed/hidden are kept in the cache too (so we still block
 *    sharing), but the TTL is short and the cache is bypassed whenever the
 *    caller forces a refresh, or when moderation/deletion code calls
 *    `invalidateShareStatus(postId)`.
 *  - Keyed by (postId, viewerId) — visibility depends on the viewer's RLS
 *    context, so two different signed-in users may legitimately get
 *    different statuses for the same post.
 *
 * The cache lives in module scope so it's shared across components in the
 * SPA but resets on full page reload — exactly the lifecycle we want.
 */
import { supabase } from "@/integrations/supabase/client";

export type ShareStatus = "visible" | "deleted" | "removed" | "hidden" | "unknown";

export interface ShareStatusResult {
  status: ShareStatus;
  /** True when the value came from the in-memory cache (not the network). */
  fromCache: boolean;
  /** ms epoch when this status was first fetched from the network. */
  cachedAt: number;
}

/** Default TTL — short on purpose so deleted/removed/hidden don't linger. */
export const SHARE_STATUS_TTL_MS = 30_000;

interface Entry {
  status: ShareStatus;
  cachedAt: number;
  /** Inflight promise dedupes concurrent callers (open + retry + button). */
  inflight?: Promise<ShareStatus>;
}

const cache = new Map<string, Entry>();

function key(postId: string, viewerId: string | null | undefined): string {
  return `${postId}::${viewerId ?? "anon"}`;
}

/**
 * Invalidate one post for all viewers (call from moderation / deletion code),
 * or pass nothing to clear the whole cache (e.g. on sign-out).
 */
export function invalidateShareStatus(postId?: string): void {
  if (!postId) {
    cache.clear();
    return;
  }
  const prefix = `${postId}::`;
  for (const k of cache.keys()) {
    if (k.startsWith(prefix)) cache.delete(k);
  }
}

/** Test-only escape hatch. */
export function __resetShareStatusCacheForTests(): void {
  cache.clear();
}

/** Test-only seed for unit tests that don't hit the network. */
export function __seedShareStatusForTests(
  postId: string,
  viewerId: string | null,
  status: ShareStatus,
  cachedAt = Date.now(),
): void {
  cache.set(key(postId, viewerId), { status, cachedAt });
}

export interface GetShareStatusOptions {
  /** Force-refresh (bypass cache + invalidate the entry on success). */
  force?: boolean;
  /** Override TTL (mostly for tests). */
  ttlMs?: number;
}

/**
 * Fetch a post's share status with TTL caching + per-key inflight dedupe.
 * NEVER throws — returns `{ status: "unknown" }` on RPC error so callers can
 * surface a refresh-error state without crashing the dialog.
 */
export async function getShareStatus(
  postId: string,
  viewerId: string | null | undefined,
  opts: GetShareStatusOptions = {},
): Promise<ShareStatusResult> {
  const ttl = opts.ttlMs ?? SHARE_STATUS_TTL_MS;
  const k = key(postId, viewerId);
  const now = Date.now();
  const hit = cache.get(k);

  if (!opts.force && hit && !hit.inflight && now - hit.cachedAt < ttl) {
    return { status: hit.status, fromCache: true, cachedAt: hit.cachedAt };
  }

  // Reuse an inflight fetch so a burst of callers shares one network call.
  if (!opts.force && hit?.inflight) {
    const status = await hit.inflight;
    return { status, fromCache: false, cachedAt: cache.get(k)?.cachedAt ?? now };
  }

  const inflight = (async (): Promise<ShareStatus> => {
    const { data, error } = await supabase.rpc("get_post_share_status", {
      _post_id: postId,
    });
    if (error) return "unknown";
    const status =
      data === "visible" || data === "deleted" || data === "removed"
        ? (data as ShareStatus)
        : "unknown";
    return status;
  })();

  cache.set(k, { status: hit?.status ?? "unknown", cachedAt: hit?.cachedAt ?? 0, inflight });

  try {
    const status = await inflight;
    cache.set(k, { status, cachedAt: Date.now() });
    return { status, fromCache: false, cachedAt: Date.now() };
  } catch {
    // Defensive — the RPC wrapper above already swallows errors.
    cache.delete(k);
    return { status: "unknown", fromCache: false, cachedAt: now };
  }
}
