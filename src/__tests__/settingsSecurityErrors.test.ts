import { describe, it, expect } from "vitest";
import {
  toFriendlyMessage,
  assertNoRawLeakage,
  LEAKY_PATTERNS_FOR_TESTS,
} from "@/lib/settingsSecurityErrors";

const LEAKY_STRINGS = [
  'permission denied for table "profiles"',
  'new row violates row-level security policy for table "posts"',
  "duplicate key value violates unique constraint",
  "JWT expired",
  "PostgREST error: schema cache not loaded",
  'relation "muted_words" does not exist',
  'column "foo" does not exist',
  "invalid input syntax for type uuid",
];

describe("settingsSecurityErrors — friendly mapper", () => {
  it("never returns raw leaky text in the friendly message", () => {
    for (const raw of LEAKY_STRINGS) {
      for (const ctx of [
        "settings", "privacy", "blocked_load", "blocked_unblock", "muted",
        "restricted", "push_enable", "push_disable", "legal", "export",
        "password", "age", "reset", "login", "signup", "auth", "verification",
        "notifications", "generic",
      ] as const) {
        const out = toFriendlyMessage({ message: raw }, ctx);
        expect(() => assertNoRawLeakage(out)).not.toThrow();
        expect(out.toLowerCase()).not.toContain("permission denied");
        expect(out.toLowerCase()).not.toContain("row-level");
        expect(out.toLowerCase()).not.toContain("jwt");
        expect(out.toLowerCase()).not.toContain("postgrest");
      }
    }
  });

  it("recognizes invalid credentials for login", () => {
    expect(toFriendlyMessage({ message: "Invalid login credentials" }, "login"))
      .toBe("Invalid email or password.");
  });

  it("collapses unknown errors to context-generic copy", () => {
    expect(toFriendlyMessage({ message: "totally novel failure" }, "muted"))
      .toMatch(/muted words/i);
  });

  it("assertNoRawLeakage throws when leaky text sneaks in", () => {
    expect(() => assertNoRawLeakage("permission denied for schema public"))
      .toThrow(/leaky/i);
  });

  it("has every leaky pattern actually flagged", () => {
    for (const raw of LEAKY_STRINGS) {
      const anyMatch = LEAKY_PATTERNS_FOR_TESTS.some((rx) => rx.test(raw));
      expect(anyMatch).toBe(true);
    }
  });
});
