/**
 * Stage A (v2 hardening) — Source-contract tests for the centralized debit
 * primitives. Locks the migration invariants for `debit_shekels` and
 * `debit_boost_token`: SECURITY DEFINER pinned search_path, revoked from
 * anon/authenticated, granted to service_role, idempotency via operation_id,
 * kill-switch enforcement, spendable-balance calculation excluding locked
 * royal promo funds, true FIFO grant selection for boost tokens, allocation
 * rows, and admin_audit_log breadcrumbs.
 *
 * Runtime proofs (seeded wallet, real spend, drift check) live in the
 * admin-triggered runtime audit edge function.
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

describe("Stage A v2 — supporting infrastructure", () => {
  it("creates the debit_operations idempotency table", () => {
    expect(allSql).toMatch(/CREATE TABLE IF NOT EXISTS public\.debit_operations/);
    expect(allSql).toMatch(/operation_id\s+uuid PRIMARY KEY/);
  });

  it("creates the boost_token_spend_allocations table with grant FK", () => {
    expect(allSql).toMatch(/CREATE TABLE IF NOT EXISTS public\.boost_token_spend_allocations/);
    expect(allSql).toMatch(
      /royal_pass_grant_id\s+uuid REFERENCES public\.royal_pass_grants\(id\)/,
    );
  });

  it("defines royal_spendable_shekels excluding locked promo grants", () => {
    expect(allSql).toMatch(/CREATE OR REPLACE FUNCTION public\.royal_locked_promo_shekels/);
    expect(allSql).toMatch(/needs_reconciliation/);
    expect(allSql).toMatch(/'disputed','suspended','needs_reconciliation','reversed'/);
  });

  it("defines royal_debits_paused reading the feature flag", () => {
    expect(allSql).toMatch(/CREATE OR REPLACE FUNCTION public\.royal_debits_paused/);
    expect(allSql).toMatch(/royal_pass_debits_paused/);
  });
});

describe("debit_shekels v2", () => {
  it("is SECURITY DEFINER with pinned search_path", () => {
    expect(allSql).toMatch(
      /CREATE OR REPLACE FUNCTION public\.debit_shekels[\s\S]*?SECURITY DEFINER[\s\S]*?SET search_path = public/,
    );
  });

  it("requires an operation_id (idempotency)", () => {
    expect(allSql).toMatch(/debit_shekels: operation_id is required/);
  });

  it("short-circuits duplicate operation_id calls", () => {
    expect(allSql).toMatch(
      /FROM public\.debit_operations[\s\S]*?WHERE operation_id = _operation_id FOR UPDATE/,
    );
    expect(allSql).toMatch(/operation_id reused with different parameters/);
  });

  it("rejects non-positive amounts", () => {
    expect(allSql).toMatch(/debit_shekels: amount must be positive/);
  });

  it("honors the kill switch", () => {
    expect(allSql).toMatch(/debit_shekels: royal_pass_debits_paused/);
  });

  it("locks the wallet row with FOR UPDATE before mutating balance", () => {
    expect(allSql).toMatch(
      /FROM public\.wallets\s+WHERE user_id = _user_id\s+FOR UPDATE/,
    );
  });

  it("compares against the spendable (non-locked) balance", () => {
    expect(allSql).toMatch(/insufficient spendable balance/);
    expect(allSql).toMatch(/royal_locked_promo_shekels\(_user_id\)/);
  });

  it("consumes royal promo shekels FIFO and writes gift_spend_allocations", () => {
    expect(allSql).toMatch(
      /FROM public\.royal_pass_grants[\s\S]*?promo_shekels_remaining[\s\S]*?ORDER BY created_at ASC[\s\S]*?FOR UPDATE/,
    );
    expect(allSql).toMatch(/INSERT INTO public\.gift_spend_allocations/);
  });

  it("writes an admin_audit_log breadcrumb", () => {
    expect(allSql).toMatch(
      /INSERT INTO public\.admin_audit_log[\s\S]*?'debit_shekels'/,
    );
  });

  it("is revoked from anon/authenticated and granted only to service_role", () => {
    expect(allSql).toMatch(
      /REVOKE ALL ON FUNCTION public\.debit_shekels\(uuid, numeric, text, uuid, text, uuid, jsonb\)[\s\S]*?FROM PUBLIC, anon, authenticated/,
    );
    expect(allSql).toMatch(
      /GRANT EXECUTE ON FUNCTION public\.debit_shekels\(uuid, numeric, text, uuid, text, uuid, jsonb\)[\s\S]*?TO service_role/,
    );
  });

  it("drops the legacy non-idempotent signature", () => {
    expect(allSql).toMatch(
      /DROP FUNCTION IF EXISTS public\.debit_shekels\(uuid, numeric, text, text, uuid, jsonb\)/,
    );
  });
});

describe("debit_boost_token v2", () => {
  it("is SECURITY DEFINER with pinned search_path", () => {
    expect(allSql).toMatch(
      /CREATE OR REPLACE FUNCTION public\.debit_boost_token[\s\S]*?SECURITY DEFINER[\s\S]*?SET search_path = public/,
    );
  });

  it("requires an operation_id", () => {
    expect(allSql).toMatch(/debit_boost_token: operation_id is required/);
  });

  it("short-circuits duplicate operation_id calls", () => {
    expect(allSql).toMatch(/debit_boost_token: operation_id reused/);
  });

  it("honors the kill switch", () => {
    expect(allSql).toMatch(/debit_boost_token: royal_pass_debits_paused/);
  });

  it("aggregates and locks token ledger before consumption", () => {
    expect(allSql).toMatch(
      /SELECT COALESCE\(SUM\(delta\), 0\)[\s\S]*?FROM public\.boost_tokens_ledger[\s\S]*?FOR UPDATE/,
    );
  });

  it("raises when no tokens remain", () => {
    expect(allSql).toMatch(/debit_boost_token: no tokens remaining/);
  });

  it("selects the oldest royal grant with remaining boost tokens (true FIFO)", () => {
    expect(allSql).toMatch(
      /FROM public\.royal_pass_grants[\s\S]*?promo_boost_tokens_remaining[\s\S]*?ORDER BY created_at ASC[\s\S]*?FOR UPDATE\s+LIMIT 1/,
    );
  });

  it("records the exact source grant in boost_token_spend_allocations", () => {
    expect(allSql).toMatch(
      /INSERT INTO public\.boost_token_spend_allocations[\s\S]*?royal_pass_grant_id/,
    );
  });

  it("writes a -1 delta row into boost_tokens_ledger", () => {
    expect(allSql).toMatch(/INSERT INTO public\.boost_tokens_ledger[\s\S]*?-1/);
  });

  it("writes an admin_audit_log breadcrumb", () => {
    expect(allSql).toMatch(
      /INSERT INTO public\.admin_audit_log[\s\S]*?'debit_boost_token'/,
    );
  });

  it("is revoked from anon/authenticated and granted only to service_role", () => {
    expect(allSql).toMatch(
      /REVOKE ALL ON FUNCTION public\.debit_boost_token\(uuid, text, uuid, text, uuid, jsonb\)[\s\S]*?FROM PUBLIC, anon, authenticated/,
    );
    expect(allSql).toMatch(
      /GRANT EXECUTE ON FUNCTION public\.debit_boost_token\(uuid, text, uuid, text, uuid, jsonb\)[\s\S]*?TO service_role/,
    );
  });

  it("drops the legacy non-idempotent signature", () => {
    expect(allSql).toMatch(
      /DROP FUNCTION IF EXISTS public\.debit_boost_token\(uuid, text, text, uuid, jsonb\)/,
    );
  });
});
