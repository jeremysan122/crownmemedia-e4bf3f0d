/**
 * Source-contract regression for the 2026-07-23 lockdown migration that
 * restored strict column-level SELECT allowlists on `public.posts` and
 * `public.profiles`. A prior wave-1 migration had reintroduced table-wide
 * grants that re-exposed exact post coordinates, AI internals, moderation
 * status, and every profile column.
 *
 * These tests lock the migration surface so the regression can't come back.
 */
import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

const MIG_DIR = join(process.cwd(), "supabase", "migrations");
const ALL_SQL = readdirSync(MIG_DIR)
  .filter((f) => f.endsWith(".sql"))
  .sort()
  .map((f) => readFileSync(join(MIG_DIR, f), "utf8"))
  .join("\n\n-- FILE BREAK --\n\n");

const LATEST = readdirSync(MIG_DIR)
  .filter((f) => f.endsWith(".sql"))
  .sort()
  .slice(-1)
  .map((f) => readFileSync(join(MIG_DIR, f), "utf8"))
  .join("\n");

describe("posts anon/authenticated column lockdown (2026-07-23)", () => {
  it("latest migration revokes and re-grants SELECT on posts with an allowlist", () => {
    expect(ALL_SQL).toMatch(/REVOKE SELECT ON public\.posts FROM anon, authenticated/);
    // Both allowlists must exist (one for anon, one for authenticated).
    const grants = [...ALL_SQL.matchAll(/GRANT SELECT \(([\s\S]*?)\) ON public\.posts TO (anon|authenticated)/g)];
    expect(grants.length).toBeGreaterThanOrEqual(2);
  });

  it("has_column_privilege guard blocks anon/authenticated on sensitive posts columns", () => {
    for (const col of [
      "post_lat",
      "post_lng",
      "location_captured_at",
      "ai_searchable_text",
      "ai_suggested_main_category_slug",
      "submission_key",
      "client_request_id",
      "moderation_notes",
    ]) {
      expect(LATEST, `guard must reference ${col}`).toMatch(
        new RegExp(`has_column_privilege\\('anon',\\s+'public\\.posts',\\s+'${col}'`),
      );
    }
    // moderation_status must be off-limits to anon but readable by authenticated.
    expect(LATEST).toMatch(/has_column_privilege\('anon',\s+'public\.posts',\s+'moderation_status'/);
    expect(LATEST).not.toMatch(/has_column_privilege\('authenticated',\s+'public\.posts',\s+'moderation_status'/);
  });
});

describe("profiles anon/authenticated column lockdown (2026-07-23)", () => {
  it("latest migration revokes and re-grants SELECT on profiles with an allowlist", () => {
    expect(ALL_SQL).toMatch(/REVOKE SELECT ON public\.profiles FROM anon, authenticated/);
    const anonGrant = ALL_SQL.match(/GRANT SELECT \(([\s\S]*?)\) ON public\.profiles TO anon/)?.[1] ?? "";
    expect(anonGrant, "anon profiles allowlist must exist").toBeTruthy();
    // Anon MUST have the columns the profiles_public view needs.
    for (const col of ["id", "username", "is_banned", "deactivated_at", "deletion_requested_at"]) {
      expect(anonGrant).toMatch(new RegExp(`\\b${col}\\b`));
    }
    // Anon MUST NOT have moderator-only fields.
    for (const col of ["is_suspended", "gender"]) {
      expect(anonGrant).not.toMatch(new RegExp(`\\b${col}\\b`));
    }
  });

  it("profiles_public safe view is granted to anon (unchanged)", () => {
    expect(ALL_SQL).toMatch(/GRANT SELECT ON public\.profiles_public TO anon, authenticated/);
  });
});
