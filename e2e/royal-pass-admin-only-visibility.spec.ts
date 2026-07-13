/**
 * Non-admin visitors must NEVER see admin-only UI on Royal Pass surfaces.
 *
 * We hit /store?tab=pass and /royal-pass unauthenticated (public visitor) and
 * assert that markers we intentionally attach to admin-only UI regions —
 * "Admin tools", "Refresh Entitlements from Stripe", verification-timeline
 * labels — are absent from the DOM. Production build is exercised via the
 * live Vite dev server (same code paths, no auth session).
 */
import { expect, test } from "@playwright/test";

const ADMIN_ONLY_NEEDLES = [
  "Admin tools",
  "Refresh Entitlements from Stripe",
  "Admin · verification",
  "Stripe payment received",
  "Webhook delivered",
  "Ledger entry recorded",
  "Waiting for Stripe to ping our webhook",
];

test.describe("Royal Pass admin-only visibility", () => {
  test.beforeEach(async ({ context }) => {
    // Ensure we're an anonymous visitor — no Supabase session in localStorage.
    await context.clearCookies();
  });

  for (const path of ["/store?tab=pass", "/royal-pass"]) {
    test(`no admin-only UI leaks on ${path}`, async ({ page }) => {
      await page.goto(path, { waitUntil: "domcontentloaded" });
      // Give the page a beat to render its client-side gate.
      await page.waitForTimeout(500);

      const html = await page.content();
      for (const needle of ADMIN_ONLY_NEEDLES) {
        expect(html, `"${needle}" leaked on ${path} for non-admin visitor`).not.toContain(needle);
      }

      // Any element carrying a data-admin-only marker must not be rendered.
      const adminMarkers = await page.locator("[data-admin-only]").count();
      expect(adminMarkers, `data-admin-only element rendered on ${path}`).toBe(0);
    });
  }
});
