import { describe, it, expect } from "vitest";
import { rankTitle, rankBadgeLabel, type GenderValue } from "@/lib/rankTitle";

describe("rankTitle", () => {
  it("crowns the #1 male as King", () => {
    expect(rankTitle("male", 1)).toBe("King");
  });
  it("crowns the #1 female as Queen", () => {
    expect(rankTitle("female", 1)).toBe("Queen");
  });
  it("non-binary #1 → King, #2 → Queen", () => {
    expect(rankTitle("non_binary", 1)).toBe("King");
    expect(rankTitle("non_binary", 2)).toBe("Queen");
    expect(rankTitle("non_binary", 3)).toBeNull();
  });
  it("returns null for ranks 2-100 for male/female (except non-binary #2)", () => {
    for (const rank of [2, 3, 10, 50, 99, 100]) {
      expect(rankTitle("male", rank)).toBeNull();
      expect(rankTitle("female", rank)).toBeNull();
    }
  });
  it("returns null for unknown / null gender", () => {
    const others: GenderValue[] = [null, undefined, "prefer_not_to_say"];
    for (const g of others) {
      expect(rankTitle(g, 1)).toBeNull();
      expect(rankTitle(g, 2)).toBeNull();
    }
  });
});

describe("rankBadgeLabel", () => {
  it("uses King/Queen for the right top holder", () => {
    expect(rankBadgeLabel("male", 1)).toBe("King");
    expect(rankBadgeLabel("female", 1)).toBe("Queen");
    expect(rankBadgeLabel("non_binary", 1)).toBe("King");
    expect(rankBadgeLabel("non_binary", 2)).toBe("Queen");
  });

  it("renders correct ordinals 1st through 100th for male/female non-#1", () => {
    const expected: Record<number, string> = {
      1: "1st", 2: "2nd", 3: "3rd", 4: "4th",
      11: "11th", 12: "12th", 13: "13th",
      21: "21st", 22: "22nd", 23: "23rd",
      52: "52nd", 73: "73rd", 100: "100th",
    };
    // Male: #1 is King, others ordinal
    expect(rankBadgeLabel("male", 1)).toBe("King");
    expect(rankBadgeLabel("female", 1)).toBe("Queen");
    for (const [rankStr, label] of Object.entries(expected)) {
      const rank = Number(rankStr);
      if (rank === 1) continue;
      expect(rankBadgeLabel("male", rank)).toBe(label);
      expect(rankBadgeLabel("female", rank)).toBe(label);
    }
  });

  it("renders ordinals for non-binary at rank 3+", () => {
    expect(rankBadgeLabel("non_binary", 3)).toBe("3rd");
    expect(rankBadgeLabel("non_binary", 11)).toBe("11th");
    expect(rankBadgeLabel("non_binary", 100)).toBe("100th");
  });

  it("falls back to ordinal for null/unknown gender (never King/Queen)", () => {
    const others: GenderValue[] = [null, undefined, "prefer_not_to_say"];
    for (const g of others) {
      expect(rankBadgeLabel(g, 1)).toBe("1st");
      expect(rankBadgeLabel(g, 2)).toBe("2nd");
      expect(rankBadgeLabel(g, 3)).toBe("3rd");
      expect(rankBadgeLabel(g, 21)).toBe("21st");
      expect(rankBadgeLabel(g, 100)).toBe("100th");
    }
  });

  it("produces a label for every rank 1-100 with correct ordinal suffix", () => {
    for (let r = 1; r <= 100; r++) {
      const label = rankBadgeLabel(null, r);
      const mod100 = r % 100;
      const teens = mod100 >= 11 && mod100 <= 13;
      const suffix = teens
        ? "th"
        : r % 10 === 1 ? "st"
        : r % 10 === 2 ? "nd"
        : r % 10 === 3 ? "rd"
        : "th";
      expect(label).toBe(`${r}${suffix}`);
    }
  });
});
