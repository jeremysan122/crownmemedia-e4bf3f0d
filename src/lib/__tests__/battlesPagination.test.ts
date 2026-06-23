import { describe, it, expect, beforeEach } from "vitest";
import {
  tabPredicate,
  appendDedup,
  nextCursor,
  battleTimeMs,
  loadPersistedState,
  savePersistedState,
  clearPersistedState,
  emptyPerTab,
  PAGE_SIZE,
  THIRTY_DAYS_MS,
  type BattleCursor,
  type PersistedBattlesState,
} from "@/lib/battlesPagination";
import type { BattleLike } from "@/lib/battlesLogic";

const NOW = Date.parse("2026-06-11T12:00:00Z");
const ago = (ms: number) => new Date(NOW - ms).toISOString();
const ahead = (ms: number) => new Date(NOW + ms).toISOString();
const ME = "me";

const make = (over: Partial<BattleLike> & { id: string }): BattleLike => ({
  id: over.id,
  challenger_id: over.challenger_id ?? ME,
  opponent_id: over.opponent_id ?? "other",
  status: over.status ?? "active",
  ends_at: over.ends_at ?? ahead(3_600_000),
  challenger_votes: over.challenger_votes ?? 0,
  opponent_votes: over.opponent_votes ?? 0,
  created_at: over.created_at ?? ago(3_600_000),
});

describe("tabPredicate", () => {
  it("Active is platform-wide — non-participants still see live battles", () => {
    const b = make({ id: "x", challenger_id: "a", opponent_id: "b", status: "active", ends_at: ahead(60_000) });
    expect(tabPredicate("active", b, ME, NOW)).toBe(true);
    expect(tabPredicate("active", b, null, NOW)).toBe(true);
  });

  it("Personal tabs reject battles where viewer is not a participant", () => {
    const b = make({ id: "x", challenger_id: "a", opponent_id: "b", status: "pending" });
    expect(tabPredicate("pending", b, ME, NOW)).toBe(false);
    expect(tabPredicate("mine", b, ME, NOW)).toBe(false);
    expect(tabPredicate("done", b, ME, NOW)).toBe(false);
    expect(tabPredicate("declined", b, ME, NOW)).toBe(false);
  });

  it("Active: status=active && not ended && not declined (platform-wide)", () => {
    expect(tabPredicate("active", make({ id: "a", status: "active", ends_at: ahead(60_000) }), ME, NOW)).toBe(true);
    expect(tabPredicate("active", make({ id: "a", status: "active", ends_at: ago(60_000) }), ME, NOW)).toBe(false);
    expect(tabPredicate("active", make({ id: "a", status: "pending" }), ME, NOW)).toBe(false);
    expect(tabPredicate("active", make({ id: "a", status: "completed" }), ME, NOW)).toBe(false);
    expect(tabPredicate("active", make({ id: "a", status: "declined" }), ME, NOW)).toBe(false);
  });

  it("Pending: mine && status=pending", () => {
    expect(tabPredicate("pending", make({ id: "a", status: "pending" }), ME, NOW)).toBe(true);
    expect(tabPredicate("pending", make({ id: "a", status: "active" }), ME, NOW)).toBe(false);
  });

  it("Mine: mine && status=active && not ended (viewer's own live battles)", () => {
    expect(tabPredicate("mine", make({ id: "a", status: "active", ends_at: ahead(60_000) }), ME, NOW)).toBe(true);
    expect(tabPredicate("mine", make({ id: "a", status: "active", ends_at: ago(60_000) }), ME, NOW)).toBe(false);
    expect(tabPredicate("mine", make({ id: "a", status: "pending" }), ME, NOW)).toBe(false);
    expect(tabPredicate("mine", make({ id: "a", status: "completed" }), ME, NOW)).toBe(false);
  });

  it("Past: mine && ended (any age)", () => {
    expect(tabPredicate("done", make({ id: "a", status: "completed", ends_at: ago(2 * 86_400_000) }), ME, NOW)).toBe(true);
    expect(tabPredicate("done", make({ id: "a", status: "completed", ends_at: ago(45 * 86_400_000) }), ME, NOW)).toBe(true);
    expect(tabPredicate("done", make({ id: "a", status: "active", ends_at: ahead(60_000) }), ME, NOW)).toBe(false);
    expect(tabPredicate("done", make({ id: "a", status: "declined" }), ME, NOW)).toBe(false);
  });

  it("Declined: mine && status in (declined, cancelled)", () => {
    expect(tabPredicate("declined", make({ id: "a", status: "declined" }), ME, NOW)).toBe(true);
    expect(tabPredicate("declined", make({ id: "a", status: "cancelled" }), ME, NOW)).toBe(true);
    expect(tabPredicate("declined", make({ id: "a", status: "canceled" }), ME, NOW)).toBe(true);
    expect(tabPredicate("declined", make({ id: "a", status: "active" }), ME, NOW)).toBe(false);
  });
});

describe("battleTimeMs", () => {
  it("prefers ends_at when present", () => {
    expect(battleTimeMs({ ends_at: ahead(60_000), created_at: ago(60_000) })).toBe(NOW + 60_000);
  });
  it("falls back to created_at when ends_at is missing", () => {
    expect(battleTimeMs({ ends_at: null, created_at: ago(60_000) })).toBe(NOW - 60_000);
  });
});

describe("appendDedup", () => {
  it("appends new rows in order", () => {
    const { merged, dropped } = appendDedup([{ id: "a" }], [{ id: "b" }, { id: "c" }]);
    expect(merged.map((m) => m.id)).toEqual(["a", "b", "c"]);
    expect(dropped).toBe(0);
  });
  it("drops rows whose id is already loaded (overlapping page)", () => {
    const { merged, dropped } = appendDedup([{ id: "a" }, { id: "b" }], [{ id: "b" }, { id: "c" }]);
    expect(merged.map((m) => m.id)).toEqual(["a", "b", "c"]);
    expect(dropped).toBe(1);
  });
  it("is idempotent when the same page is appended twice (rapid double-tap, retry)", () => {
    const page = [{ id: "a" }, { id: "b" }];
    const first = appendDedup([], page);
    const second = appendDedup(first.merged, page);
    expect(second.merged.map((m) => m.id)).toEqual(["a", "b"]);
    expect(second.dropped).toBe(2);
  });
  it("survives back-navigation rehydration with the same restored page", () => {
    const restored = [{ id: "a" }, { id: "b" }, { id: "c" }];
    const { merged } = appendDedup(restored, restored);
    expect(merged.map((m) => m.id)).toEqual(["a", "b", "c"]);
  });
});

describe("nextCursor", () => {
  it("returns null when the page is short (server exhausted)", () => {
    expect(nextCursor([{ id: "a", created_at: ago(0) }], 10)).toBeNull();
  });
  it("encodes (created_at, id) of the last row when the page is full", () => {
    const rows = Array.from({ length: PAGE_SIZE }, (_, i) => ({
      id: `b${i}`,
      created_at: new Date(NOW - i * 1000).toISOString(),
    }));
    const c = nextCursor(rows, PAGE_SIZE);
    expect(c).toEqual({ createdAt: rows[PAGE_SIZE - 1].created_at, id: `b${PAGE_SIZE - 1}` });
  });
  it("never returns a cursor that would re-fetch already-loaded rows", () => {
    const rows = Array.from({ length: PAGE_SIZE }, (_, i) => ({
      id: `b${i}`,
      created_at: new Date(NOW - i * 1000).toISOString(),
    }));
    const c = nextCursor(rows, PAGE_SIZE)!;
    // Cursor points at the last loaded row; the next page must use strict `<` so this row doesn't repeat.
    expect(c.id).toBe(rows[PAGE_SIZE - 1].id);
  });
});

describe("sessionStorage persistence (tab/cursor/scroll restore)", () => {
  beforeEach(() => sessionStorage.clear());

  const baseState = (): PersistedBattlesState<{ id: string }> => ({
    savedAt: Date.now(),
    viewerId: ME,
    tab: "mine",
    filters: { query: "q", region: "global", category: "all", sort: "newest", hub: "all", topic: "all" },
    perTab: {
      active: { rows: [{ id: "a1" }], cursor: { createdAt: ago(10_000), id: "a1" }, exhausted: false },
      pending: { rows: [], cursor: null, exhausted: true },
      mine: { rows: [{ id: "m1" }, { id: "m2" }], cursor: null, exhausted: true },
      done: { rows: [], cursor: null, exhausted: false },
      declined: { rows: [], cursor: null, exhausted: false },
    },
    scrollY: 420,
  });

  it("round-trips the full tab+cursor+scroll+filters state", () => {
    const s = baseState();
    savePersistedState(s);
    const restored = loadPersistedState<{ id: string }>(ME);
    expect(restored).not.toBeNull();
    expect(restored!.tab).toBe("mine");
    expect(restored!.scrollY).toBe(420);
    expect(restored!.filters.query).toBe("q");
    expect(restored!.perTab.active.cursor).toEqual(s.perTab.active.cursor);
    expect(restored!.perTab.mine.rows.map((r) => r.id)).toEqual(["m1", "m2"]);
  });

  it("ignores state belonging to a different viewer (no leak across accounts)", () => {
    savePersistedState(baseState());
    expect(loadPersistedState<{ id: string }>("other-user")).toBeNull();
  });

  it("drops stale state older than the TTL", () => {
    const s = baseState();
    s.savedAt = Date.now() - 60 * 60 * 1000;
    savePersistedState(s);
    expect(loadPersistedState<{ id: string }>(ME)).toBeNull();
  });

  it("clearPersistedState removes the entry", () => {
    savePersistedState(baseState());
    clearPersistedState();
    expect(loadPersistedState<{ id: string }>(ME)).toBeNull();
  });

  it("emptyPerTab seeds independent state per tab (loading more in one never bleeds into another)", () => {
    const perTab = emptyPerTab<{ id: string }>();
    perTab.active.rows.push({ id: "a1" });
    perTab.active.cursor = { createdAt: "2026-01-01T00:00:00Z", id: "a1" };
    expect(perTab.pending.rows).toEqual([]);
    expect(perTab.pending.cursor).toBeNull();
    expect(perTab.mine.rows).toEqual([]);
    expect(perTab.done.rows).toEqual([]);
  });
});

describe("end-to-end pagination invariants", () => {
  it("retry after a failed load-more uses the same cursor and does not duplicate rows", () => {
    // Initial page loaded.
    const page1 = Array.from({ length: PAGE_SIZE }, (_, i) => ({
      id: `b${i}`,
      created_at: new Date(NOW - i * 1000).toISOString(),
    }));
    const after1 = appendDedup<{ id: string; created_at: string }>([], page1);
    const cur1 = nextCursor(page1, PAGE_SIZE);
    expect(cur1).not.toBeNull();

    // Pretend load-more failed; user retries with the SAME cursor and gets the SAME page2 back.
    const page2 = Array.from({ length: PAGE_SIZE }, (_, i) => ({
      id: `b${PAGE_SIZE + i}`,
      created_at: new Date(NOW - (PAGE_SIZE + i) * 1000).toISOString(),
    }));
    const after2a = appendDedup(after1.merged, page2);
    // Network flake: response arrives twice (or a stale retry races). Apply page2 again.
    const after2b = appendDedup(after2a.merged, page2);
    expect(after2b.merged.length).toBe(PAGE_SIZE * 2);
    expect(after2b.dropped).toBe(PAGE_SIZE);
  });

  it("rapid double-tap on Load More is safe — applying page N twice yields one copy", () => {
    const page = [{ id: "x1", created_at: ago(1000) }, { id: "x2", created_at: ago(2000) }];
    const r1 = appendDedup([], page);
    const r2 = appendDedup(r1.merged, page);
    expect(r2.merged.map((m) => m.id)).toEqual(["x1", "x2"]);
  });

  it("server-overlap pages do not produce duplicate battle_ids", () => {
    const prev = [{ id: "a", created_at: ago(1000) }, { id: "b", created_at: ago(2000) }];
    const overlap = [{ id: "b", created_at: ago(2000) }, { id: "c", created_at: ago(3000) }];
    const { merged } = appendDedup(prev, overlap);
    expect(merged.map((m) => m.id)).toEqual(["a", "b", "c"]);
  });

  it("per-tab cursors are independent — exhausting one tab does not exhaust another", () => {
    const perTab = emptyPerTab<{ id: string }>();
    perTab.active.exhausted = true;
    perTab.active.cursor = null;
    expect(perTab.mine.exhausted).toBe(false);
    expect(perTab.pending.exhausted).toBe(false);
    expect(perTab.done.exhausted).toBe(false);
  });

  it("THIRTY_DAYS_MS boundary: a 30-day-old battle is still Mine, a 30-day-and-1ms battle is Past", () => {
    const onEdge = make({ id: "edge", status: "completed", ends_at: ago(THIRTY_DAYS_MS), created_at: ago(THIRTY_DAYS_MS) });
    const justOver = make({ id: "over", status: "completed", ends_at: ago(THIRTY_DAYS_MS + 1), created_at: ago(THIRTY_DAYS_MS + 1) });
    expect(tabPredicate("mine", onEdge, ME, NOW)).toBe(true);
    expect(tabPredicate("done", onEdge, ME, NOW)).toBe(false);
    expect(tabPredicate("mine", justOver, ME, NOW)).toBe(false);
    expect(tabPredicate("done", justOver, ME, NOW)).toBe(true);
  });
});
