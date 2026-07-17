import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const readRepoFile = (path: string) => readFileSync(join(process.cwd(), path), "utf8");

describe("provider payment integrity contracts", () => {
  it("keeps Stripe bundle accounting separate from boost line items", () => {
    const webhook = readRepoFile("supabase/functions/payments-webhook/index.ts");
    expect(webhook).toContain("let bundleUsd = 0");
    expect(webhook).toContain("bundleUsd += itemUsd");
    expect(webhook).toContain("_usd_amount: bundleUsd");
    expect(webhook).toContain("stripe_payment_intent_id: oneTimePaymentIntentId");
    expect(webhook).toContain('rpc("reverse_stripe_one_time_purchase"');
  });

  it("fails RevenueCat paid delivery for unmapped products", () => {
    const webhook = readRepoFile("supabase/functions/revenuecat-webhook/index.ts");
    expect(webhook).toContain("Unrecognized paid RevenueCat product");
    expect(webhook).toContain("No Shekel bundle mapping for paid product");
  });

  it("reverses refunded RevenueCat consumables through a service-only RPC", () => {
    const webhook = readRepoFile("supabase/functions/revenuecat-webhook/index.ts");
    const migration = readRepoFile("supabase/migrations/20260717100000_provider_payment_integrity.sql");
    expect(webhook).toContain('rpc("reverse_provider_shekel_purchase"');
    expect(migration).toContain("CREATE OR REPLACE FUNCTION public.reverse_provider_shekel_purchase");
    expect(migration).toMatch(
      /REVOKE ALL ON FUNCTION public\.reverse_provider_shekel_purchase[\s\S]*FROM PUBLIC, anon, authenticated/,
    );
    expect(migration).toMatch(
      /GRANT EXECUTE ON FUNCTION public\.reverse_provider_shekel_purchase[\s\S]*TO service_role/,
    );
  });

  it("makes Stripe one-time refunds and lost disputes atomic and service-only", () => {
    const migration = readRepoFile("supabase/migrations/20260717100000_provider_payment_integrity.sql");
    expect(migration).toContain("CREATE OR REPLACE FUNCTION public.reverse_stripe_one_time_purchase");
    expect(migration).toMatch(
      /REVOKE ALL ON FUNCTION public\.reverse_stripe_one_time_purchase[\s\S]*FROM PUBLIC, anon, authenticated/,
    );
    expect(migration).toMatch(
      /GRANT EXECUTE ON FUNCTION public\.reverse_stripe_one_time_purchase[\s\S]*TO service_role/,
    );
  });
});
