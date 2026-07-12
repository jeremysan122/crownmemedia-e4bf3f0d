/**
 * Wave 8.2b Stage 2.1 — Royal Shield audit log + integrity check contract.
 *
 * Source-contract tests that lock the migration's invariants:
 *   - append-only audit table with RLS restricting reads to self / admin
 *   - RESTRICTIVE policies blocking every client write
 *   - `admin_run_royal_shield_integrity_check` gated on admin role and
 *     recording exactly one audit row per user with a status derived
 *     from active_shield_sessions vs net_spent_credits
 *   - `my_royal_shield_summary` scoped to auth.uid() and not executable
 *     by anon
 *   - `log_royal_shield_event` writer restricted to service_role
 *
 * Runtime drift-scenario proofs (seeded users with triggers enabled)
 * remain deferred until Docker/staging is available — see agent transcript.
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

describe("royal_shield_audit_log table", () => {
  it("is created with restricted event_type values", () => {
    expect(allSql).toMatch(
      /CREATE TABLE IF NOT EXISTS public\.royal_shield_audit_log[\s\S]+?event_type text NOT NULL CHECK \(event_type IN \([\s\S]+?'invariant_ok'[\s\S]+?'invariant_drift'[\s\S]+?\)\)/,
    );
  });

  it("carries reason_code and related battle/post IDs", () => {
    expect(allSql).toMatch(/royal_shield_audit_log[\s\S]+?reason_code text NOT NULL/);
    expect(allSql).toMatch(/royal_shield_audit_log[\s\S]+?battle_id uuid,[\s\S]+?post_id uuid/);
  });

  it("has RLS enabled and grants SELECT only to authenticated + service_role", () => {
    expect(allSql).toMatch(/GRANT SELECT ON public\.royal_shield_audit_log TO authenticated/);
    expect(allSql).toMatch(/GRANT ALL ON public\.royal_shield_audit_log TO service_role/);
    expect(allSql).toMatch(/ALTER TABLE public\.royal_shield_audit_log ENABLE ROW LEVEL SECURITY/);
  });

  it("scopes user reads to auth.uid() and lets admins read everything", () => {
    expect(allSql).toMatch(
      /POLICY "royal_shield_audit users read own"[\s\S]+?USING \(auth\.uid\(\) = user_id\)/,
    );
    expect(allSql).toMatch(
      /POLICY "royal_shield_audit admins read all"[\s\S]+?has_role\(auth\.uid\(\), 'admin'::app_role\)/,
    );
  });

  it("blocks all client writes with RESTRICTIVE policies", () => {
    expect(allSql).toMatch(
      /POLICY "royal_shield_audit no client insert"[\s\S]+?AS RESTRICTIVE FOR INSERT[\s\S]+?WITH CHECK \(false\)/,
    );
    expect(allSql).toMatch(
      /POLICY "royal_shield_audit no client update"[\s\S]+?AS RESTRICTIVE FOR UPDATE[\s\S]+?USING \(false\) WITH CHECK \(false\)/,
    );
    expect(allSql).toMatch(
      /POLICY "royal_shield_audit no client delete"[\s\S]+?AS RESTRICTIVE FOR DELETE[\s\S]+?USING \(false\)/,
    );
  });
});

describe("log_royal_shield_event emitter", () => {
  it("is SECURITY DEFINER with locked search_path", () => {
    expect(allSql).toMatch(
      /CREATE OR REPLACE FUNCTION public\.log_royal_shield_event[\s\S]+?SECURITY DEFINER[\s\S]+?SET search_path = public/,
    );
  });

  it("is not callable by anon or authenticated clients", () => {
    expect(allSql).toMatch(
      /REVOKE ALL ON FUNCTION public\.log_royal_shield_event\([\s\S]+?\) FROM PUBLIC, anon, authenticated/,
    );
    expect(allSql).toMatch(
      /GRANT EXECUTE ON FUNCTION public\.log_royal_shield_event\([\s\S]+?\) TO service_role/,
    );
  });

  it("stamps actor_id from auth.uid() and coerces null deltas to zero", () => {
    expect(allSql).toMatch(/log_royal_shield_event[\s\S]+?COALESCE\(_delta, 0\)/);
    expect(allSql).toMatch(/log_royal_shield_event[\s\S]+?auth\.uid\(\), COALESCE\(_metadata/);
  });
});

describe("my_royal_shield_summary RPC", () => {
  it("filters to the caller only", () => {
    expect(allSql).toMatch(
      /CREATE OR REPLACE FUNCTION public\.my_royal_shield_summary[\s\S]+?WHERE v\.user_id = auth\.uid\(\)/,
    );
  });

  it("computes remaining_credits as granted minus net_spent, clamped at zero", () => {
    expect(allSql).toMatch(
      /my_royal_shield_summary[\s\S]+?GREATEST\(COALESCE\(SUM\(v\.shields_granted - v\.net_spent_credits\), 0\), 0\)/,
    );
  });

  it("reports drift when any allowance shows active_shield_sessions > net_spent_credits", () => {
    expect(allSql).toMatch(
      /my_royal_shield_summary[\s\S]+?bool_or\(v\.active_shield_sessions > v\.net_spent_credits\)/,
    );
  });

  it("is executable by authenticated but not anon", () => {
    expect(allSql).toMatch(
      /REVOKE ALL ON FUNCTION public\.my_royal_shield_summary\(\) FROM PUBLIC, anon/,
    );
    expect(allSql).toMatch(
      /GRANT EXECUTE ON FUNCTION public\.my_royal_shield_summary\(\) TO authenticated, service_role/,
    );
  });
});

describe("admin_run_royal_shield_integrity_check RPC", () => {
  it("raises 42501 for non-admin callers before doing any work", () => {
    expect(allSql).toMatch(
      /admin_run_royal_shield_integrity_check[\s\S]+?IF NOT public\.has_role\(auth\.uid\(\), 'admin'::app_role\)[\s\S]+?RAISE EXCEPTION 'not_authorized'[\s\S]+?ERRCODE = '42501'/,
    );
  });

  it("emits status = 'drift' iff active_shield_sessions exceed net_spent_credits", () => {
    // Drift row logic used both for the audit row event_type and the returned status.
    expect(allSql).toMatch(
      /admin_run_royal_shield_integrity_check[\s\S]+?CASE WHEN r\.drift_amount > 0 THEN 'invariant_drift' ELSE 'invariant_ok' END/,
    );
    expect(allSql).toMatch(
      /admin_run_royal_shield_integrity_check[\s\S]+?CASE WHEN r\.drift_amount > 0 THEN 'drift' ELSE 'ok' END/,
    );
  });

  it("writes one audit row per user with the run's reason code", () => {
    expect(allSql).toMatch(
      /admin_run_royal_shield_integrity_check[\s\S]+?INSERT INTO public\.royal_shield_audit_log[\s\S]+?_reason,/,
    );
  });

  it("aggregates per user_id so each user gets exactly one row per run", () => {
    expect(allSql).toMatch(
      /admin_run_royal_shield_integrity_check[\s\S]+?FROM public\.royal_shield_accounting v\s*\n\s*GROUP BY v\.user_id/,
    );
  });

  it("clamps drift_amount at zero (no negative drift reported)", () => {
    expect(allSql).toMatch(
      /admin_run_royal_shield_integrity_check[\s\S]+?GREATEST\(SUM\(v\.active_shield_sessions\) - SUM\(v\.net_spent_credits\), 0\)/,
    );
  });
});

describe("Existing accounting tables — RLS lockdown re-verified", () => {
  it("royal_pass_shield_allowances only readable by owner or admin", () => {
    expect(allSql).toMatch(
      /POLICY "Users view own shield allowance"[\s\S]+?USING \(\(?auth\.uid\(\) = user_id\)?\)/,
    );
    expect(allSql).toMatch(
      /POLICY "Admins view all shield allowances"[\s\S]+?has_role\(auth\.uid\(\), 'admin'::app_role\)/,
    );
  });

  it("royal_pass_shield_allowances blocks all client mutations", () => {
    expect(allSql).toMatch(
      /shield_allowances no client (insert|update|delete)[\s\S]+?AS RESTRICTIVE/,
    );
  });
});
