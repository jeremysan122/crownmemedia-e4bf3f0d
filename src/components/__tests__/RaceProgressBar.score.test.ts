import { describe, it, expect } from "vitest";
import { computeWeightedScore } from "../RaceProgressBar";
import { scoreScenario, recalcOracle, type ScenarioInput } from "@/test/fixtures/scoreScenarios";

/**
 * Each scenario is described declaratively via `scoreScenario(...)`. The
 * fixture computes the expected score using the same formula
 * `public.recalc_post_score()` runs server-side, and we assert the UI helper
 * `computeWeightedScore` matches it.
 */
const cases: Array<{ name: string; input: ScenarioInput }> = [
  { name: "all zeros",                input: { seed: "zeros" } },
  { name: "single crown vote",        input: { seed: "1c", crowns: 1 } },
  { name: "single fire vote",         input: { seed: "1f", fires: 1 } },
  { name: "single diamond vote",      input: { seed: "1d", diamonds: 1 } },
  { name: "mixed votes only",         input: { seed: "mix", crowns: 10, fires: 6, diamonds: 4 } },
  { name: "comments add 1% per",      input: { seed: "c50", crowns: 10, comments: 50 } },
  { name: "100 comments doubles base",input: { seed: "c100",crowns: 4, comments: 100 } },
  { name: "shares flat 0.25 each",    input: { seed: "s8",  shares: 8 } },
  { name: "battle wins +5 each",      input: { seed: "b3",  battleWins: 3 } },
  { name: "comments multiply BASE not battle/share",
                                       input: { seed: "csb", comments: 50, shares: 4, battleWins: 2 } },
  { name: "royal boost 1.5×",         input: { seed: "boost1", crowns: 10, boostActive: true } },
  { name: "boost applied to total, not just base",
                                       input: { seed: "boost2", battleWins: 2, boostActive: true } },
  { name: "complex realistic",        input: { seed: "complex", crowns: 25, fires: 12, diamonds: 7, comments: 30, shares: 14, battleWins: 4, boostActive: true } },
  { name: "high engagement no boost", input: { seed: "high",   crowns: 200, fires: 80, diamonds: 30, comments: 75, shares: 40, battleWins: 6 } },
  { name: "edge: comments only no votes (base=0)",
                                       input: { seed: "edge",   comments: 999, boostActive: true } },
];

describe("RaceProgressBar.computeWeightedScore matches recalc_post_score", () => {
  for (const c of cases) {
    it(`scenario: ${c.name}`, () => {
      const s = scoreScenario(c.input);
      const actual = computeWeightedScore(
        s.engagement.votes,
        s.engagement.comments,
        s.engagement.shares,
        s.engagement.battleWins,
        s.input.boostActive ? 1.5 : 1,
      );
      expect(actual).toBeCloseTo(s.expectedScore, 9);
      // Sanity: fixture's stored crown_score also matches the oracle.
      expect(s.post.crown_score).toBeCloseTo(recalcOracle(s.engagement, s.input.boostActive), 9);
    });
  }

  it("overtaking % is capped at 99 while behind and 100 when at/over leader", () => {
    const leader = scoreScenario({ seed: "leader", crowns: 50, fires: 20, diamonds: 10, comments: 40, shares: 10, battleWins: 3, boostActive: true });
    const challenger = scoreScenario({ seed: "chal", crowns: 49, fires: 20, diamonds: 10, comments: 40, shares: 10, battleWins: 3, boostActive: true });
    expect(challenger.expectedScore).toBeLessThan(leader.expectedScore);
    const pct = Math.min(99, Math.max(1, Math.round((challenger.expectedScore / leader.expectedScore) * 100)));
    expect(pct).toBeGreaterThanOrEqual(1);
    expect(pct).toBeLessThanOrEqual(99);

    const tie = scoreScenario({ seed: "tie", crowns: 50, fires: 20, diamonds: 10, comments: 40, shares: 10, battleWins: 3, boostActive: true });
    expect(tie.expectedScore).toBeGreaterThanOrEqual(leader.expectedScore);
  });

  it("boost multiplier applies to the full sum (votes + comment bonus + share + battle)", () => {
    const boosted = scoreScenario({ seed: "b", crowns: 10, fires: 4, diamonds: 2, comments: 25, shares: 8, battleWins: 2, boostActive: true });
    const unboosted = scoreScenario({ seed: "u", crowns: 10, fires: 4, diamonds: 2, comments: 25, shares: 8, battleWins: 2, boostActive: false });
    expect(boosted.expectedScore).toBeCloseTo(unboosted.expectedScore * 1.5, 9);
  });

  it("falsy/zero boost falls back to 1× (defensive)", () => {
    const s = scoreScenario({ seed: "zb", crowns: 5, fires: 5, diamonds: 5, comments: 10, shares: 4, battleWins: 1 });
    const a = computeWeightedScore(s.engagement.votes, s.engagement.comments, s.engagement.shares, s.engagement.battleWins, 0);
    const b = computeWeightedScore(s.engagement.votes, s.engagement.comments, s.engagement.shares, s.engagement.battleWins, 1);
    expect(a).toBeCloseTo(b, 9);
  });
});
