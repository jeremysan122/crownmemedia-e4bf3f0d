import { describe, it, expect } from "vitest";
import {
  deriveBattleStatus,
  canVoteOnBattle,
  isSafeBattleForList,
  resolveBattleWinner,
  votePercentages,
  nextBattlesCursor,
  mergeDedupBattles,
  type BattleLike,
} from "@/lib/battlesLogic";

const NOW = Date.parse("2026-06-11T12:00:00Z");
const FUTURE = "2026-06-11T13:00:00Z";
const PAST = "2026-06-11T11:00:00Z";

const base: BattleLike = {
  id: "b1",
  status: "active",
  ends_at: FUTURE,
  challenger_id: "c",
  opponent_id: "o",
  challenger_votes: 0,
  opponent_votes: 0,
  created_at: "2026-06-10T00:00:00Z",
};

describe("deriveBattleStatus", () => {
  it("pending → upcoming", () => {
    expect(deriveBattleStatus({ ...base, status: "pending" }, NOW)).toBe("upcoming");
  });
  it("active with future ends_at → live", () => {
    expect(deriveBattleStatus({ ...base, status: "active", ends_at: FUTURE }, NOW)).toBe("live");
  });
  it("active with past ends_at → ended (server time drifted)", () => {
    expect(deriveBattleStatus({ ...base, status: "active", ends_at: PAST }, NOW)).toBe("ended");
  });
  it("completed/declined/cancelled → ended", () => {
    expect(deriveBattleStatus({ ...base, status: "completed" }, NOW)).toBe("ended");
    expect(deriveBattleStatus({ ...base, status: "declined" }, NOW)).toBe("ended");
    expect(deriveBattleStatus({ ...base, status: "cancelled" }, NOW)).toBe("ended");
  });
});

describe("canVoteOnBattle", () => {
  it("rejects anonymous viewers", () => {
    expect(canVoteOnBattle(base, { viewerId: null, alreadyVoted: false, nowMs: NOW })).toBe(false);
  });
  it("rejects when already voted (frontend mirror of UNIQUE constraint)", () => {
    expect(canVoteOnBattle(base, { viewerId: "v", alreadyVoted: true, nowMs: NOW })).toBe(false);
  });
  it("rejects participants voting on their own battle", () => {
    expect(canVoteOnBattle(base, { viewerId: "c", alreadyVoted: false, nowMs: NOW })).toBe(false);
    expect(canVoteOnBattle(base, { viewerId: "o", alreadyVoted: false, nowMs: NOW })).toBe(false);
  });
  it("rejects voting on upcoming battles", () => {
    expect(canVoteOnBattle({ ...base, status: "pending" }, { viewerId: "v", alreadyVoted: false, nowMs: NOW })).toBe(false);
  });
  it("rejects voting on ended battles (even if status=active but ends_at passed)", () => {
    expect(canVoteOnBattle({ ...base, ends_at: PAST }, { viewerId: "v", alreadyVoted: false, nowMs: NOW })).toBe(false);
    expect(canVoteOnBattle({ ...base, status: "completed" }, { viewerId: "v", alreadyVoted: false, nowMs: NOW })).toBe(false);
  });
  it("accepts an eligible viewer on a live battle", () => {
    expect(canVoteOnBattle(base, { viewerId: "v", alreadyVoted: false, nowMs: NOW })).toBe(true);
  });
});

describe("isSafeBattleForList", () => {
  const ctx = { blockedIds: new Set(["blocked"]) };
  it("rejects removed/hidden/declined/cancelled battles", () => {
    expect(isSafeBattleForList({ ...base, is_removed: true }, ctx)).toBe(false);
    expect(isSafeBattleForList({ ...base, is_hidden: true }, ctx)).toBe(false);
    expect(isSafeBattleForList({ ...base, status: "declined" }, ctx)).toBe(false);
    expect(isSafeBattleForList({ ...base, status: "cancelled" }, ctx)).toBe(false);
  });
  it("rejects battles involving blocked participants on either side", () => {
    expect(isSafeBattleForList({ ...base, challenger_id: "blocked" }, ctx)).toBe(false);
    expect(isSafeBattleForList({ ...base, opponent_id: "blocked" }, ctx)).toBe(false);
  });
  it("accepts a clean live battle", () => {
    expect(isSafeBattleForList(base, ctx)).toBe(true);
  });
});

describe("resolveBattleWinner", () => {
  const ended = { ...base, status: "completed" };
  const both = { challenger: { id: "c" }, opponent: { id: "o" } };

  it("returns pending for non-ended battles", () => {
    expect(resolveBattleWinner(base, both, NOW)).toEqual({ kind: "pending" });
  });
  it("returns none when no votes were cast", () => {
    expect(resolveBattleWinner(ended, both, NOW)).toEqual({ kind: "none" });
  });
  it("returns tie when totals match and both sides are usable", () => {
    const r = resolveBattleWinner({ ...ended, challenger_votes: 3, opponent_votes: 3 }, both, NOW);
    expect(r).toEqual({ kind: "tie", votes: 3 });
  });
  it("returns the higher-vote side as winner", () => {
    const r = resolveBattleWinner({ ...ended, challenger_votes: 7, opponent_votes: 4 }, both, NOW);
    expect(r).toMatchObject({ kind: "winner", winnerId: "c", loserId: "o", winnerVotes: 7, loserVotes: 4 });
  });
  it("never displays a banned/suspended/deleted/moderated user as winner", () => {
    const r = resolveBattleWinner(
      { ...ended, challenger_votes: 9, opponent_votes: 4 },
      { challenger: { id: "c", is_banned: true }, opponent: { id: "o" } },
      NOW,
    );
    // Challenger had more votes but is now banned — fall back to opponent.
    expect(r).toMatchObject({ kind: "winner", winnerId: "o" });
  });
  it("returns none when the only usable side has zero votes", () => {
    const r = resolveBattleWinner(
      { ...ended, challenger_votes: 9, opponent_votes: 0 },
      { challenger: { id: "c", is_deleted: true }, opponent: { id: "o" } },
      NOW,
    );
    expect(r).toEqual({ kind: "none" });
  });
  it("returns none when both participants are unusable", () => {
    const r = resolveBattleWinner(
      { ...ended, challenger_votes: 5, opponent_votes: 2 },
      { challenger: { id: "c", is_banned: true }, opponent: { id: "o", moderation_status: "removed" } },
      NOW,
    );
    expect(r).toEqual({ kind: "none" });
  });
});

describe("votePercentages", () => {
  it("returns 50/50 with no votes", () => {
    expect(votePercentages(base)).toEqual({ challenger: 50, opponent: 50 });
  });
  it("computes percentages from totals", () => {
    const { challenger, opponent } = votePercentages({ ...base, challenger_votes: 30, opponent_votes: 70 });
    expect(challenger).toBeCloseTo(30, 5);
    expect(opponent).toBeCloseTo(70, 5);
  });
});

describe("cursor pagination", () => {
  const rows = (n: number): BattleLike[] =>
    Array.from({ length: n }, (_, i) => ({ ...base, id: `b${i}`, created_at: `2026-06-${10 - i}T00:00:00Z` }));

  it("nextBattlesCursor returns null when the page is not full", () => {
    expect(nextBattlesCursor(rows(2), "live", 10)).toBeNull();
  });
  it("nextBattlesCursor encodes (createdAt, id) of last row when full", () => {
    const r = rows(3);
    expect(nextBattlesCursor(r, "live", 3)).toEqual({
      bucket: "live",
      createdAt: r[2].created_at,
      id: r[2].id,
    });
  });

  it("mergeDedupBattles preserves order and drops duplicates", () => {
    const a = [{ ...base, id: "1" }, { ...base, id: "2" }];
    const b = [{ ...base, id: "2" }, { ...base, id: "3" }];
    const { merged, dropped } = mergeDedupBattles(a, b);
    expect(merged.map((m) => m.id)).toEqual(["1", "2", "3"]);
    expect(dropped).toBe(1);
  });

  it("mergeDedupBattles is idempotent on retry (same page applied twice)", () => {
    const page = [{ ...base, id: "1" }, { ...base, id: "2" }];
    const first = mergeDedupBattles([], page);
    const second = mergeDedupBattles(first.merged, page);
    expect(second.merged.map((m) => m.id)).toEqual(["1", "2"]);
    expect(second.dropped).toBe(2);
  });
});
