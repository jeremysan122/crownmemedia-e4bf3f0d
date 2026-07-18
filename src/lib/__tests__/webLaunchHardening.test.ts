import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
const read = (path: string) => readFileSync(join(root, path), "utf8");

const webhook = read("supabase/functions/payments-webhook/index.ts");
const verifyPurchase = read("supabase/functions/verify-purchase/index.ts");
const createCheckout = read("supabase/functions/create-checkout/index.ts");
const sharedStripe = read("supabase/functions/_shared/stripe.ts");
const fulfillmentMigration = read(
  "supabase/migrations/20260718010000_atomic_store_checkout_fulfillment.sql",
);
const eventClaimsMigration = read(
  "supabase/migrations/20260718011000_retryable_stripe_event_claims.sql",
);
const preferences = read("src/pages/Preferences.tsx");
const upload = read("src/pages/Upload.tsx");
const auth = read("src/context/AuthContext.tsx");

describe("web launch payment hardening", () => {
  it("rejects a misrouted webhook instead of acknowledging and losing it", () => {
    expect(webhook).toMatch(/jsonError\(400, "invalid_environment"/);
    expect(webhook).not.toMatch(/received: true, ignored: "invalid env"/);
  });

  it("distinguishes completed, concurrent, and failed event deliveries", () => {
    expect(webhook).toMatch(/rpc\("claim_stripe_event"/);
    expect(webhook).toMatch(/claim\.duplicate/);
    expect(webhook).toMatch(/event_in_progress/);
    expect(webhook).toMatch(/failEvent\(err\)/);
    expect(eventClaimsMigration).toMatch(/processed_at timestamptz/);
    expect(eventClaimsMigration).toMatch(/last_error text/);
    expect(eventClaimsMigration).toMatch(/interval '5 minutes'/);
  });

  it("keeps sandbox money flows disabled unless the server explicitly enables them", () => {
    expect(sharedStripe).toMatch(/PAYMENTS_ENABLE_SANDBOX/);
    expect(sharedStripe).toMatch(/env === "live" \|\|/);
    expect(createCheckout).toMatch(/isStripeEnvironmentEnabled\(environment\)/);
    expect(webhook).toMatch(/isStripeEnvironmentEnabled\(env\)/);
    expect(verifyPurchase).toMatch(/isStripeEnvironmentEnabled\(env\)/);
  });

  it("fulfills Store purchases in one service-role-only database transaction", () => {
    expect(fulfillmentMigration).toMatch(/CREATE OR REPLACE FUNCTION public\.fulfill_store_checkout/);
    expect(fulfillmentMigration).toMatch(/pg_advisory_xact_lock/);
    expect(fulfillmentMigration).toMatch(/ON CONFLICT \(user_id\) DO UPDATE/);
    expect(fulfillmentMigration).toMatch(/INSERT INTO public\.boosts/);
    expect(fulfillmentMigration).toMatch(/INSERT INTO public\.shekel_ledger/);
    expect(fulfillmentMigration).toMatch(/REVOKE ALL ON FUNCTION public\.fulfill_store_checkout[\s\S]+FROM PUBLIC, anon, authenticated/);
    expect(fulfillmentMigration).toMatch(/GRANT EXECUTE ON FUNCTION public\.fulfill_store_checkout[\s\S]+TO service_role/);
    expect(webhook).toMatch(/rpc\("fulfill_store_checkout"/);
    expect(verifyPurchase).toMatch(/rpc\("fulfill_store_checkout"/);
  });

  it("fails paid unknown products closed rather than acknowledging them", () => {
    expect(webhook).toMatch(/throw new Error\(`Unknown paid line item/);
    expect(verifyPurchase).toMatch(/throw new Error\(`Unknown paid Store line item/);
  });
});

describe("web launch preference truthfulness", () => {
  it("only exposes preferences the web app currently enforces", () => {
    expect(preferences).not.toMatch(/Coming soon/i);
    expect(preferences).not.toMatch(/Who can message me/);
    expect(preferences).not.toMatch(/Quiet hours/);
    expect(preferences).not.toMatch(/Autoplay videos on cellular/);
    expect(preferences).not.toMatch(/Default battle stake/);
  });

  it("applies the remaining upload and accessibility preferences", () => {
    expect(upload).toMatch(/profile\?\.default_category/);
    expect(upload).toMatch(/CATEGORIES\.includes\(preferred\)/);
    expect(auth).toMatch(/crownme-reduce-motion/);
    expect(auth).toMatch(/crownme-larger-text/);
    expect(auth).toMatch(/crownme-high-contrast/);
  });
});
