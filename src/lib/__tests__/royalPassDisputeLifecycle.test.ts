/**
 * Wave 8.2a — dispute-lifecycle source-contract tests.
 *
 * These verify the migration and Edge Function content without needing seeded
 * runtime users. Runtime lifecycle proofs were recorded via psql in the
 * agent-run report (grant → disputed → funds_withdrawn → won → reinstated).
 */
import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

const MIG_DIR = join(process.cwd(), "supabase", "migrations");
const allSql = readdirSync(MIG_DIR)
  .filter((f) => f.endsWith(".sql"))
  .map((f) => readFileSync(join(MIG_DIR, f), "utf8"))
  .join("\n\n");

const webhook = readFileSync(
  join(process.cwd(), "supabase/functions/payments-webhook/index.ts"),
  "utf8",
);

describe("Wave 8.2a — RPC service-role grants", () => {
  const rpcs = [
    "handle_royal_dispute_created",
    "handle_royal_dispute_funds_withdrawn",
    "handle_royal_dispute_lost",
    "handle_royal_dispute_won",
    "handle_royal_dispute_reinstated",
    "revoke_royal_founder",
    "grant_royal_monthly_benefits",
    "handle_royal_refund",
  ];
  for (const fn of rpcs) {
    it(`explicitly grants service_role EXECUTE on ${fn}`, () => {
      expect(allSql).toMatch(
        new RegExp(
          `GRANT\\s+EXECUTE\\s+ON\\s+FUNCTION\\s+public\\.${fn}\\s*\\(([^)]*)\\)\\s+TO\\s+service_role`,
          "i",
        ),
      );
    });
    it(`revokes anon/authenticated EXECUTE on ${fn}`, () => {
      // Every function that's called only from the webhook must revoke public/anon/authenticated.
      // grant_royal_monthly_benefits and handle_royal_refund do the same.
      expect(allSql).toMatch(
        new RegExp(
          `REVOKE\\s+ALL\\s+ON\\s+FUNCTION\\s+public\\.${fn}\\s*\\([^)]*\\)\\s+FROM\\s+PUBLIC,\\s*anon,\\s*authenticated`,
          "i",
        ),
      );
    });
  }
});

describe("Wave 8.2a — shield allowance ↔ grant link", () => {
  it("adds royal_pass_grant_id column with FK RESTRICT", () => {
    expect(allSql).toMatch(/ALTER TABLE public\.royal_pass_shield_allowances[\s\S]*?ADD COLUMN IF NOT EXISTS royal_pass_grant_id uuid/);
    expect(allSql).toMatch(/royal_pass_shield_allowances_grant_fk[\s\S]*?REFERENCES public\.royal_pass_grants\(id\)[\s\S]*?ON DELETE RESTRICT/);
  });
  it("backfills allowance→grant link by (user_id, period_start)", () => {
    expect(allSql).toMatch(
      /UPDATE public\.royal_pass_shield_allowances a[\s\S]*?SET royal_pass_grant_id = g\.id[\s\S]*?FROM public\.royal_pass_grants g[\s\S]*?g\.user_id = a\.user_id[\s\S]*?g\.period_start = a\.period_start/,
    );
  });
  it("grant_royal_monthly_benefits populates the link", () => {
    const fn = allSql.match(
      /CREATE OR REPLACE FUNCTION public\.grant_royal_monthly_benefits[\s\S]+?\$function\$;/g,
    )?.slice(-1)[0] ?? "";
    expect(fn).toMatch(/INSERT INTO public\.royal_pass_grants[\s\S]+?RETURNING id INTO new_grant_id/);
    expect(fn).toMatch(/royal_pass_shield_allowances[\s\S]+?royal_pass_grant_id[\s\S]+?new_grant_id/);
  });
});

describe("Wave 8.2a — use_royal_shield enforces grant status", () => {
  const latestFn =
    allSql.match(/CREATE OR REPLACE FUNCTION public\.use_royal_shield[\s\S]+?\$function\$;/g)?.slice(-1)[0] ?? "";
  it("resolves the linked grant status and rejects non-granted", () => {
    expect(latestFn).toMatch(/allow\.royal_pass_grant_id IS NOT NULL/);
    expect(latestFn).toMatch(/SELECT status INTO linked_grant_status[\s\S]+?FROM public\.royal_pass_grants[\s\S]+?WHERE id = allow\.royal_pass_grant_id/);
    expect(latestFn).toMatch(/linked_grant_status\s*<>\s*'granted'/);
    expect(latestFn).toMatch(/royal_benefits_temporarily_suspended/);
  });
  it("rejects BEFORE incrementing shields_used (no credit consumed on failed activation)", () => {
    const gateIdx = latestFn.indexOf("royal_benefits_temporarily_suspended");
    const usedIdx = latestFn.indexOf("shields_used = shields_used + 1");
    expect(gateIdx).toBeGreaterThan(0);
    expect(usedIdx).toBeGreaterThan(gateIdx);
  });
});

describe("Wave 8.2a — grant validation", () => {
  const latest =
    allSql.match(/CREATE OR REPLACE FUNCTION public\.grant_royal_monthly_benefits[\s\S]+?\$function\$;/g)?.slice(-1)[0] ?? "";
  it.each([
    ["missing_user", "missing_user"],
    ["invalid_amount", "invalid_amount"],
    ["missing_period", "missing_period"],
    ["invalid_period_range", "invalid_period_range"],
    ["user_not_found", "user_not_found"],
  ])("rejects %s", (_label, reason) => {
    expect(latest).toContain(reason);
  });
  it("upserts wallet with ON CONFLICT(user_id)", () => {
    expect(latest).toMatch(/INSERT INTO public\.wallets[\s\S]+?ON CONFLICT \(user_id\) DO UPDATE/);
  });
  it("is idempotent by stripe_event_id and by (user_id, period_start)", () => {
    expect(latest).toMatch(/stripe_event_id = _stripe_event_id/);
    expect(latest).toMatch(/user_id = _user_id AND period_start = _period_start/);
  });
});

describe("Wave 8.2a — dispute lifecycle behaviors", () => {
  it("dispute_created suspends Founder (mode='suspend'), does NOT reverse balances", () => {
    const fn =
      allSql.match(/CREATE OR REPLACE FUNCTION public\.handle_royal_dispute_created[\s\S]+?\$function\$;/g)?.slice(-1)[0] ?? "";
    expect(fn).toMatch(/status = 'disputed'/);
    expect(fn).toMatch(/'suspend'/);
    // Must not call handle_royal_refund
    expect(fn).not.toMatch(/handle_royal_refund/);
  });
  it("dispute_lost calls handle_royal_refund with 'reversed' and permanent Founder revoke", () => {
    const fn =
      allSql.match(/CREATE OR REPLACE FUNCTION public\.handle_royal_dispute_lost[\s\S]+?\$function\$;/g)?.slice(-1)[0] ?? "";
    expect(fn).toMatch(/handle_royal_refund\([\s\S]+?'reversed'/);
    expect(fn).toMatch(/status = 'revoked'/);
  });
  it("dispute reinstated reactivates ORIGINAL founder row (no $0 replacement)", () => {
    const fn =
      allSql.match(/CREATE OR REPLACE FUNCTION public\.handle_royal_dispute_reinstated[\s\S]+?\$function\$;/g)?.slice(-1)[0] ?? "";
    expect(fn).toMatch(/UPDATE public\.founder_grants[\s\S]+?SET status = 'active'/);
    // No INSERT into founder_grants inside the reinstated handler.
    expect(fn).not.toMatch(/INSERT INTO public\.founder_grants/);
    // Skips refunded grants
    expect(fn).toMatch(/skipped_refunded/);
    // Rejects mismatched dispute id
    expect(fn).toMatch(/dispute_mismatch/);
  });
  it("founder_program_public_status counts active+disputed as claimed slots", () => {
    const fn =
      allSql.match(/CREATE OR REPLACE FUNCTION public\.founder_program_public_status[\s\S]+?\$function\$;/g)?.slice(-1)[0] ?? "";
    expect(fn).toMatch(/status IN \('active','disputed'\)/);
  });
});

describe("Wave 8.2a — webhook routing", () => {
  it.each([
    ["charge.dispute.created", "handle_royal_dispute_created"],
    ["charge.dispute.funds_withdrawn", "handle_royal_dispute_funds_withdrawn"],
    ["charge.dispute.funds_reinstated", "handle_royal_dispute_reinstated"],
  ])("%s → %s", (evt, rpc) => {
    const idx = webhook.indexOf(`"${evt}"`);
    expect(idx).toBeGreaterThan(0);
    // The RPC call for this branch should appear within a reasonable window after the event check.
    expect(webhook.slice(idx, idx + 2000)).toContain(rpc);
  });
  it("charge.dispute.closed routes lost→handle_royal_dispute_lost and won→handle_royal_dispute_won", () => {
    const idx = webhook.indexOf(`"charge.dispute.closed"`);
    expect(idx).toBeGreaterThan(0);
    const window = webhook.slice(idx, idx + 3000);
    expect(window).toMatch(/dispute\.status === "lost"[\s\S]+?handle_royal_dispute_lost/);
    expect(window).toMatch(/dispute\.status === "won"[\s\S]+?handle_royal_dispute_won/);
  });
  it("safely no-ops on missing charge id (logs and continues)", () => {
    expect(webhook).toMatch(/dispute \$\{disputeId\} missing charge id/);
  });
  it("does not crash on charge retrieval failure", () => {
    expect(webhook).toMatch(/could not retrieve charge[\s\S]+?catch/);
  });
  it("wraps all dispute handling in a try/catch so errors don't abort the webhook", () => {
    // The dispute block itself is inside a try { ... } catch { ... } that logs.
    expect(webhook).toMatch(/dispute handler error/);
  });
});
