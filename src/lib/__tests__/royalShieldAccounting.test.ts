/**
 * Wave 8.2b Stage 2 — Royal Shield accounting source contract.
 *
 * Locks the invariants introduced by the shield-credit vs active-session
 * accounting migration. Runtime lifecycle proof (with seeded users +
 * triggers enabled) is deferred until a Docker or staging environment
 * is available — see agent transcript for the outstanding blocker.
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

describe("Stage 2 — royal_shield_accounting view", () => {
  it("is defined with security_invoker so RLS on base tables is respected", () => {
    expect(allSql).toMatch(
      /CREATE OR REPLACE VIEW public\.royal_shield_accounting[\s\S]+?security_invoker\s*=\s*true/i,
    );
  });

  it("exposes net_spent_credits computed from shields_used minus reversed", () => {
    expect(allSql).toMatch(
      /GREATEST\(a\.shields_used - COALESCE\(g\.shields_reversed, 0\), 0\)\s+AS net_spent_credits/,
    );
  });

  it("counts active shield sessions from the boosts table", () => {
    expect(allSql).toMatch(
      /FROM public\.boosts b[\s\S]+?b\.boost_type = 'crown_shield'[\s\S]+?b\.active = true[\s\S]+?AS active_shield_sessions/,
    );
  });

  it("revokes anon + authenticated direct view access", () => {
    expect(allSql).toMatch(
      /REVOKE ALL ON public\.royal_shield_accounting FROM PUBLIC, anon, authenticated/,
    );
  });

  it("grants direct view access only to service_role", () => {
    expect(allSql).toMatch(
      /GRANT SELECT ON public\.royal_shield_accounting TO service_role/,
    );
  });
});

describe("Stage 2 — my_royal_shield_accounting wrapper", () => {
  it("filters rows by auth.uid()", () => {
    expect(allSql).toMatch(
      /CREATE OR REPLACE FUNCTION public\.my_royal_shield_accounting[\s\S]+?WHERE v\.user_id = auth\.uid\(\)/,
    );
  });

  it("is SECURITY DEFINER with a locked search_path", () => {
    expect(allSql).toMatch(
      /CREATE OR REPLACE FUNCTION public\.my_royal_shield_accounting[\s\S]+?SECURITY DEFINER[\s\S]+?SET search_path = public/,
    );
  });

  it("is not executable by anon", () => {
    expect(allSql).toMatch(
      /REVOKE ALL ON FUNCTION public\.my_royal_shield_accounting\(\) FROM PUBLIC, anon/,
    );
  });
});

describe("Stage 2 — admin_royal_shield_accounting", () => {
  it("gates on has_role admin and raises 42501 otherwise", () => {
    expect(allSql).toMatch(
      /CREATE OR REPLACE FUNCTION public\.admin_royal_shield_accounting[\s\S]+?has_role\(auth\.uid\(\), 'admin'::app_role\)[\s\S]+?RAISE EXCEPTION 'not_authorized'[\s\S]+?42501/,
    );
  });
});

describe("Stage 2 — assert_royal_shield_invariants", () => {
  it("returns rows only where active_shield_sessions exceed net_spent_credits (drift)", () => {
    expect(allSql).toMatch(
      /CREATE OR REPLACE FUNCTION public\.assert_royal_shield_invariants[\s\S]+?active_shield_sessions > v\.net_spent_credits/,
    );
  });

  it("requires admin role", () => {
    expect(allSql).toMatch(
      /assert_royal_shield_invariants[\s\S]+?has_role\(auth\.uid\(\), 'admin'::app_role\)/,
    );
  });

  it("is not executable by anon", () => {
    expect(allSql).toMatch(
      /REVOKE ALL ON FUNCTION public\.assert_royal_shield_invariants\(uuid\) FROM PUBLIC, anon, authenticated/,
    );
  });
});
