import { describe, it, expect } from "vitest";
import { participantLabel, highlightErrorMessage } from "@/lib/battleHighlight";

describe("battleHighlight helpers", () => {
  it("participantLabel prefers display_name, falls back to username, then fallback", () => {
    expect(participantLabel({ id: "1", username: "u", display_name: "Alice", avatar_url: null }, "Host")).toBe("Alice");
    expect(participantLabel({ id: "1", username: "u", display_name: null, avatar_url: null }, "Host")).toBe("u");
    expect(participantLabel({ id: "1", username: null, display_name: "  ", avatar_url: null }, "Host")).toBe("Host");
    expect(participantLabel(null, "Opponent")).toBe("Opponent");
  });

  it("highlightErrorMessage maps known server errors", () => {
    expect(highlightErrorMessage({ message: "not_authenticated" })).toMatch(/sign in/i);
    expect(highlightErrorMessage({ message: "battle_not_found" })).toMatch(/no longer exists/i);
    expect(highlightErrorMessage({ message: "not_authorized" })).toMatch(/own analytics/i);
    expect(highlightErrorMessage({ message: "boom" }, "fallback msg")).toBe("fallback msg");
  });
});
