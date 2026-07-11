import { describe, it, expect } from "vitest";
import { commentHiddenReason } from "@/lib/commentHiddenReason";

const safety = (blocked: string[], muted: string[]) => ({
  isBlocked: (id: string | null | undefined) => !!id && blocked.includes(id),
  matchesMutedWord: (b: string | null | undefined) =>
    !!b && muted.some((w) => b.toLowerCase().includes(w)),
});

describe("commentHiddenReason", () => {
  it("moderator hide wins over everything", () => {
    expect(
      commentHiddenReason(
        { user_id: "u1", body: "spoiler", hidden_at: "2024-01-01" },
        safety(["u1"], ["spoiler"]),
        ["spoiler"],
      ),
    ).toBe("moderator");
  });
  it("keyword filter beats blocked/muted", () => {
    expect(
      commentHiddenReason(
        { user_id: "u1", body: "banword" },
        safety(["u1"], ["banword"]),
        ["banword"],
      ),
    ).toBe("keyword");
  });
  it("blocked user rows report reason=blocked", () => {
    expect(
      commentHiddenReason({ user_id: "u1", body: "hi" }, safety(["u1"], []), []),
    ).toBe("blocked");
  });
  it("muted word rows report reason=muted-word", () => {
    expect(
      commentHiddenReason({ user_id: "u2", body: "SPOILER incoming" }, safety([], ["spoiler"]), []),
    ).toBe("muted-word");
  });
  it("clean rows return empty reason", () => {
    expect(
      commentHiddenReason({ user_id: "u2", body: "hello" }, safety([], []), []),
    ).toBe("");
  });
});
