import { describe, it, expect } from "vitest";
import { eligibleFrames, type FrameRewardStats } from "@/lib/frameEligibility";

const base: FrameRewardStats = {
  crowns: 0, battles_won: 0, longest_streak: 0, shields_used: 0,
  is_royal: false, is_founder: false,
};

describe("eligibleFrames — matches check_and_award_frames() thresholds", () => {
  it("awards nothing when the user has no achievements", () => {
    expect(eligibleFrames(base)).toEqual([]);
  });

  it("crown-prestige unlocks at exactly 100 crowns, not 99", () => {
    expect(eligibleFrames({ ...base, crowns: 99 })).not.toContain("crown-prestige");
    expect(eligibleFrames({ ...base, crowns: 100 })).toContain("crown-prestige");
  });

  it("stacks lower crown tiers as totals climb", () => {
    const stats = { ...base, crowns: 1500 };
    const got = eligibleFrames(stats);
    expect(got).toContain("crown-prestige");
    expect(got).toContain("diamond-royal");
    expect(got).not.toContain("royal-sovereign");
  });

  it("royal-sovereign requires 10,000 crowns", () => {
    expect(eligibleFrames({ ...base, crowns: 9999 })).not.toContain("royal-sovereign");
    expect(eligibleFrames({ ...base, crowns: 10000 })).toContain("royal-sovereign");
  });

  it("battle-win frames use 100 / 500 thresholds", () => {
    expect(eligibleFrames({ ...base, battles_won: 99 })).not.toContain("golden-majesty");
    expect(eligibleFrames({ ...base, battles_won: 100 })).toContain("golden-majesty");
    expect(eligibleFrames({ ...base, battles_won: 499 })).not.toContain("royal-laurel");
    expect(eligibleFrames({ ...base, battles_won: 500 })).toContain("royal-laurel");
  });

  it("midnight-royal requires a 100-day streak", () => {
    expect(eligibleFrames({ ...base, longest_streak: 99 })).not.toContain("midnight-royal");
    expect(eligibleFrames({ ...base, longest_streak: 100 })).toContain("midnight-royal");
  });

  it("royal-shield requires 100 shields used", () => {
    expect(eligibleFrames({ ...base, shields_used: 100 })).toContain("royal-shield");
  });

  it("royal-purple gates on Royal Pass exclusivity flag", () => {
    expect(eligibleFrames({ ...base, is_royal: false })).not.toContain("royal-purple");
    expect(eligibleFrames({ ...base, is_royal: true })).toContain("royal-purple");
  });

  it("imperial-glow gates on Founder exclusivity flag", () => {
    expect(eligibleFrames({ ...base, is_founder: false })).not.toContain("imperial-glow");
    expect(eligibleFrames({ ...base, is_founder: true })).toContain("imperial-glow");
  });

  it("a max-tier royal founder unlocks all 9 frames", () => {
    const stats: FrameRewardStats = {
      crowns: 25000, battles_won: 1200, longest_streak: 365,
      shields_used: 200, is_royal: true, is_founder: true,
    };
    expect(eligibleFrames(stats).sort()).toEqual([
      "crown-prestige","diamond-royal","golden-majesty","imperial-glow",
      "midnight-royal","royal-laurel","royal-purple","royal-shield","royal-sovereign",
    ]);
  });
});
