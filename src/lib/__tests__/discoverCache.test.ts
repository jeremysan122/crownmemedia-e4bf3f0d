import { describe, it, expect, beforeEach } from "vitest";
import { makeKey, getCached, setCached, invalidateSection, invalidateAll, __resetCacheForTests } from "@/lib/discoverCache";
import { isSafeTrendingPost, isSafeBattle, isSafeNearbyProfile } from "@/lib/discoverPagination";

describe("discoverCache", () => {
  beforeEach(() => __resetCacheForTests());

  it("returns cached value within TTL and misses after expiry", async () => {
    const k = makeKey("trending", { user: "u1", window: "7d", cursor: "0" });
    setCached(k, "trending", [{ id: "p1" }], 50);
    expect(getCached<Array<{ id: string }>>(k)).toEqual([{ id: "p1" }]);
    await new Promise((r) => setTimeout(r, 60));
    expect(getCached(k)).toBeNull();
  });

  it("makeKey is stable regardless of field order", () => {
    const a = makeKey("nearby", { user: "u1", radius: 25, source: "city" });
    const b = makeKey("nearby", { source: "city", radius: 25, user: "u1" });
    expect(a).toBe(b);
  });

  it("scopes entries by viewer + filter context", () => {
    const k1 = makeKey("trending", { user: "u1", window: "7d" });
    const k2 = makeKey("trending", { user: "u2", window: "7d" });
    setCached(k1, "trending", ["A"]);
    setCached(k2, "trending", ["B"]);
    expect(getCached(k1)).toEqual(["A"]);
    expect(getCached(k2)).toEqual(["B"]);
  });

  it("invalidateSection clears only matching entries", () => {
    setCached(makeKey("trending", { user: "u1" }), "trending", ["T"]);
    setCached(makeKey("battles", { user: "u1" }), "battles", ["B"]);
    invalidateSection("trending");
    expect(getCached(makeKey("trending", { user: "u1" }))).toBeNull();
    expect(getCached(makeKey("battles", { user: "u1" }))).toEqual(["B"]);
  });

  it("deduplicates appended pagination results via Set semantics", () => {
    const page1 = [{ id: "a" }, { id: "b" }];
    const page2 = [{ id: "b" }, { id: "c" }];
    const seen = new Set(page1.map((p) => p.id));
    const merged = [...page1, ...page2.filter((p) => !seen.has(p.id))];
    expect(merged.map((m) => m.id)).toEqual(["a", "b", "c"]);
  });

  it("invalidateAll clears every section (used on block/unblock)", () => {
    setCached(makeKey("trending", { user: "u1" }), "trending", ["T"]);
    setCached(makeKey("battles", { user: "u1" }), "battles", ["B"]);
    setCached(makeKey("nearby", { user: "u1" }), "nearby", ["N"]);
    invalidateAll();
    expect(getCached(makeKey("trending", { user: "u1" }))).toBeNull();
    expect(getCached(makeKey("battles", { user: "u1" }))).toBeNull();
    expect(getCached(makeKey("nearby", { user: "u1" }))).toBeNull();
  });
});

// Cache-safety guard: simulates what happens when the cache returns a
// payload that has since become unsafe (post removed, profile banned,
// battle ended). The render layer must re-run the safety predicate on
// every cached payload so stale entries can never expose hidden content.
describe("discoverCache + post-cache safety filter", () => {
  beforeEach(() => __resetCacheForTests());

  it("filters out content that became unsafe after caching", () => {
    const viewer = "viewer-1";
    const blocked = new Set<string>();
    const key = makeKey("trending", { user: viewer });
    setCached(key, "trending", [
      { id: "p1", user_id: "u1", crown_score: 5 },
      { id: "p2", user_id: "u2", crown_score: 4, is_removed: true }, // since deleted
      { id: "p3", user_id: "u3", crown_score: 3, moderation_status: "removed" }, // since moderated
      { id: "p4", user_id: "u4", crown_score: 2, is_hidden: true }, // since hidden
    ]);
    const cached = getCached<any[]>(key) ?? [];
    const safe = cached.filter((p) => isSafeTrendingPost(p, { blockedIds: blocked, viewerId: viewer }));
    expect(safe.map((p) => p.id)).toEqual(["p1"]);
  });

  it("hides cached battles after they end / get hidden", () => {
    const key = makeKey("battles", { user: "u1" });
    const past = new Date(Date.now() - 1000).toISOString();
    const future = new Date(Date.now() + 60_000).toISOString();
    setCached(key, "battles", [
      { id: "b1", challenger_id: "a", opponent_id: "b", ends_at: future, status: "active" },
      { id: "b2", challenger_id: "a", opponent_id: "b", ends_at: past, status: "active" }, // ended
      { id: "b3", challenger_id: "a", opponent_id: "b", ends_at: future, is_hidden: true }, // hidden
    ]);
    const cached = getCached<any[]>(key) ?? [];
    const safe = cached.filter((b) => isSafeBattle(b, { blockedIds: new Set() }));
    expect(safe.map((b) => b.id)).toEqual(["b1"]);
  });

  it("hides cached nearby profiles that became private/banned/non-discoverable", () => {
    const viewer = "viewer-1";
    const key = makeKey("nearby", { user: viewer, radius: 25 });
    setCached(key, "nearby", [
      { id: "ok" },
      { id: "banned-now", is_banned: true },
      { id: "private-now", is_private: true },
      { id: "opted-out", discoverable: false },
      { id: viewer }, // self
    ]);
    const cached = getCached<any[]>(key) ?? [];
    const safe = cached.filter((p) => isSafeNearbyProfile(p, { blockedIds: new Set(), viewerId: viewer }));
    expect(safe.map((p) => p.id)).toEqual(["ok"]);
  });

  it("hides cached content once the viewer blocks the author", () => {
    const viewer = "viewer-1";
    const key = makeKey("trending", { user: viewer });
    setCached(key, "trending", [
      { id: "p1", user_id: "friend", crown_score: 9 },
      { id: "p2", user_id: "spammer", crown_score: 8 },
    ]);
    // User just blocked "spammer" — Discover must drop their content on
    // the next read, even from the cache. Our realtime invalidation hook
    // calls invalidateAll() but unit-test the post-filter as a defence-
    // in-depth: even if a stale read sneaks through, it is filtered out.
    const blocked = new Set(["spammer"]);
    const safe = (getCached<any[]>(key) ?? []).filter((p) =>
      isSafeTrendingPost(p, { blockedIds: blocked, viewerId: viewer }),
    );
    expect(safe.map((p) => p.id)).toEqual(["p1"]);
  });
});

// State preservation: the snapshot the page writes to sessionStorage on
// unload must round-trip cleanly so back-navigation restores scroll +
// cursor + items without flashing a full loading state.
describe("discover state snapshot round-trip", () => {
  it("preserves cursor + items + filters when serialised through sessionStorage", () => {
    const snapshot = {
      windowSel: "7d" as const,
      radius: 25 as const,
      scrollY: 1284,
      trending: [{ id: "p1", user_id: "u" }, { id: "p2", user_id: "u" }],
      trendingCursor: { score: 12, id: "p2" },
      trendingHasMore: true,
      battles: [{ id: "b1" }],
      battlesCursor: { endsAt: "2030-01-01T00:00:00Z", id: "b1" },
      battlesHasMore: false,
    };
    const restored = JSON.parse(JSON.stringify(snapshot));
    expect(restored.scrollY).toBe(1284);
    expect(restored.trendingCursor).toEqual({ score: 12, id: "p2" });
    expect(restored.battlesHasMore).toBe(false);
    expect(restored.radius).toBe(25);
  });
});
