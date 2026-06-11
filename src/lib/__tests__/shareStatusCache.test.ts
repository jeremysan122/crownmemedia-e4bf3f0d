/**
 * Unit tests for the ShareDialog status cache. Pins the safety invariants:
 *  - Cache HITs within TTL skip the network.
 *  - Force-refresh bypasses the cache.
 *  - Deleted/removed/hidden are cached (still blocks sharing) but invalidate
 *    correctly on moderation events.
 *  - Different viewers get separate cache entries.
 *  - Cache survives the dialog being closed and reopened.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const rpc = vi.fn();

vi.mock("@/integrations/supabase/client", () => ({
  supabase: { rpc: (...args: unknown[]) => rpc(...args) },
}));

import {
  __resetShareStatusCacheForTests,
  __seedShareStatusForTests,
  getShareStatus,
  invalidateShareStatus,
  SHARE_STATUS_TTL_MS,
} from "@/lib/shareStatusCache";

beforeEach(() => {
  __resetShareStatusCacheForTests();
  rpc.mockReset();
});
afterEach(() => {
  __resetShareStatusCacheForTests();
});

describe("getShareStatus — TTL caching", () => {
  it("first call misses; second call within TTL hits the cache (no extra RPC)", async () => {
    rpc.mockResolvedValueOnce({ data: "visible", error: null });
    const a = await getShareStatus("p1", "u1");
    const b = await getShareStatus("p1", "u1");
    expect(a.fromCache).toBe(false);
    expect(b.fromCache).toBe(true);
    expect(a.status).toBe("visible");
    expect(b.status).toBe("visible");
    expect(rpc).toHaveBeenCalledTimes(1);
  });

  it("force: true bypasses the cache and re-hits the RPC", async () => {
    rpc
      .mockResolvedValueOnce({ data: "visible", error: null })
      .mockResolvedValueOnce({ data: "deleted", error: null });
    await getShareStatus("p1", "u1");
    const forced = await getShareStatus("p1", "u1", { force: true });
    expect(forced.fromCache).toBe(false);
    expect(forced.status).toBe("deleted");
    expect(rpc).toHaveBeenCalledTimes(2);
  });

  it("expired TTL forces a new fetch", async () => {
    rpc.mockResolvedValueOnce({ data: "removed", error: null });
    __seedShareStatusForTests("p1", "u1", "visible", Date.now() - (SHARE_STATUS_TTL_MS + 5_000));
    const stale = await getShareStatus("p1", "u1");
    expect(stale.fromCache).toBe(false);
    expect(stale.status).toBe("removed");
  });

  it("different viewers get independent cache entries (RLS-safe)", async () => {
    rpc
      .mockResolvedValueOnce({ data: "visible", error: null })
      .mockResolvedValueOnce({ data: "deleted", error: null });
    const v1 = await getShareStatus("p1", "viewer-A");
    const v2 = await getShareStatus("p1", "viewer-B");
    expect(v1.status).toBe("visible");
    expect(v2.status).toBe("deleted");
    expect(rpc).toHaveBeenCalledTimes(2);
  });

  it("deleted/removed states are cached too (stale cache cannot unblock sharing)", async () => {
    rpc.mockResolvedValueOnce({ data: "deleted", error: null });
    const a = await getShareStatus("p1", "u1");
    const b = await getShareStatus("p1", "u1");
    expect(a.status).toBe("deleted");
    expect(b.status).toBe("deleted");
    expect(b.fromCache).toBe(true);
  });

  it("returns 'unknown' on RPC error and does not cache it as visible", async () => {
    rpc
      .mockResolvedValueOnce({ data: null, error: { message: "boom" } })
      .mockResolvedValueOnce({ data: "visible", error: null });
    const err = await getShareStatus("p1", "u1");
    expect(err.status).toBe("unknown");
    const next = await getShareStatus("p1", "u1");
    expect(next.status).toBe("visible");
    expect(next.fromCache).toBe(false);
  });

  it("invalidateShareStatus(postId) wipes that post's entries for all viewers", async () => {
    rpc
      .mockResolvedValueOnce({ data: "visible", error: null })
      .mockResolvedValueOnce({ data: "visible", error: null })
      .mockResolvedValueOnce({ data: "removed", error: null });
    await getShareStatus("p1", "u1");
    await getShareStatus("p1", "u2");
    invalidateShareStatus("p1");
    const next = await getShareStatus("p1", "u1");
    expect(next.fromCache).toBe(false);
    expect(next.status).toBe("removed");
    expect(rpc).toHaveBeenCalledTimes(3);
  });

  it("invalidateShareStatus() with no arg clears the entire cache", async () => {
    __seedShareStatusForTests("p1", "u1", "visible");
    __seedShareStatusForTests("p2", "u2", "visible");
    invalidateShareStatus();
    rpc.mockResolvedValueOnce({ data: "visible", error: null });
    const r = await getShareStatus("p1", "u1");
    expect(r.fromCache).toBe(false);
  });

  it("concurrent callers share a single inflight RPC", async () => {
    let resolve: (v: { data: string; error: null }) => void = () => {};
    rpc.mockReturnValueOnce(new Promise((r) => (resolve = r)));
    const a = getShareStatus("p1", "u1");
    const b = getShareStatus("p1", "u1");
    resolve({ data: "visible", error: null });
    const [ra, rb] = await Promise.all([a, b]);
    expect(ra.status).toBe("visible");
    expect(rb.status).toBe("visible");
    expect(rpc).toHaveBeenCalledTimes(1);
  });
});
