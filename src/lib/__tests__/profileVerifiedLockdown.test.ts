import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

/**
 * Source-contract tests for the profile "verified badge" lockdown.
 *
 * Ensures the migration that hardens profiles.verified against self-escalation
 * remains in place. If any of these assertions fail, verification bypass has
 * been reintroduced.
 */
const migrationsDir = join(process.cwd(), "supabase", "migrations");

function readAllMigrations(): string {
  return readdirSync(migrationsDir)
    .filter((f) => f.endsWith(".sql"))
    .map((f) => readFileSync(join(migrationsDir, f), "utf8"))
    .join("\n\n");
}

const sql = readAllMigrations();

describe("profiles verified badge lockdown", () => {
  it("defines the profiles_prevent_verified_self_escalation trigger function", () => {
    expect(sql).toMatch(
      /CREATE OR REPLACE FUNCTION public\.profiles_prevent_verified_self_escalation/,
    );
  });

  it("attaches a BEFORE UPDATE trigger on public.profiles for verified escalation guard", () => {
    expect(sql).toMatch(
      /CREATE TRIGGER trg_profiles_prevent_verified_self_escalation[\s\S]*BEFORE UPDATE ON public\.profiles/,
    );
  });

  it("guards verified, verified_at, and verification_plan columns", () => {
    expect(sql).toMatch(/NEW\.verified\s+IS DISTINCT FROM OLD\.verified/);
    expect(sql).toMatch(/NEW\.verified_at\s+IS DISTINCT FROM OLD\.verified_at/);
    expect(sql).toMatch(/NEW\.verification_plan\s+IS DISTINCT FROM OLD\.verification_plan/);
  });

  it("raises a 42501 (insufficient_privilege) error on unauthorized change", () => {
    expect(sql).toMatch(/'not authorized to change verified badge'[\s\S]*ERRCODE = '42501'/);
  });

  it("extends the profiles UPDATE policy WITH CHECK to require verified fields unchanged", () => {
    expect(sql).toMatch(
      /Profiles: deny self-mutation of protected fields[\s\S]*NOT \(verified\s+IS DISTINCT FROM/,
    );
    expect(sql).toMatch(/NOT \(verified_at\s+IS DISTINCT FROM/);
    expect(sql).toMatch(/NOT \(verification_plan\s+IS DISTINCT FROM/);
  });

  it("only admin or moderator (or service_role) may bypass the trigger", () => {
    expect(sql).toMatch(/has_role\(auth\.uid\(\), 'admin'::app_role\)/);
    expect(sql).toMatch(/has_role\(auth\.uid\(\), 'moderator'::app_role\)/);
    expect(sql).toMatch(/current_setting\('request\.jwt\.claim\.role', true\) = 'service_role'/);
  });

  it("defines admin_set_profile_verified RPC gated to admin/moderator", () => {
    expect(sql).toMatch(
      /CREATE OR REPLACE FUNCTION public\.admin_set_profile_verified[\s\S]*RAISE EXCEPTION 'not authorized'/,
    );
  });

  it("admin_set_profile_verified logs to admin_audit_log", () => {
    expect(sql).toMatch(
      /admin_set_profile_verified[\s\S]*INSERT INTO public\.admin_audit_log[\s\S]*'profile\.verified\.set'/,
    );
  });

  it("admin_set_profile_verified EXECUTE is revoked from anon", () => {
    expect(sql).toMatch(
      /REVOKE ALL ON FUNCTION public\.admin_set_profile_verified[^;]*FROM PUBLIC, anon/,
    );
  });

  it("payment / subscription code does not directly set profiles.verified = true", () => {
    // Scan repo source for any client/edge path that flips verified without going through the admin RPC.
    const walk = (dir: string): string[] => {
      const out: string[] = [];
      for (const entry of readdirSync(dir, { withFileTypes: true })) {
        if (entry.name === "node_modules" || entry.name.startsWith(".")) continue;
        const p = join(dir, entry.name);
        if (entry.isDirectory()) out.push(...walk(p));
        else if (/\.(ts|tsx|js|sql)$/.test(entry.name)) out.push(p);
      }
      return out;
    };

    const forbidden =
      /\.update\(\s*\{[^}]*verified\s*:\s*true/;
    const offenders: string[] = [];
    for (const file of walk(join(process.cwd(), "src"))) {
      if (file.endsWith("profileVerifiedLockdown.test.ts")) continue;
      const content = readFileSync(file, "utf8");
      if (forbidden.test(content)) offenders.push(file);
    }

    // Edge functions (if any) — also scan
    const supabaseFns = join(process.cwd(), "supabase", "functions");
    try {
      for (const file of walk(supabaseFns)) {
        const content = readFileSync(file, "utf8");
        // service_role setting verified is only allowed inside an explicit admin approval flow.
        // We disallow any raw .update({ verified: true }) in payment/stripe/checkout code.
        if (
          forbidden.test(content) &&
          /(stripe|payment|checkout|subscription|billing)/i.test(file)
        ) {
          offenders.push(file);
        }
      }
    } catch {
      /* no edge functions dir */
    }

    expect(offenders).toEqual([]);
  });
});
