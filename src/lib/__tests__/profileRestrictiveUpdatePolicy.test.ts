import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

/**
 * Source-contract tests for the profiles column-lockdown UPDATE policy.
 *
 * The policy MUST be declared `AS RESTRICTIVE` — permissive policies are
 * OR'ed and would let a caller bypass the column-lockdown WITH CHECK.
 */
const migrationsDir = join(process.cwd(), "supabase", "migrations");
const sql = readdirSync(migrationsDir)
  .filter((f) => f.endsWith(".sql"))
  .sort()
  .map((f) => readFileSync(join(migrationsDir, f), "utf8"))
  .join("\n\n");

// Extract the LAST CREATE POLICY block for this policy name (latest wins).
function latestPolicyBlock(name: string): string {
  const re = new RegExp(
    `CREATE POLICY "${name}"[\\s\\S]*?\\);`,
    "g",
  );
  const matches = sql.match(re) ?? [];
  return matches[matches.length - 1] ?? "";
}

describe("profiles column-lockdown UPDATE policy", () => {
  const block = latestPolicyBlock("Profiles: deny self-mutation of protected fields");

  it("exists in migrations", () => {
    expect(block).not.toBe("");
  });

  it("is declared AS RESTRICTIVE", () => {
    expect(block).toMatch(/AS RESTRICTIVE/);
  });

  it("is FOR UPDATE and scoped to authenticated", () => {
    expect(block).toMatch(/FOR UPDATE/);
    expect(block).toMatch(/TO authenticated/);
  });

  it("keeps the admin/moderator escape hatch in WITH CHECK", () => {
    expect(block).toMatch(/has_role\(auth\.uid\(\),\s*'admin'/);
    expect(block).toMatch(/has_role\(auth\.uid\(\),\s*'moderator'/);
  });

  it("locks verified, verified_at, and verification_plan", () => {
    expect(block).toMatch(/verified\s+IS NOT DISTINCT FROM/);
    expect(block).toMatch(/verified_at\s+IS NOT DISTINCT FROM/);
    expect(block).toMatch(/verification_plan\s+IS NOT DISTINCT FROM/);
  });

  it("locks moderation state (is_banned, banned_by, deactivated_at, deletion_requested_at)", () => {
    expect(block).toMatch(/is_banned\s+IS NOT DISTINCT FROM/);
    expect(block).toMatch(/banned_by\s+IS NOT DISTINCT FROM/);
    expect(block).toMatch(/deactivated_at\s+IS NOT DISTINCT FROM/);
    expect(block).toMatch(/deletion_requested_at\s+IS NOT DISTINCT FROM/);
  });

  it("locks server-maintained counters", () => {
    for (const col of [
      "crowns_held",
      "crowns_total",
      "battle_wins",
      "followers_count",
      "following_count",
      "votes_received",
      "votes_given",
    ]) {
      expect(block).toMatch(new RegExp(`${col}\\s+IS NOT DISTINCT FROM`));
    }
  });
});

describe("profiles owner-scope policy still present", () => {
  it("permissive 'Users can update their own profile' policy exists", () => {
    // Original migration used lowercase `create policy ... for update using (auth.uid() = id)`.
    expect(sql).toMatch(
      /create policy "Users can update their own profile"[\s\S]*?for update[\s\S]*?using\s*\(\s*auth\.uid\(\)\s*=\s*id\s*\)/i,
    );
  });
});

describe("no payment/subscription code writes profiles.verified directly", () => {
  const roots = ["src", "supabase/functions"];
  const files: string[] = [];
  function walk(dir: string) {
    let entries: string[] = [];
    try {
      entries = readdirSync(dir, { withFileTypes: true }).flatMap((d) =>
        d.isDirectory() ? [`${dir}/${d.name}`] : [],
      );
    } catch {
      return;
    }
    for (const sub of entries) walk(sub);
    try {
      for (const d of readdirSync(dir, { withFileTypes: true })) {
        if (
          d.isFile() &&
          /\.(ts|tsx|js|mjs)$/.test(d.name) &&
          !/__tests__|\.test\./.test(d.name)
        ) {
          files.push(`${dir}/${d.name}`);
        }
      }
    } catch { /* noop */ }
  }
  for (const r of roots) walk(r);

  it("has no direct .update({ verified: true }) call anywhere", () => {
    const offenders: string[] = [];
    for (const f of files) {
      const content = readFileSync(f, "utf8");
      if (/\.update\(\s*{\s*[^}]*\bverified\s*:\s*true\b/.test(content)) {
        offenders.push(f);
      }
    }
    expect(offenders).toEqual([]);
  });

  it("does not set verified: true from any payments/verification edge function", () => {
    const paymentFiles = files.filter((f) =>
      /payments|checkout|verify-purchase|stripe|revenuecat|create-verification-checkout/.test(f),
    );
    const offenders = paymentFiles.filter((f) => {
      const c = readFileSync(f, "utf8");
      return /verified\s*:\s*true/.test(c) && !/\/\/.*verified\s*:\s*true/.test(c);
    });
    expect(offenders).toEqual([]);
  });
});
