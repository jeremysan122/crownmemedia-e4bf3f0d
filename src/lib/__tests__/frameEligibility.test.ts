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

  it("crown-prestige unlocks at exactly 500 crowns, not 499", () => {
    expect(eligibleFrames({ ...base, crowns: 499 })).not.toContain("crown-prestige");
    expect(eligibleFrames({ ...base, crowns: 500 })).toContain("crown-prestige");
  });

  it("stacks lower crown tiers as totals climb", () => {
    const stats = { ...base, crowns: 7500 };
    const got = eligibleFrames(stats);
    expect(got).toContain("crown-prestige");
    expect(got).toContain("diamond-royal");
    expect(got).not.toContain("royal-sovereign");
  });

  it("royal-sovereign requires 50,000 crowns", () => {
    expect(eligibleFrames({ ...base, crowns: 49999 })).not.toContain("royal-sovereign");
    expect(eligibleFrames({ ...base, crowns: 50000 })).toContain("royal-sovereign");
  });

  it("battle-win frames use 250 / 1,000 thresholds", () => {
    expect(eligibleFrames({ ...base, battles_won: 249 })).not.toContain("golden-majesty");
    expect(eligibleFrames({ ...base, battles_won: 250 })).toContain("golden-majesty");
    expect(eligibleFrames({ ...base, battles_won: 999 })).not.toContain("royal-laurel");
    expect(eligibleFrames({ ...base, battles_won: 1000 })).toContain("royal-laurel");
  });

  it("midnight-royal requires a 365-day streak", () => {
    expect(eligibleFrames({ ...base, longest_streak: 364 })).not.toContain("midnight-royal");
    expect(eligibleFrames({ ...base, longest_streak: 365 })).toContain("midnight-royal");
  });

  it("royal-shield requires 500 shields used", () => {
    expect(eligibleFrames({ ...base, shields_used: 499 })).not.toContain("royal-shield");
    expect(eligibleFrames({ ...base, shields_used: 500 })).toContain("royal-shield");
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
      crowns: 100000, battles_won: 2500, longest_streak: 400,
      shields_used: 800, is_royal: true, is_founder: true,
    };
    expect(eligibleFrames(stats).sort()).toEqual([
      "crown-prestige","diamond-royal","golden-majesty","imperial-glow",
      "midnight-royal","royal-laurel","royal-purple","royal-shield","royal-sovereign",
    ]);
  });
});
