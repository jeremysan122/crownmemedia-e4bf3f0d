/**
 * Stage A — Source-contract tests for the centralized debit primitives.
 *
 * These lock the migration invariants for `debit_shekels` and
 * `debit_boost_token`: SECURITY DEFINER, revoked from anon/authenticated,
 * granted to service_role, positive-amount guard, wallet FOR UPDATE lock,
 * insufficient-balance error path, and ledger row insertion.
 *
 * Runtime proofs (seeded wallet, real spend, drift check) remain deferred
 * to the admin-triggered runtime audit edge function.
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

describe("debit_shekels primitive", () => {
  it("is defined as SECURITY DEFINER with a pinned search_path", () => {
    expect(allSql).toMatch(
      /CREATE OR REPLACE FUNCTION public\.debit_shekels[\s\S]*?SECURITY DEFINER[\s\S]*?SET search_path = public/,
    );
  });

  it("rejects non-positive amounts", () => {
    expect(allSql).toMatch(/debit_shekels: amount must be positive/);
  });

  it("requires a reason_code", () => {
    expect(allSql).toMatch(/debit_shekels: reason_code is required/);
  });

  it("locks the wallet row with FOR UPDATE before mutating balance", () => {
    expect(allSql).toMatch(
      /FROM public\.wallets\s+WHERE user_id = _user_id\s+FOR UPDATE/,
    );
  });

  it("raises on insufficient balance", () => {
    expect(allSql).toMatch(/debit_shekels: insufficient balance/);
  });

  it("writes a debit row into shekel_ledger with kind='debit'", () => {
    expect(allSql).toMatch(
      /INSERT INTO public\.shekel_ledger[\s\S]*?'debit'[\s\S]*?-_amount/,
    );
  });

  it("is revoked from anon and authenticated, granted only to service_role", () => {
    expect(allSql).toMatch(
      /REVOKE ALL ON FUNCTION public\.debit_shekels[\s\S]*?FROM PUBLIC, anon, authenticated/,
    );
    expect(allSql).toMatch(
      /GRANT EXECUTE ON FUNCTION public\.debit_shekels[\s\S]*?TO service_role/,
    );
  });
});

describe("debit_boost_token primitive", () => {
  it("is SECURITY DEFINER with pinned search_path", () => {
    expect(allSql).toMatch(
      /CREATE OR REPLACE FUNCTION public\.debit_boost_token[\s\S]*?SECURITY DEFINER[\s\S]*?SET search_path = public/,
    );
  });

  it("requires a reason_code", () => {
    expect(allSql).toMatch(/debit_boost_token: reason_code is required/);
  });

  it("aggregates and locks token ledger before consumption", () => {
    expect(allSql).toMatch(
      /SELECT COALESCE\(SUM\(delta\), 0\)[\s\S]*?FROM public\.boost_tokens_ledger[\s\S]*?FOR UPDATE/,
    );
  });

  it("raises when no tokens remain", () => {
    expect(allSql).toMatch(/debit_boost_token: no tokens remaining/);
  });

  it("prefers royal-source tokens before purchased (FIFO by source)", () => {
    expect(allSql).toMatch(/reason ILIKE 'royal%'/);
    expect(allSql).toMatch(/'source', _source/);
  });

  it("writes a -1 delta row into boost_tokens_ledger", () => {
    expect(allSql).toMatch(
      /INSERT INTO public\.boost_tokens_ledger[\s\S]*?-1/,
    );
  });

  it("is revoked from anon and authenticated, granted only to service_role", () => {
    expect(allSql).toMatch(
      /REVOKE ALL ON FUNCTION public\.debit_boost_token[\s\S]*?FROM PUBLIC, anon, authenticated/,
    );
    expect(allSql).toMatch(
      /GRANT EXECUTE ON FUNCTION public\.debit_boost_token[\s\S]*?TO service_role/,
    );
  });
});
