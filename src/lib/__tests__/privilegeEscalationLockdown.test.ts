/**
 * Source-contract tests locking down the two scanner-flagged
 * privilege-escalation vectors:
 *
 *  1) verification_requests — non-admins may not tamper with review/billing fields
 *  2) sensitive_appeals    — users may only withdraw via RPC; mods decide via RPC
 *
 * These verify the SQL migration + client code contracts without needing a live DB.
 */
import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

const MIG_DIR = join(process.cwd(), "supabase", "migrations");
const allSql = readdirSync(MIG_DIR)
  .filter((f) => f.endsWith(".sql"))
  .map((f) => readFileSync(join(MIG_DIR, f), "utf8"))
  .join("\n\n");

describe("verification_requests lockdown", () => {
  it("column-level UPDATE grant excludes protected fields", () => {
    // Original REVOKE + column GRANT (from earlier migration) still applies.
    expect(allSql).toMatch(/REVOKE\s+UPDATE\s+ON\s+public\.verification_requests\s+FROM\s+authenticated/i);
    const grants = allSql.match(/GRANT\s+UPDATE\s*\([^)]+\)\s+ON\s+public\.verification_requests\s+TO\s+authenticated/gi);
    expect(grants && grants.length).toBeTruthy();
    const joined = (grants ?? []).join(" ");
    for (const forbidden of [
      "status",
      "reviewer_id",
      "review_notes",
      "reviewed_at",
      "subscription_active",
      "subscription_id",
      "subscription_renews_at",
    ]) {
      expect(joined).not.toMatch(new RegExp(`\\b${forbidden}\\b`));
    }
  });

  it("adds a defense-in-depth trigger blocking non-admin edits to protected fields", () => {
    expect(allSql).toMatch(/verification_requests_guard_protected_fields/);
    expect(allSql).toMatch(/verification_requests_guard_protected[\s\S]{0,400}BEFORE UPDATE ON public\.verification_requests/);
    // Trigger body enumerates every protected column
    const body = allSql.match(
      /CREATE OR REPLACE FUNCTION public\.verification_requests_guard_protected_fields[\s\S]+?\$\$;/,
    )?.[0] ?? "";
    for (const col of [
      "status",
      "reviewer_id",
      "review_notes",
      "reviewed_at",
      "subscription_id",
      "subscription_active",
      "subscription_renews_at",
    ]) {
      expect(body).toMatch(new RegExp(`NEW\\.${col}\\s+IS DISTINCT FROM\\s+OLD\\.${col}`));
    }
    // Admins bypass, service_role bypasses
    expect(body).toMatch(/has_role\(\s*auth\.uid\(\)\s*,\s*'admin'::app_role\s*\)/);
    expect(body).toMatch(/current_setting\('role'.*\)\s*=\s*'service_role'/);
  });
});

describe("sensitive_appeals lockdown", () => {
  it("drops user + mod direct UPDATE policies and revokes table UPDATE", () => {
    expect(allSql).toMatch(/DROP POLICY IF EXISTS "Users can withdraw own appeals" ON public\.sensitive_appeals/);
    expect(allSql).toMatch(/DROP POLICY IF EXISTS "Mods decide appeals"\s+ON public\.sensitive_appeals/);
    expect(allSql).toMatch(/REVOKE\s+UPDATE\s+ON\s+public\.sensitive_appeals\s+FROM\s+authenticated/i);
  });

  it("exposes withdraw_my_sensitive_appeal RPC with fixed action and ownership check", () => {
    const fn = allSql.match(
      /CREATE OR REPLACE FUNCTION public\.withdraw_my_sensitive_appeal[\s\S]+?\$\$;/,
    )?.[0];
    expect(fn).toBeTruthy();
    // Requires auth
    expect(fn!).toMatch(/auth\.uid\(\)\s+IS NULL/);
    // Ownership check
    expect(fn!).toMatch(/v_row\.user_id\s*<>\s*auth\.uid\(\)/);
    // Only pending/under_review can be withdrawn
    expect(fn!).toMatch(/pending[\s\S]{0,80}under_review/);
    // Only sets status + updated_at — no moderator/decision fields
    const updateStmt = fn!.match(/UPDATE public\.sensitive_appeals[\s\S]+?WHERE id = _appeal_id/)?.[0] ?? "";
    expect(updateStmt).toMatch(/status\s*=\s*'withdrawn'/);
    for (const forbidden of ["moderator_notes", "decided_by", "decided_at", "decision_type"]) {
      expect(updateStmt).not.toMatch(new RegExp(`\\b${forbidden}\\b`));
    }
    expect(allSql).toMatch(/GRANT EXECUTE ON FUNCTION public\.withdraw_my_sensitive_appeal\(uuid\) TO authenticated/);
  });

  it("exposes admin_decide_sensitive_appeal RPC gated to mods/admins with audit log", () => {
    const fn = allSql.match(
      /CREATE OR REPLACE FUNCTION public\.admin_decide_sensitive_appeal[\s\S]+?\$\$;/,
    )?.[0];
    expect(fn).toBeTruthy();
    expect(fn!).toMatch(/has_role\(auth\.uid\(\)\s*,\s*'admin'::app_role\)/);
    expect(fn!).toMatch(/has_role\(auth\.uid\(\)\s*,\s*'moderator'::app_role\)/);
    expect(fn!).toMatch(/moderation_audit/);
    expect(allSql).toMatch(/GRANT EXECUTE ON FUNCTION public\.admin_decide_sensitive_appeal\(uuid, text, text\) TO authenticated/);
  });

  it("admin UI calls the RPC and does not write decision fields via .update()", () => {
    const admin = readFileSync(
      join(process.cwd(), "src/pages/admin/AdminSensitiveAppeals.tsx"),
      "utf8",
    );
    expect(admin).toMatch(/rpc\(\s*["']admin_decide_sensitive_appeal["']/);
    // Must not directly update decision columns from the client
    expect(admin).not.toMatch(/\.from\(\s*["']sensitive_appeals["']\s*\)\s*\.update\(/);
  });
});
