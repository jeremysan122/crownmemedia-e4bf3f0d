import { describe, it, expect } from "vitest";
import {
  isSafeTrendingPost,
  isSafeBattle,
  isSafeNearbyProfile,
  nextPostsCursor,
  nextBattlesCursor,
  mergeDedupById,
} from "@/lib/discoverPagination";

const VIEWER = "viewer-1";
const BLOCKED = new Set(["blocked-user"]);

describe("isSafeTrendingPost", () => {
  const base = { id: "p1", user_id: "u1", crown_score: 10 };
  const ctx = { blockedIds: BLOCKED, viewerId: VIEWER };

  it("accepts a normal post", () => {
    expect(isSafeTrendingPost(base, ctx)).toBe(true);
  });
  it.each([
    ["removed", { is_removed: true }],
    ["archived", { is_archived: true }],
    ["hidden", { is_hidden: true }],
    ["moderation removed", { moderation_status: "removed" }],
    ["moderation rejected", { moderation_status: "rejected" }],
    ["moderation quarantined", { moderation_status: "quarantined" }],
  ])("rejects when %s", (_, patch) => {
    expect(isSafeTrendingPost({ ...base, ...patch }, ctx)).toBe(false);
  });
  it("rejects posts from blocked authors", () => {
    expect(isSafeTrendingPost({ ...base, user_id: "blocked-user" }, ctx)).toBe(false);
  });
});

describe("isSafeBattle", () => {
  const future = new Date(Date.now() + 60_000).toISOString();
  const past = new Date(Date.now() - 60_000).toISOString();
  const base = { id: "b1", challenger_id: "c", opponent_id: "o", ends_at: future, status: "active" };

  it("accepts active future battles", () => {
    expect(isSafeBattle(base, { blockedIds: BLOCKED })).toBe(true);
  });
  it("rejects ended battles", () => {
    expect(isSafeBattle({ ...base, ends_at: past }, { blockedIds: BLOCKED })).toBe(false);
  });
  it("rejects removed/hidden battles", () => {
    expect(isSafeBattle({ ...base, is_removed: true }, { blockedIds: BLOCKED })).toBe(false);
    expect(isSafeBattle({ ...base, is_hidden: true }, { blockedIds: BLOCKED })).toBe(false);
  });
  it("rejects non-active statuses", () => {
    expect(isSafeBattle({ ...base, status: "completed" }, { blockedIds: BLOCKED })).toBe(false);
    expect(isSafeBattle({ ...base, status: "cancelled" }, { blockedIds: BLOCKED })).toBe(false);
  });
  it("rejects when either participant is blocked", () => {
    expect(isSafeBattle({ ...base, challenger_id: "blocked-user" }, { blockedIds: BLOCKED })).toBe(false);
    expect(isSafeBattle({ ...base, opponent_id: "blocked-user" }, { blockedIds: BLOCKED })).toBe(false);
  });
});

describe("isSafeNearbyProfile", () => {
  const ctx = { blockedIds: BLOCKED, viewerId: VIEWER };
  it("rejects self, banned, suspended, private, non-discoverable, blocked", () => {
    expect(isSafeNearbyProfile({ id: VIEWER }, ctx)).toBe(false);
    expect(isSafeNearbyProfile({ id: "x", is_banned: true }, ctx)).toBe(false);
    expect(isSafeNearbyProfile({ id: "x", is_suspended: true }, ctx)).toBe(false);
    expect(isSafeNearbyProfile({ id: "x", is_private: true }, ctx)).toBe(false);
    expect(isSafeNearbyProfile({ id: "x", discoverable: false }, ctx)).toBe(false);
    expect(isSafeNearbyProfile({ id: "blocked-user" }, ctx)).toBe(false);
  });
  it("accepts a clean nearby profile", () => {
    expect(isSafeNearbyProfile({ id: "ok", discoverable: true }, ctx)).toBe(true);
  });
});

describe("cursor helpers", () => {
  it("nextPostsCursor returns null when page is not full (no more results)", () => {
    expect(
      nextPostsCursor([{ id: "p1", user_id: "u", crown_score: 5 }], 20),
    ).toBeNull();
  });
  it("nextPostsCursor uses last row's (score, id) tuple when page is full", () => {
    const rows = Array.from({ length: 3 }, (_, i) => ({ id: `p${i}`, user_id: "u", crown_score: 10 - i }));
    expect(nextPostsCursor(rows, 3)).toEqual({ score: 8, id: "p2" });
  });
  it("nextBattlesCursor returns null when partial page", () => {
    expect(nextBattlesCursor([], 10)).toBeNull();
  });
  it("nextBattlesCursor uses (ends_at, id) of last row", () => {
    const rows = [
      { id: "b1", challenger_id: "a", opponent_id: "b", ends_at: "2030-01-01T00:00:00Z" },
      { id: "b2", challenger_id: "a", opponent_id: "b", ends_at: "2030-01-02T00:00:00Z" },
    ];
    expect(nextBattlesCursor(rows, 2)).toEqual({ endsAt: "2030-01-02T00:00:00Z", id: "b2" });
  });
});

describe("mergeDedupById", () => {
  it("appends new items in order", () => {
    const { merged, dropped } = mergeDedupById([{ id: "a" }], [{ id: "b" }, { id: "c" }]);
    expect(merged.map((m) => m.id)).toEqual(["a", "b", "c"]);
    expect(dropped).toBe(0);
  });
  it("drops items that already exist in the prev list", () => {
    const { merged, dropped } = mergeDedupById([{ id: "a" }, { id: "b" }], [{ id: "b" }, { id: "c" }]);
    expect(merged.map((m) => m.id)).toEqual(["a", "b", "c"]);
    expect(dropped).toBe(1);
  });
  it("survives a duplicated page (e.g. retry after a flaky network)", () => {
    const page = [{ id: "a" }, { id: "b" }];
    const first = mergeDedupById([], page);
    const second = mergeDedupById(first.merged, page);
    expect(second.merged.map((m) => m.id)).toEqual(["a", "b"]);
    expect(second.dropped).toBe(2);
  });
  it("survives back-navigation rehydration appending the same page again", () => {
    const restored = [{ id: "a" }, { id: "b" }, { id: "c" }];
    const samePage = [{ id: "a" }, { id: "b" }, { id: "c" }];
    const { merged } = mergeDedupById(restored, samePage);
    expect(merged.map((m) => m.id)).toEqual(["a", "b", "c"]);
  });
});
