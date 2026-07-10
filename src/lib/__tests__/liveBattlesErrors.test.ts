import { describe, it, expect } from "vitest";
import { liveBattleErrorMessage } from "@/lib/liveBattles";

describe("liveBattleErrorMessage", () => {
  it("maps known server codes to friendly copy", () => {
    expect(liveBattleErrorMessage({ message: "battle_not_found" }, "x")).toMatch(/no longer available/i);
    expect(liveBattleErrorMessage({ message: "battle_not_live" }, "x")).toMatch(/isn't live/i);
    expect(liveBattleErrorMessage({ message: "already_voted" }, "x")).toMatch(/already voted/i);
    expect(liveBattleErrorMessage({ message: "participants_cannot_vote" }, "x")).toMatch(/can't vote/i);
    expect(liveBattleErrorMessage({ message: "not_authorized" }, "x")).toMatch(/can't do that/i);
    expect(liveBattleErrorMessage({ message: "rate limit exceeded" }, "x")).toMatch(/too fast/i);
  });
  it("falls back to fallback for unknowns", () => {
    expect(liveBattleErrorMessage({ message: "boom" }, "fallback msg")).toBe("fallback msg");
    expect(liveBattleErrorMessage(null, "fallback msg")).toBe("fallback msg");
  });
});
