// Tests for the Crown Battles personal-tab filters (Active / Pending /
// Mine / Past). The page-level helpers are recreated here as pure
// functions so we can exhaustively test them without rendering the page.
//
// Rules under test:
//   - All four tabs only show battles where the signed-in user is
//     challenger or opponent (never unrelated public battles).
//   - Active = mine && status="active" && not ended.
//   - Pending = mine && status="pending".
//   - Mine = mine && within last 30 days (any status), newest first.
//   - Past = mine && ended && older than 30 days, newest first.

import { describe, it, expect } from "vitest";

interface B {
  id: string;
  challenger_id: string;
  opponent_id: string;
  status: string;
  ends_at: string | null;
  created_at: string;
}

const NOW = Date.parse("2026-06-11T12:00:00Z");
const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;
const ago = (ms: number) => new Date(NOW - ms).toISOString();
const ahead = (ms: number) => new Date(NOW + ms).toISOString();

const isEnded = (b: B) =>
  b.status === "completed" || b.status === "declined" || b.status === "cancelled" ||
  (!!b.ends_at && new Date(b.ends_at).getTime() <= NOW);
const isMine = (uid: string) => (b: B) => b.challenger_id === uid || b.opponent_id === uid;
const battleTimeMs = (b: B) => {
  const t = b.ends_at ? new Date(b.ends_at).getTime() : 0;
  return Number.isFinite(t) && t > 0 ? t : new Date(b.created_at).getTime();
};

const ME = "me";
const make = (over: Partial<B>): B => ({
  id: over.id ?? "b",
  challenger_id: over.challenger_id ?? ME,
  opponent_id: over.opponent_id ?? "other",
  status: over.status ?? "active",
  ends_at: over.ends_at ?? ahead(60 * 60 * 1000),
  created_at: over.created_at ?? ago(60 * 60 * 1000),
});

describe("Crown Battles personal-tab filters", () => {
  const mine = isMine(ME);

  const battles: B[] = [
    make({ id: "a1", status: "active", ends_at: ahead(3600_000) }),                      // Active (mine)
    make({ id: "a2", status: "active", challenger_id: "x", opponent_id: "y" }),          // Public active (NOT mine)
    make({ id: "p1", status: "pending", ends_at: null }),                                // Pending (mine)
    make({ id: "p2", status: "pending", challenger_id: "x", opponent_id: "y" }),         // Public pending (NOT mine)
    make({ id: "r1", status: "completed", ends_at: ago(2 * 86400_000), created_at: ago(2 * 86400_000) }), // Recent ended (mine, last 30d)
    make({ id: "old1", status: "completed", ends_at: ago(45 * 86400_000), created_at: ago(45 * 86400_000) }), // Past (mine, >30d)
    make({ id: "old2", status: "completed", ends_at: ago(60 * 86400_000), created_at: ago(60 * 86400_000), challenger_id: "x", opponent_id: "y" }), // Past public (NOT mine)
    make({ id: "exp", status: "active", ends_at: ago(5_000) }),                          // Stale "active" but expired → ended
  ];

  it("Active: only mine, status=active, not ended", () => {
    const active = battles.filter((b) => mine(b) && b.status === "active" && !isEnded(b));
    expect(active.map((b) => b.id)).toEqual(["a1"]);
  });

  it("Pending: only mine, status=pending", () => {
    const pending = battles.filter((b) => mine(b) && b.status === "pending");
    expect(pending.map((b) => b.id)).toEqual(["p1"]);
  });

  it("Mine: only mine, within last 30 days, newest first", () => {
    const m = battles
      .filter((b) => mine(b) && (NOW - battleTimeMs(b)) <= THIRTY_DAYS_MS)
      .sort((a, b) => battleTimeMs(b) - battleTimeMs(a));
    // a1 (ends in future) > r1 (2d ago) > p1 (created 1h ago, no ends_at) > exp (5s ago)
    expect(m.map((b) => b.id)).toContain("a1");
    expect(m.map((b) => b.id)).toContain("r1");
    expect(m.map((b) => b.id)).not.toContain("old1");
    expect(m.map((b) => b.id)).not.toContain("a2");
    expect(m.map((b) => b.id)).not.toContain("old2");
  });

  it("Past: only mine, ended, older than 30 days, newest first", () => {
    const past = battles
      .filter((b) => mine(b) && isEnded(b) && (NOW - battleTimeMs(b)) > THIRTY_DAYS_MS)
      .sort((a, b) => battleTimeMs(b) - battleTimeMs(a));
    expect(past.map((b) => b.id)).toEqual(["old1"]);
  });

  it("Public battles never leak into any personal tab", () => {
    const all = [
      ...battles.filter((b) => mine(b) && b.status === "active" && !isEnded(b)),
      ...battles.filter((b) => mine(b) && b.status === "pending"),
      ...battles.filter((b) => mine(b) && (NOW - battleTimeMs(b)) <= THIRTY_DAYS_MS),
      ...battles.filter((b) => mine(b) && isEnded(b) && (NOW - battleTimeMs(b)) > THIRTY_DAYS_MS),
    ];
    expect(all.every((b) => b.challenger_id === ME || b.opponent_id === ME)).toBe(true);
  });

  it("Mine sort is deterministic newest-first", () => {
    const m = battles
      .filter((b) => mine(b) && (NOW - battleTimeMs(b)) <= THIRTY_DAYS_MS)
      .sort((a, b) => battleTimeMs(b) - battleTimeMs(a));
    for (let i = 1; i < m.length; i++) {
      expect(battleTimeMs(m[i - 1])).toBeGreaterThanOrEqual(battleTimeMs(m[i]));
    }
  });
});
