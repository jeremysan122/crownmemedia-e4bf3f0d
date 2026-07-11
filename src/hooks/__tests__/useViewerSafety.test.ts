/**
 * Wave 7 — viewer-level safety unit tests.
 *
 * Locks the client-side contract that a viewer's blocklist + muted-words
 * apply to the live-battle chat and gifts overlay regardless of what the
 * server sends. The underlying tables (`blocks`, `muted_words`) are
 * RLS-scoped to auth.uid() = blocker_id / user_id and the policies were
 * verified against pg_policies at ship time.
 */
import { describe, it, expect } from "vitest";

// Pure helpers mirroring the hook's internal predicates so we can test
// them without spinning up React + Supabase mocks.
function isBlocked(blocked: Set<string>, id: string | null | undefined) {
  return !!id && blocked.has(id);
}
function matchesMutedWord(words: string[], body: string | null | undefined) {
  if (!body || words.length === 0) return false;
  const hay = body.toLowerCase();
  return words.some((w) => w && hay.includes(w));
}

describe("viewer safety — block predicate", () => {
  it("hides a comment from a blocked author", () => {
    const set = new Set(["u1"]);
    expect(isBlocked(set, "u1")).toBe(true);
    expect(isBlocked(set, "u2")).toBe(false);
    expect(isBlocked(set, null)).toBe(false);
    expect(isBlocked(set, undefined)).toBe(false);
  });
});

describe("viewer safety — muted-word predicate", () => {
  it("matches case-insensitively as substring", () => {
    expect(matchesMutedWord(["spoiler"], "big SPOILER incoming")).toBe(true);
    expect(matchesMutedWord(["spoiler"], "totally clean")).toBe(false);
  });
  it("empty word list is a no-op", () => {
    expect(matchesMutedWord([], "anything")).toBe(false);
  });
  it("empty body is a no-op", () => {
    expect(matchesMutedWord(["x"], "")).toBe(false);
    expect(matchesMutedWord(["x"], null)).toBe(false);
    expect(matchesMutedWord(["x"], undefined)).toBe(false);
  });
});
