import { describe, it, expect } from "vitest";
import {
  computeAcceptedEndsAtMs,
  canVoteOnBattle,
  isSafeBattleForList,
  deriveBattleStatus,
  BATTLE_DURATION_DEFAULT_SEC,
  BATTLE_DURATION_MIN_SEC,
  BATTLE_DURATION_MAX_SEC,
  type BattleLike,
} from "../battlesLogic";

const battle = (over: Partial<BattleLike> = {}): BattleLike => ({
  id: "b1",
  status: "active",
  ends_at: new Date(Date.now() + 60_000).toISOString(),
  challenger_id: "c",
  opponent_id: "o",
  challenger_votes: 0,
  opponent_votes: 0,
  ...over,
});

describe("computeAcceptedEndsAtMs (delayed accept timing)", () => {
  it("uses the full intended duration from accept time, ignoring pending delay", () => {
    const acceptedAt = 1_000_000;
    const ends = computeAcceptedEndsAtMs(3600, acceptedAt);
    expect(ends).toBe(acceptedAt + 3600 * 1000);
  });

  it("falls back to 24h when duration is missing (legacy pending battles)", () => {
    const acceptedAt = 2_000_000;
    const ends = computeAcceptedEndsAtMs(null, acceptedAt);
    expect(ends).toBe(acceptedAt + BATTLE_DURATION_DEFAULT_SEC * 1000);
  });

  it("clamps stale/malformed durations to the server-enforced range", () => {
    const acceptedAt = 3_000_000;
    expect(computeAcceptedEndsAtMs(1, acceptedAt))
      .toBe(acceptedAt + BATTLE_DURATION_MIN_SEC * 1000);
    expect(computeAcceptedEndsAtMs(9_999_999, acceptedAt))
      .toBe(acceptedAt + BATTLE_DURATION_MAX_SEC * 1000);
  });
});

describe("canVoteOnBattle guards", () => {
  it("blocks participants voting in their own battle", () => {
    const b = battle();
    expect(canVoteOnBattle(b, { viewerId: "c", alreadyVoted: false })).toBe(false);
    expect(canVoteOnBattle(b, { viewerId: "o", alreadyVoted: false })).toBe(false);
  });
  it("blocks duplicate votes", () => {
    expect(canVoteOnBattle(battle(), { viewerId: "v", alreadyVoted: true })).toBe(false);
  });
  it("blocks votes on ended (past ends_at) active battles", () => {
    const b = battle({ ends_at: new Date(Date.now() - 60_000).toISOString() });
    expect(canVoteOnBattle(b, { viewerId: "v", alreadyVoted: false })).toBe(false);
  });
  it("allows non-participants to vote on live battles", () => {
    expect(canVoteOnBattle(battle(), { viewerId: "v", alreadyVoted: false })).toBe(true);
  });
});

describe("isSafeBattleForList", () => {
  it("hides battles involving blocked users (either direction)", () => {
    const ctx = { blockedIds: new Set(["o"]) };
    expect(isSafeBattleForList(battle(), ctx)).toBe(false);
  });
  it("hides removed/hidden/declined/cancelled rows", () => {
    const ctx = { blockedIds: new Set<string>() };
    expect(isSafeBattleForList(battle({ is_removed: true }), ctx)).toBe(false);
    expect(isSafeBattleForList(battle({ is_hidden: true }), ctx)).toBe(false);
    expect(isSafeBattleForList(battle({ status: "declined" }), ctx)).toBe(false);
    expect(isSafeBattleForList(battle({ status: "cancelled" }), ctx)).toBe(false);
  });
});

describe("deriveBattleStatus stale-active handling", () => {
  it("treats active-with-past-ends_at as ended (refuses votes)", () => {
    const b = battle({ ends_at: new Date(Date.now() - 1000).toISOString() });
    expect(deriveBattleStatus(b)).toBe("ended");
  });
});
