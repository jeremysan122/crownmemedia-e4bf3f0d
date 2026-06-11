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
});
