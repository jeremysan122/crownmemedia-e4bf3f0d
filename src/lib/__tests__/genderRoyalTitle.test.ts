import { describe, it, expect } from "vitest";
import { rankTitle } from "@/lib/rankTitle";

// Quick sanity check that the gender field a user picks in EditProfile
// still maps to the expected King / Queen royal title shown on Profile.
describe("gender → royal title", () => {
  it("male #1 becomes King", () => {
    expect(rankTitle("male", 1)).toBe("King");
  });

  it("female #1 becomes Queen", () => {
    expect(rankTitle("female", 1)).toBe("Queen");
  });

  it("prefer_not_to_say never receives a royal title", () => {
    expect(rankTitle("prefer_not_to_say", 1)).toBeNull();
    expect(rankTitle("prefer_not_to_say", 2)).toBeNull();
  });

  it("non-binary maps to King for #1 and Queen for #2", () => {
    expect(rankTitle("non_binary", 1)).toBe("King");
    expect(rankTitle("non_binary", 2)).toBe("Queen");
  });
});
