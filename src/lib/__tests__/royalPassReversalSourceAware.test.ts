/**
 * Wave 8.2b — source-aware reversal & exact restoration source-contract tests.
 *
 * Verifies migration content shape without needing runtime seeded users.
 * Runtime lifecycle proofs run via psql in the agent-run report.
 */
import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

const MIG_DIR = join(process.cwd(), "supabase", "migrations");
const allSql = readdirSync(MIG_DIR)
  .filter((f) => f.endsWith(".sql"))
  .map((f) => readFileSync(join(MIG_DIR, f), "utf8"))
  .join("\n\n");

function latestFn(name: string): string {
  const re = new RegExp(
    `CREATE OR REPLACE FUNCTION public\\.${name}[\\s\\S]+?\\$function\\$;`,
    "g",
  );
  return allSql.match(re)?.slice(-1)[0] ?? "";
}

describe("Wave 8.2b — grant tracking columns", () => {
  it("adds promo_shekels_remaining / promo_boost_tokens_remaining", () => {
    expect(allSql).toMatch(/ADD COLUMN IF NOT EXISTS promo_shekels_remaining integer/);
    expect(allSql).toMatch(/ADD COLUMN IF NOT EXISTS promo_boost_tokens_remaining integer/);
  });
  it("enforces non-negative remaining bounded by granted amounts", () => {
    expect(allSql).toMatch(
      /royal_pass_grants_remaining_nonneg[\s\S]+?promo_shekels_remaining <= shekels_granted[\s\S]+?promo_boost_tokens_remaining <= boost_tokens_granted/,
    );
  });
  it("records reversed and restored amounts per-grant", () => {
    for (const col of [
      "shields_reversed",
      "shekels_reversed",
      "boost_tokens_reversed",
      "active_shields_reversed",
      "founder_reversed",
      "reversal_completed_at",
      "reversal_source_event_id",
      "restoration_completed_at",
      "restoration_source_event_id",
    ]) {
      expect(allSql).toContain(`ADD COLUMN IF NOT EXISTS ${col}`);
    }
  });
});

describe("Wave 8.2b — boosts ↔ grant/allowance linkage", () => {
  it("adds royal_pass_grant_id + royal_pass_shield_allowance_id with ON DELETE RESTRICT", () => {
    expect(allSql).toMatch(/boosts_royal_grant_fk[\s\S]+?REFERENCES public\.royal_pass_grants\(id\)[\s\S]+?ON DELETE RESTRICT/);
    expect(allSql).toMatch(/boosts_royal_allowance_fk[\s\S]+?REFERENCES public\.royal_pass_shield_allowances\(id\)[\s\S]+?ON DELETE RESTRICT/);
  });
  it("use_royal_shield populates both link columns", () => {
    const fn = latestFn("use_royal_shield");
    expect(fn).toMatch(/royal_pass_grant_id[\s\S]+?royal_pass_shield_allowance_id/);
    expect(fn).toMatch(/allow\.royal_pass_grant_id,\s*allow\.id/);
  });
});

describe("Wave 8.2b — royal_pass_reversals ledger", () => {
  it("creates the table with strict event_kind enum + uniqueness per event", () => {
    expect(allSql).toMatch(/CREATE TABLE IF NOT EXISTS public\.royal_pass_reversals/);
    expect(allSql).toMatch(/event_kind text NOT NULL CHECK \(event_kind IN \('reversal','restoration'\)\)/);
    expect(allSql).toMatch(
      /CREATE UNIQUE INDEX IF NOT EXISTS ux_royal_pass_reversals_event_kind[\s\S]+?\(royal_pass_grant_id, event_kind, stripe_event_id\)/,
    );
  });
  it("FK to royal_pass_grants uses ON DELETE RESTRICT", () => {
    expect(allSql).toMatch(/royal_pass_grant_id uuid NOT NULL REFERENCES public\.royal_pass_grants\(id\) ON DELETE RESTRICT/);
  });
  it("blocks client insert / update / delete via RESTRICTIVE policies", () => {
    for (const op of ["INSERT", "UPDATE", "DELETE"]) {
      expect(allSql).toMatch(
        new RegExp(
          `CREATE POLICY "royal_pass_reversals no client ${op.toLowerCase()}"[\\s\\S]+?AS RESTRICTIVE[\\s\\S]+?FOR ${op}`,
          "i",
        ),
      );
    }
  });
  it("owner + admin read policies exist", () => {
    expect(allSql).toMatch(/"Users view own royal reversals"[\s\S]+?USING \(auth\.uid\(\) = user_id\)/);
    expect(allSql).toMatch(/"Admins view all royal reversals"[\s\S]+?has_role\(auth\.uid\(\), 'admin'::app_role\)/);
  });
});

describe("Wave 8.2b — source-aware spend triggers", () => {
  it("shekel_ledger trigger consumes promo_shekels_remaining oldest-first on spend", () => {
    const fn = latestFn("trg_consume_royal_promo_shekels");
    expect(fn).toMatch(/NEW\.shekels_delta >= 0/);
    expect(fn).toMatch(/NEW\.kind IN \('royal_monthly','royal_reversal','royal_reinstate'\)/);
    expect(fn).toMatch(/ORDER BY created_at ASC[\s\S]+?FOR UPDATE/);
    expect(fn).toMatch(/promo_shekels_remaining = promo_shekels_remaining - take/);
  });
  it("boost_tokens_ledger trigger consumes promo_boost_tokens_remaining oldest-first on spend", () => {
    const fn = latestFn("trg_consume_royal_promo_boost_tokens");
    expect(fn).toMatch(/NEW\.delta >= 0/);
    expect(fn).toMatch(/promo_boost_tokens_remaining = promo_boost_tokens_remaining - take/);
  });
  it("triggers are attached AFTER INSERT on each ledger", () => {
    expect(allSql).toMatch(/CREATE TRIGGER shekel_ledger_consume_royal_promo[\s\S]+?AFTER INSERT ON public\.shekel_ledger/);
    expect(allSql).toMatch(/CREATE TRIGGER boost_tokens_ledger_consume_royal_promo[\s\S]+?AFTER INSERT ON public\.boost_tokens_ledger/);
  });
});

describe("Wave 8.2b — handle_royal_refund is source-aware", () => {
  const fn = latestFn("handle_royal_refund");
  it("only debits the promotional remaining portion", () => {
    // Current contract: intent captured from promo_*_remaining, then bounded by wallet balance
    expect(fn).toMatch(/shekels_intended\s*:=\s*COALESCE\(grant_row\.promo_shekels_remaining, 0\)/);
    expect(fn).toMatch(/tokens_intended\s*:=\s*COALESCE\(grant_row\.promo_boost_tokens_remaining, 0\)/);
  });
  it("only deactivates Royal shields tied to the grant (not paid crown shields)", () => {
    expect(fn).toMatch(/FROM public\.boosts[\s\S]+?WHERE royal_pass_grant_id = grant_row\.id[\s\S]+?boost_type = 'crown_shield'/);
  });
  it("writes an immutable reversal ledger entry", () => {
    expect(fn).toMatch(/INSERT INTO public\.royal_pass_reversals[\s\S]+?'reversal'/);
  });
  it("is idempotent by (grant_id, stripe_event_id)", () => {
    // Idempotency now enforced via unique upsert on (grant_id, event_kind, stripe_event_id)
    expect(fn).toMatch(/ON CONFLICT \(royal_pass_grant_id, event_kind, stripe_event_id\) DO NOTHING/);
  });
  it("decrements promo remaining by exactly the amount debited", () => {
    expect(fn).toMatch(/promo_shekels_remaining = GREATEST\(promo_shekels_remaining - shekels_actual, 0\)/);
    expect(fn).toMatch(/promo_boost_tokens_remaining = GREATEST\(promo_boost_tokens_remaining - tokens_actual, 0\)/);
  });
});

describe("Wave 8.2b — handle_royal_dispute_reinstated restores exactly what was removed", () => {
  const fn = latestFn("handle_royal_dispute_reinstated");
  it("reads amounts from the reversal ledger, not from granted totals", () => {
    expect(fn).toMatch(/SELECT \* INTO reversal_row FROM public\.royal_pass_reversals[\s\S]+?event_kind = 'reversal'/);
    // shields_delta and active_shields_delta store the same reversed count in the reversal row
    expect(fn).toMatch(/shields_to_restore\s*:=\s*COALESCE\(reversal_row\.(?:active_)?shields_delta, 0\)/);
    expect(fn).toMatch(/shekels_to_restore\s*:=\s*COALESCE\(reversal_row\.shekels_delta, 0\)/);
    expect(fn).toMatch(/tokens_to_restore\s*:=\s*COALESCE\(reversal_row\.boost_tokens_delta, 0\)/);
  });
  it("reactivates previously-active shields still within their window", () => {
    expect(fn).toMatch(/expires_at IS NOT NULL AND[\s\S]{0,40}expires_at > now\(\)[\s\S]+?UPDATE public\.boosts SET active = true/);
  });
  it("converts expired reactivations into allowance credits (not fresh 24h shields)", () => {
    expect(fn).toMatch(/shields_used = GREATEST\(shields_used - 1, 0\)[\s\S]+?allowance_credits_restored/);
  });
  it("is idempotent by (grant_id, stripe_event_id)", () => {
    expect(fn).toMatch(/event_kind = 'restoration'[\s\S]+?stripe_event_id = _stripe_event_id/);
  });
  it("still refuses to restore refunded grants and mismatched disputes", () => {
    expect(fn).toMatch(/skipped_refunded/);
    expect(fn).toMatch(/dispute_mismatch/);
  });
  it("writes a matching restoration ledger row", () => {
    expect(fn).toMatch(/INSERT INTO public\.royal_pass_reversals[\s\S]+?'restoration'/);
  });
});

describe("Wave 8.2b — grant_royal_monthly_benefits initializes promo remaining", () => {
  const fn = latestFn("grant_royal_monthly_benefits");
  it("sets promo_shekels_remaining=500 and promo_boost_tokens_remaining=3 on insert", () => {
    expect(fn).toMatch(/promo_shekels_remaining[\s\S]+?promo_boost_tokens_remaining/);
    expect(fn).toMatch(/'granted',\s*\n?\s*500,\s*3/);
  });
});
