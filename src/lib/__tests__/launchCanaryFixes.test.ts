import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const source = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

describe("launch canary fixes", () => {
  it("gives the embedded Stripe checkout dialog an accessible description", () => {
    const checkout = source("src/hooks/useStripeCheckout.tsx");

    expect(checkout).toContain("DialogDescription");
    expect(checkout).toContain("Complete your payment securely with Stripe");
  });

  it("does not hard-code a stale email-template count", () => {
    const audit = source("src/pages/AdminSystemAudit.tsx");

    expect(audit).toContain("Send full suite");
    expect(audit).toContain("every currently registered app and authentication template");
    expect(audit).not.toContain("Send all 20");
    expect(audit).not.toContain("Sends all 20 templates");
  });
});
