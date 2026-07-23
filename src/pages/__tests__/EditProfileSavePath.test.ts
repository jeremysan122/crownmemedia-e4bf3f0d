/**
 * Regression: EditProfile save with an unchanged username failed with
 * "null value in column \"username\" of relation \"profiles\" violates
 * not-null constraint" because upsert always attempts INSERT first — the
 * NOT NULL check on username runs before ON CONFLICT resolution.
 *
 * Profiles are always created by a signup trigger, so we switch to plain
 * UPDATE keyed on id. This file also locks the immutability contract for
 * DOB (never in payload) and email (routed through supabase.auth.updateUser
 * so email confirmation kicks in).
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const SRC = readFileSync(
  join(process.cwd(), "src", "pages", "EditProfile.tsx"),
  "utf8",
);

describe("EditProfile save path", () => {
  it("uses supabase.from('profiles').update(...).eq('id', uid), not upsert", () => {
    expect(SRC).toMatch(
      /\.from\(\s*["']profiles["']\s*\)\s*\.update\([\s\S]*?\)\s*\.eq\(\s*["']id["']\s*,\s*uid\s*\)/,
    );
    expect(SRC).not.toMatch(/\.from\(\s*["']profiles["']\s*\)\s*\.upsert\(/);
  });

  it("strips id from the update payload so PostgREST does not reject it", () => {
    expect(SRC).toMatch(
      /const\s*\{\s*id\s*:\s*\w+\s*,\s*\.\.\.profileUpdate\s*\}\s*=\s*profilePayload/,
    );
  });

  it("self-excludes username when unchanged (never appears in payload)", () => {
    expect(SRC).toMatch(
      /const\s+usernameChanged\s*=\s*nextUsername\s*!==\s*currentUsername/,
    );
    expect(SRC).toMatch(
      /if\s*\(\s*usernameChanged\s*\)\s*profilePayload\.username\s*=\s*nextUsername/,
    );
  });

  it("never puts date_of_birth in the profile update payload (DOB is signup-locked)", () => {
    // Scan the payload block only, not free-form comment text.
    const payloadBlock =
      SRC.match(/const\s+profilePayload[\s\S]+?\};/)?.[0] ?? "";
    expect(payloadBlock).toBeTruthy();
    expect(payloadBlock).not.toMatch(/date_of_birth|dob/);
    // Same guarantee on the derived object handed to .update(...).
    expect(payloadBlock).not.toMatch(/email\s*:/);
  });

  it("routes email changes through supabase.auth.updateUser (confirmation flow)", () => {
    expect(SRC).toMatch(/supabase\.auth\.updateUser\(\s*\{\s*email:\s*email\.trim\(\)\s*\}\s*\)/);
    // And never writes email onto the profiles row.
    expect(SRC).not.toMatch(/profilePayload\.email\s*=/);
  });
});
