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
    posts: { pass: false, label: "Posts", current: 2, required: 25 },
    battles_won: { pass: false, label: "Battles won", current: 4, required: 25 },
    crowns_held: { pass: false, label: "Crowns", current: 1, required: 10 },
    votes_received: { pass: false, label: "Votes", current: 12345, required: 50000 },
    good_standing: { pass: true, label: "Good standing" },
    no_serious_violations: { pass: true, label: "No serious violations" },
    email_verified: { pass: true, label: "Email verified" },
  },
};

describe("verificationEligibility helpers", () => {
  it("renders checks in a stable order and omits optional phone_verified when missing", () => {
    const keys = orderedChecks(sample).map((c) => c.key);
    expect(keys).toEqual([
      "followers",
      "profile_photo",
      "bio",
      "account_age",
      "posts",
      "battles_won",
      "crowns_held",
      "votes_received",
      "good_standing",
      "no_serious_violations",
      "email_verified",
    ]);
  });

  it("includes phone_verified row when the server returns it (platform requires phone)", () => {
    const withPhone: EligibilityProgress = {
      ...sample,
      checks: { ...sample.checks, phone_verified: { pass: false, label: "Phone verified" } },
    };
    const keys = orderedChecks(withPhone).map((c) => c.key);
    expect(keys).toContain("phone_verified");
    expect(keys[keys.length - 1]).toBe("phone_verified");
  });

  it("computes numeric fractions and clamps them to [0,1]", () => {
    expect(checkFraction({ pass: false, label: "x", current: 2500, required: 10000 })).toBeCloseTo(0.25);
    expect(checkFraction({ pass: false, label: "x", current: 12500, required: 50000 })).toBeCloseTo(0.25);
    expect(checkFraction({ pass: true, label: "x", current: 90, required: 30 })).toBe(1);
    expect(checkFraction({ pass: false, label: "x", current: -5, required: 10 })).toBe(0);
  });

  it("returns 0/1 for boolean-only checks", () => {
    expect(checkFraction({ pass: true, label: "x" })).toBe(1);
    expect(checkFraction({ pass: false, label: "x" })).toBe(0);
  });

  it("counts how many checks pass (does not count optional phone row when absent)", () => {
    expect(passedCount(sample)).toEqual({ passed: 6, total: 11 });
  });

  it("handles a missing required check key by treating it as a failed boolean row", () => {
    const broken = { ...sample, checks: { ...sample.checks } } as EligibilityProgress;
    delete broken.checks.bio;
    const rows = orderedChecks(broken);
    expect(rows.find((r) => r.key === "bio")?.pass).toBe(false);
  });
});
