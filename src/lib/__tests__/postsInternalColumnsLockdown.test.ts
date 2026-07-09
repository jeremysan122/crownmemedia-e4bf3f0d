/**
 * Source-contract test for the "internal posts columns" lockdown migration.
 *
 * Locks the guarantees that block the scanner finding
 * "Internal post columns may be readable via public posts table":
 *
 *  - Broad SELECT on public.posts is revoked from anon + authenticated.
 *  - Internal columns (submission_key, client_request_id, moderation_notes,
 *    moderated_by, moderated_at, sensitive_reason) are NOT present in the
 *    final GRANT SELECT allowlist for anon / authenticated.
 *  - An admin-only SECURITY DEFINER RPC exposes moderation fields to
 *    admins/moderators only (has_role check).
 *  - Public client selects (POST_SELECT / PARENT_SELECT / postShare) do
 *    not request sensitive_reason.
 */
import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

const MIG_DIR = join(process.cwd(), "supabase", "migrations");
const allSql = readdirSync(MIG_DIR)
  .filter((f) => f.endsWith(".sql"))
  .sort()
  .map((f) => readFileSync(join(MIG_DIR, f), "utf8"))
  .join("\n\n");

const INTERNAL = [
  "submission_key",
  "client_request_id",
  "moderation_notes",
  "moderated_by",
  "moderated_at",
  "sensitive_reason",
];

describe("posts internal-column lockdown", () => {
  it("revokes broad SELECT on public.posts from anon and authenticated", () => {
    expect(allSql).toMatch(/REVOKE\s+SELECT\s+ON\s+public\.posts\s+FROM\s+anon,\s*authenticated/i);
  });

  it("final GRANT SELECT allowlist for anon/authenticated omits every internal column", () => {
    const grants = [
      ...allSql.matchAll(
        /GRANT\s+SELECT\s*\(([^)]+)\)\s*ON\s+public\.posts\s+TO\s+anon,\s*authenticated/gi,
      ),
    ];
    expect(grants.length).toBeGreaterThan(0);
    const cols = grants[grants.length - 1][1];
    for (const c of INTERNAL) {
      expect(cols, `internal column ${c} leaked into public GRANT SELECT`).not.toMatch(
        new RegExp(`\\b${c}\\b`),
      );
    }
    // Sanity: the allowlist still contains obviously-public columns.
    for (const c of ["id", "user_id", "caption", "image_url", "crown_score", "is_sensitive"]) {
      expect(cols).toMatch(new RegExp(`\\b${c}\\b`));
    }
  });

  it("admin_list_moderation_posts is role-gated and definer, returns moderation fields", () => {
    const fn = allSql.match(
      /CREATE OR REPLACE FUNCTION public\.admin_list_moderation_posts[\s\S]+?\$\$;/,
    )?.[0];
    expect(fn).toBeTruthy();
    expect(fn!).toMatch(/SECURITY DEFINER/);
    expect(fn!).toMatch(/has_role\(auth\.uid\(\)\s*,\s*'admin'::app_role\)/);
    expect(fn!).toMatch(/has_role\(auth\.uid\(\)\s*,\s*'moderator'::app_role\)/);
    for (const c of ["sensitive_reason", "moderation_notes", "moderated_by", "moderated_at"]) {
      expect(fn!).toMatch(new RegExp(`\\b${c}\\b`));
    }
    expect(allSql).toMatch(
      /GRANT EXECUTE ON FUNCTION public\.admin_list_moderation_posts\(text, int\) TO authenticated, service_role/,
    );
  });

  it("client canonical selects never request sensitive_reason", () => {
    const postQuery = readFileSync(join(process.cwd(), "src/lib/postQuery.ts"), "utf8");
    const postShare = readFileSync(join(process.cwd(), "src/lib/postShare.ts"), "utf8");
    const recent = readFileSync(join(process.cwd(), "src/lib/recentGiftTargets.ts"), "utf8");
    for (const src of [postQuery, postShare]) {
      expect(src).not.toMatch(/\bsensitive_reason\b/);
    }
    // recentGiftTargets keeps the interface field name (`sensitiveReason`) as
    // a stable public API for consumers but must not select the column.
    expect(recent).not.toMatch(/select\([^)]*sensitive_reason/i);
  });

  it("admin content page uses the admin RPC instead of selecting sensitive_reason directly", () => {
    const cc = readFileSync(
      join(process.cwd(), "src/pages/admin/CommandCenterContent.tsx"),
      "utf8",
    );
    expect(cc).toMatch(/rpc\(\s*["']admin_list_moderation_posts["']/);
    // no direct .from("posts").select(...) containing sensitive_reason
    expect(cc).not.toMatch(/\.from\(\s*["']posts["']\s*\)\.select\([^)]*sensitive_reason/);
  });
});
