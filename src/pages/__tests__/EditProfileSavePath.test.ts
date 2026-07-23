/**
 * Regression: EditProfile save with an unchanged username failed with
 * "null value in column \"username\" of relation \"profiles\" violates
 * not-null constraint" because the code path used PostgREST upsert,
 * which always attempts INSERT first — the NOT NULL check on username
 * runs before ON CONFLICT resolution. Profiles are always created by a
 * signup trigger, so we switch to plain UPDATE keyed on id.
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
    // The single profile save call must be an UPDATE.
    expect(SRC).toMatch(
      /\.from\(\s*["']profiles["']\s*\)\s*\.update\([\s\S]*?\)\s*\.eq\(\s*["']id["']\s*,\s*uid\s*\)/,
    );
    // And there must be no lingering upsert on the profiles table.
    expect(SRC).not.toMatch(
      /\.from\(\s*["']profiles["']\s*\)\s*\.upsert\(/,
    );
  });

  it("strips id from the update payload so PostgREST does not reject it", () => {
    expect(SRC).toMatch(/const\s*\{\s*id\s*:\s*\w+\s*,\s*\.\.\.profileUpdate\s*\}\s*=\s*profilePayload/);
  });
});
