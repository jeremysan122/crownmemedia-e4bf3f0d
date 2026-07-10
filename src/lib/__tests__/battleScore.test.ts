// Unit coverage for the weighted-score helper. These tests protect the
// invariant the leaderboard depends on: adding more positive activity
// (votes, battle wins, gift shekels) must never LOWER the displayed
// weighted score. Also pin down the arithmetic for known edge cases.

import { describe, it, expect } from "vitest";
import {
  computeWeightedScore,
  battleVoteScoreDelta,
  CROWN_VOTE_WEIGHT,
  FIRE_VOTE_WEIGHT,
  DIAMOND_VOTE_WEIGHT,
  DISLIKE_VOTE_WEIGHT,
  BATTLE_VOTE_WEIGHT,
  BATTLE_WIN_BONUS,
  GIFT_SHEKEL_WEIGHT,
} from "../battleScore";

describe("computeWeightedScore — edge cases", () => {
  it("returns 0 for empty / undefined inputs", () => {
    expect(computeWeightedScore({})).toBe(0);
    expect(computeWeightedScore({ crownVotes: undefined, giftShekels: null as never })).toBe(0);
  });

  it("ignores negative / non-finite inputs (treated as 0)", () => {
    expect(computeWeightedScore({ crownVotes: -5, fireVotes: Number.NaN })).toBe(0);
    expect(computeWeightedScore({ battleVotes: -Infinity })).toBe(0);
  });

  it("never returns a negative score even with heavy dislikes", () => {
    expect(computeWeightedScore({ dislikeVotes: 1_000 })).toBe(0);
    expect(computeWeightedScore({ crownVotes: 1, dislikeVotes: 999 })).toBe(0);
  });

  it("matches the documented weights for a mixed input", () => {
    const s = computeWeightedScore({
      crownVotes: 10,   // 30
      fireVotes: 5,     // 10
      diamondVotes: 2,  // 10
      battleVotes: 3,   // 12
      battleWins: 1,    // 25
      giftShekels: 200, // 20
      dislikeVotes: 2,  // -2
    });
    const expected =
      10 * CROWN_VOTE_WEIGHT +
      5 * FIRE_VOTE_WEIGHT +
      2 * DIAMOND_VOTE_WEIGHT +
      3 * BATTLE_VOTE_WEIGHT +
      1 * BATTLE_WIN_BONUS +
      200 * GIFT_SHEKEL_WEIGHT -
      2 * DISLIKE_VOTE_WEIGHT;
    expect(s).toBe(Math.round(expected * 100) / 100);
  });

  it("rounds to 2 decimal places (gift shekels can be fractional)", () => {
    // 1 shekel * 0.1 weight = 0.1 exact
    expect(computeWeightedScore({ giftShekels: 1 })).toBe(0.1);
    expect(computeWeightedScore({ giftShekels: 33 })).toBe(3.3);
  });
});

describe("computeWeightedScore — monotonicity", () => {
  const base = {
    crownVotes: 4, fireVotes: 2, diamondVotes: 1,
    battleVotes: 3, battleWins: 0, giftShekels: 50, dislikeVotes: 1,
  } as const;
  const baseScore = computeWeightedScore(base);

  const positiveKeys = [
    "crownVotes", "fireVotes", "diamondVotes",
    "battleVotes", "battleWins", "giftShekels",
  ] as const;

  it("adding ANY positive input never lowers the score", () => {
    for (const k of positiveKeys) {
      for (const delta of [1, 5, 100, 10_000]) {
        const next = computeWeightedScore({ ...base, [k]: (base as never)[k] + delta });
        expect(next, `${k}+${delta}`).toBeGreaterThanOrEqual(baseScore);
      }
    }
  });

  it("adding a battle vote strictly increases the score", () => {
    const next = computeWeightedScore({ ...base, battleVotes: base.battleVotes + 1 });
    expect(next).toBeGreaterThan(baseScore);
    expect(next - baseScore).toBeCloseTo(BATTLE_VOTE_WEIGHT, 6);
  });

  it("battle win bonus dominates a single crown vote", () => {
    const win = computeWeightedScore({ ...base, battleWins: 1 });
    const votes = computeWeightedScore({ ...base, crownVotes: base.crownVotes + 1 });
    expect(win).toBeGreaterThan(votes);
  });
});

describe("battleVoteScoreDelta", () => {
  it("returns the per-vote weight for a single vote", () => {
    expect(battleVoteScoreDelta()).toBe(BATTLE_VOTE_WEIGHT);
    expect(battleVoteScoreDelta(1)).toBe(BATTLE_VOTE_WEIGHT);
  });
  it("scales linearly with quantity and never goes negative", () => {
    expect(battleVoteScoreDelta(5)).toBe(5 * BATTLE_VOTE_WEIGHT);
    expect(battleVoteScoreDelta(-3)).toBe(0);
    expect(battleVoteScoreDelta(2.9)).toBe(2 * BATTLE_VOTE_WEIGHT); // floors
  });
});
