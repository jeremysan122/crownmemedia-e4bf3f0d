import { describe, it, expect } from "vitest";
import {
  checkFraction,
  orderedChecks,
  passedCount,
  type EligibilityProgress,
} from "@/lib/verificationEligibility";

const sample: EligibilityProgress = {
  verified: false,
  eligible: false,
  checks: {
    followers: { pass: false, label: "10k followers", current: 2500, required: 10000 },
    profile_photo: { pass: true, label: "Profile photo" },
    bio: { pass: true, label: "Bio" },
    account_age: { pass: true, label: "Account age", current: 90, required: 30 },
    posts: { pass: false, label: "Posts", current: 2, required: 5 },
    good_standing: { pass: true, label: "Good standing" },
  },
};

describe("verificationEligibility helpers", () => {
  it("renders checks in a stable order", () => {
    const keys = orderedChecks(sample).map((c) => c.key);
    expect(keys).toEqual([
      "followers",
      "profile_photo",
      "bio",
      "account_age",
      "posts",
      "good_standing",
    ]);
  });

  it("computes numeric fractions and clamps them to [0,1]", () => {
    expect(checkFraction({ pass: false, label: "x", current: 2500, required: 10000 })).toBeCloseTo(0.25);
    // Overshoot still clamps to 1 — used for account-age past 30 days.
    expect(checkFraction({ pass: true, label: "x", current: 90, required: 30 })).toBe(1);
    expect(checkFraction({ pass: false, label: "x", current: -5, required: 10 })).toBe(0);
  });

  it("returns 0/1 for boolean-only checks", () => {
    expect(checkFraction({ pass: true, label: "x" })).toBe(1);
    expect(checkFraction({ pass: false, label: "x" })).toBe(0);
  });

  it("counts how many checks pass", () => {
    expect(passedCount(sample)).toEqual({ passed: 4, total: 6 });
  });

  it("handles a missing check key by treating it as a failed boolean row", () => {
    const broken = { ...sample, checks: { ...sample.checks } } as any;
    delete broken.checks.bio;
    const rows = orderedChecks(broken);
    expect(rows.find((r) => r.key === "bio")?.pass).toBe(false);
  });
});
