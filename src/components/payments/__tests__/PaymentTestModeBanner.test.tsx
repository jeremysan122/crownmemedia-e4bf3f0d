import { describe, expect, it } from "vitest";
import { shouldShowPaymentDiagnostics } from "@/components/payments/PaymentTestModeBanner";

describe("PaymentTestModeBanner", () => {
  it("keeps missing-payment diagnostics out of production builds", () => {
    expect(shouldShowPaymentDiagnostics(false)).toBe(false);
    expect(shouldShowPaymentDiagnostics(true)).toBe(true);
  });
});
