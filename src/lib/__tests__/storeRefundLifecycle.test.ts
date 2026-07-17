import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

const migrationsDir = join(process.cwd(), "supabase", "migrations");
const allSql = readdirSync(migrationsDir)
  .filter((file) => file.endsWith(".sql"))
  .sort()
  .map((file) => readFileSync(join(migrationsDir, file), "utf8"))
  .join("\n\n");

const webhook = readFileSync(
  join(process.cwd(), "supabase", "functions", "payments-webhook", "index.ts"),
  "utf8",
);

const latestStoreRefund =
  allSql.match(/CREATE OR REPLACE FUNCTION public\.handle_store_refund[\s\S]+?\$function\$;/g)?.slice(-1)[0]
  ?? "";

describe("Store refund lifecycle", () => {
  it("records one terminal reversal per Checkout Session and Stripe event", () => {
    expect(allSql).toMatch(/CREATE TABLE IF NOT EXISTS public\.stripe_store_reversals/);
    expect(allSql).toMatch(/stripe_session_id text NOT NULL UNIQUE/);
    expect(allSql).toMatch(/stripe_event_id text NOT NULL UNIQUE/);
    expect(latestStoreRefund).toMatch(/already_processed/);
    expect(latestStoreRefund).toMatch(/EXCEPTION WHEN unique_violation/);
  });

  it("uses the immutable purchase ledger and locks the wallet before reversal", () => {
    expect(latestStoreRefund).toMatch(/kind IN \('bundle_purchase', 'boost_stripe'\)/);
    expect(latestStoreRefund).toMatch(/FROM public\.wallets[\s\S]+?FOR UPDATE/);
    expect(latestStoreRefund).toMatch(/wallet_balance >= shekels_intended/);
    expect(latestStoreRefund).toMatch(/kind, shekels_delta[\s\S]+?'bundle_refund', -shekels_reversed/);
  });

  it("allows the refund ledger row beside the original Stripe purchase", () => {
    expect(allSql).toMatch(/DROP INDEX IF EXISTS public\.shekel_ledger_stripe_session_unique/);
    expect(allSql).toMatch(
      /CREATE UNIQUE INDEX shekel_ledger_stripe_session_unique[\s\S]+?stripe_session_id IS NOT NULL[\s\S]+?kind <> 'bundle_refund'/,
    );
  });

  it("deactivates Stripe-funded boosts linked to the refunded session", () => {
    expect(latestStoreRefund).toMatch(/array_agg\(DISTINCT reference_id\)/);
    expect(latestStoreRefund).toMatch(/UPDATE public\.boosts[\s\S]+?SET active = false[\s\S]+?id = ANY\(boost_ids\)/);
  });

  it("fails closed into critical reconciliation when credited currency is unavailable", () => {
    expect(latestStoreRefund).toMatch(/needs_reconciliation := true/);
    expect(latestStoreRefund).toMatch(/stripe_store_refund_needs_reconciliation/);
    expect(latestStoreRefund).toMatch(/'critical'/);
    expect(latestStoreRefund).toMatch(/unrecovered_shekels/);
  });

  it("is callable only by the service role", () => {
    expect(allSql).toMatch(
      /REVOKE ALL ON FUNCTION public\.handle_store_refund\(text, text, text\)[\s\S]+?FROM PUBLIC, anon, authenticated/,
    );
    expect(allSql).toMatch(
      /GRANT EXECUTE ON FUNCTION public\.handle_store_refund\(text, text, text\)[\s\S]+?TO service_role/,
    );
  });

  it("routes full refunds through Checkout Session resolution and the atomic RPC", () => {
    expect(webhook).toMatch(/checkout\.sessions\.list\([\s\S]+?payment_intent: paymentIntentId/);
    const refunded = webhook.slice(webhook.indexOf('if (event.type === "charge.refunded")'));
    expect(refunded).toMatch(/isFullRefund[\s\S]+?reverseStorePurchase\(paymentIntentId, "charge\.refunded"\)/);
    expect(refunded).toMatch(/handle_royal_refund/);
  });

  it("releases the event claim and asks Stripe to retry failed reversals", () => {
    expect(webhook).toMatch(
      /refund handler error[\s\S]+?throw e;/,
    );
    expect(webhook).toMatch(
      /dispute handler error[\s\S]+?throw e;/,
    );
    expect(webhook).toMatch(
      /handler error for \$\{event\.id\}[\s\S]+?from\("stripe_events"\)\.delete\(\)\.eq\("id", event\.id\)[\s\S]+?jsonError\(500, "handler_error"/,
    );
  });

  it("also reverses Store entitlements on terminal dispute loss", () => {
    expect(webhook).toMatch(
      /event\.type === "charge\.dispute\.funds_withdrawn"[\s\S]+?reverseStorePurchase\(paymentIntentId, "charge\.dispute\.funds_withdrawn"\)/,
    );
    expect(webhook).toMatch(
      /dispute\.status === "lost"[\s\S]+?reverseStorePurchase\(paymentIntentId, "charge\.dispute\.closed:lost"\)/,
    );
  });
});
