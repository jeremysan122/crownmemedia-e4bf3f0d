import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

/**
 * Source-contract tests for the profiles.crown_score guard.
 *
 * Requirements:
 *  - normal users cannot self-mutate profiles.crown_score (silent revert)
 *  - the posts→profile sync trigger sets an internal GUC flag so its
 *    UPDATE on profiles.crown_score passes the guard
 *  - service_role and admin/moderator paths still work
 */
const migrationsDir = join(process.cwd(), "supabase", "migrations");
const sql = readdirSync(migrationsDir)
  .filter((f) => f.endsWith(".sql"))
  .sort()
  .map((f) => readFileSync(join(migrationsDir, f), "utf8"))
  .join("\n\n");

function latestFunctionBody(name: string): string {
  const re = new RegExp(
    `CREATE OR REPLACE FUNCTION public\\.${name}\\([\\s\\S]*?\\$function\\$;`,
    "g",
  );
  const matches = sql.match(re) ?? [];
  return matches[matches.length - 1] ?? "";
}

describe("profiles.crown_score guard (latest definition)", () => {
  const guard = latestFunctionBody("guard_profiles_crown_score");

  it("exists", () => {
    expect(guard).not.toBe("");
  });

  it("allows updates when internal sync flag app.allow_crown_score_sync is set", () => {
    expect(guard).toMatch(
      /current_setting\(\s*'app\.allow_crown_score_sync'\s*,\s*true\s*\)\s*=\s*'true'/,
    );
  });

  it("allows updates when caller is service_role", () => {
    expect(guard).toMatch(/'request\.jwt\.claim\.role'[\s\S]*'service_role'/);
  });

  it("allows updates when caller is admin or moderator", () => {
    expect(guard).toMatch(/has_role\(auth\.uid\(\),\s*'admin'::app_role\)/);
    expect(guard).toMatch(/has_role\(auth\.uid\(\),\s*'moderator'::app_role\)/);
  });

  it("silently reverts crown_score for all other callers", () => {
    expect(guard).toMatch(/NEW\.crown_score\s*:=\s*OLD\.crown_score/);
  });

  it("does NOT raise an exception for normal users (silent revert only)", () => {
    // No RAISE EXCEPTION in the guard body
    expect(guard).not.toMatch(/RAISE EXCEPTION/);
  });
});

describe("tg_sync_profile_crown_score (latest definition)", () => {
  const sync = latestFunctionBody("tg_sync_profile_crown_score");

  it("exists", () => {
    expect(sync).not.toBe("");
  });

  it("sets the internal sync flag before mutating profiles.crown_score", () => {
    expect(sync).toMatch(
      /set_config\(\s*'app\.allow_crown_score_sync'\s*,\s*'true'\s*,\s*true\s*\)/,
    );
  });

  it("handles INSERT, UPDATE, and DELETE branches", () => {
    expect(sync).toMatch(/TG_OP\s*=\s*'INSERT'/);
    expect(sync).toMatch(/TG_OP\s*=\s*'UPDATE'/);
    expect(sync).toMatch(/TG_OP\s*=\s*'DELETE'/);
  });

  it("clamps profile crown_score at 0 (GREATEST(0, ...))", () => {
    // At least one GREATEST(0, ...) guard on the aggregate
    expect(sync).toMatch(/GREATEST\(0,\s*crown_score/);
  });
});
