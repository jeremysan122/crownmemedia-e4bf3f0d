/**
 * Platform-aware purchase gate.
 *
 * Apple App Store and Google Play require in-app purchase (IAP) for
 * digital goods consumed inside the app. On the web/PWA we keep using
 * Stripe. RevenueCat unifies the native IAP surface.
 *
 * Usage:
 *   if (shouldUseIAP()) renderRevenueCatButton();
 *   else renderStripeCheckoutButton();
 */

type Platform = "web" | "ios" | "android";

let cached: Platform | null = null;

export function getPlatform(): Platform {
  if (cached) return cached;
  // Lazy import keeps web bundle free of Capacitor at runtime when not native.
  try {
    // @ts-expect-error - Capacitor global is only present in native shells.
    const cap = (globalThis as any).Capacitor;
    if (cap?.isNativePlatform?.()) {
      const p = cap.getPlatform?.();
      if (p === "ios" || p === "android") {
        cached = p;
        return p;
      }
    }
  } catch {
    /* noop */
  }
  cached = "web";
  return "web";
}

/** True when the running surface must use store billing (RevenueCat). */
export function shouldUseIAP(): boolean {
  const p = getPlatform();
  return p === "ios" || p === "android";
}

/** Apple requires IAP for digital goods. Stricter than Android. */
export function isAppleStrict(): boolean {
  return getPlatform() === "ios";
}

/** Stable label used in analytics + payment_transactions.environment_tag. */
export function purchaseProvider(): "stripe" | "revenuecat" {
  return shouldUseIAP() ? "revenuecat" : "stripe";
}
