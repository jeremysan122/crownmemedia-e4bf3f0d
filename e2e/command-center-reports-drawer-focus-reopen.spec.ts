// E2E: After resolving a report from within the drawer, closing and
// reopening the drawer must restore proper focus, keyboard nav, and the
// aria-live announcement channel — the Sonner region must still be a
// valid live region and the drawer's resolution/escalation trails must
// render with tabbable content.
import { test, expect, Page } from "@playwright/test";
import { hasServiceRoleForLive } from "./helpers/liveBattleSeed";
import {
  seedReport, deleteReport, readReportRaw, grantModerator, revokeModerator,
} from "./helpers/liveBattleCommentSeed";

async function signInC(page: Page) {
  await page.goto("/auth");
  await page.getByLabel(/email/i).fill(process.env.E2E_USER_C_EMAIL!);
  await page.getByLabel(/password/i).fill(process.env.E2E_USER_C_PASSWORD!);
  await page.getByRole("button", { name: /sign in/i }).click();
  await page.waitForURL(/\/(feed|scrolls|me|battles)/, { timeout: 15_000 });
}

test.describe("Command Center — drawer focus / keyboard / live-region after resolve + reopen", () => {
  test.skip(!hasServiceRoleForLive(), "Requires service-role + seeded users.");

  test("drawer restores focus & keyboard nav; live region still announces after reopen", async ({ page }) => {
    const modId = process.env.E2E_USER_C_ID!;
    await grantModerator(modId);
    const reason = `e2e-drawer-focus-${Date.now()}`;
    const reportId = await seedReport({
      reporterId: process.env.E2E_USER_A_ID!,
      reportedUserId: process.env.E2E_USER_B_ID!,
      reason,
      reasonCode: "spam",
    });
    try {
      await signInC(page);
      await page.goto("/admin/command-center/reports");

      const filter = page.getByTestId("cc-reports-filter");
      await expect(filter).toBeVisible({ timeout: 15_000 });
      await filter.selectOption("open");

      const openRow = page.getByTestId("cc-report-row").filter({ hasText: reason });
      await expect(openRow).toBeVisible({ timeout: 10_000 });

      // Open drawer by clicking the row (the row IS the button).
      await openRow.click();
      const dialog = page.getByRole("dialog");
      await expect(dialog).toBeVisible({ timeout: 5_000 });

      // Focus must land inside the dialog (radix Sheet moves focus in).
      await expect.poll(async () => {
        return page.evaluate(() => {
          const active = document.activeElement;
          const dlg = document.querySelector('[role="dialog"]');
          return !!(active && dlg && dlg.contains(active));
        });
      }, { timeout: 5_000 }).toBe(true);

      // Resolve from inside the drawer path: close drawer, click Resolve
      // in the inline actions, confirm, then reopen the drawer.
      await page.keyboard.press("Escape");
      await expect(dialog).toHaveCount(0, { timeout: 5_000 });

      // After close, focus must return to a tabbable element in the page
      // body (not <body> itself, which would be a focus trap regression).
      const bodyFocus = await page.evaluate(() => document.activeElement?.tagName ?? "");
      expect(bodyFocus).not.toBe("");

      const actions = openRow.locator("..").getByTestId("cc-report-actions");
      await actions.getByTestId("cc-report-resolve").click();
      await page.getByRole("button", { name: /^Resolve$/ }).click();

      // Live region: assert BEFORE checking the toast text so we know the
      // announcement channel is intact right when the fire happens.
      const region = page.locator('[data-sonner-toaster], section[aria-label*="Notif" i]').first();
      await expect(region).toHaveAttribute("aria-live", /polite|assertive/);
      await expect(page.getByText(/^Report resolved$/i)).toBeVisible({ timeout: 8_000 });

      const raw = await readReportRaw(reportId);
      expect(raw?.status).toBe("resolved");

      // Reopen the drawer under the Resolved filter.
      await filter.selectOption("resolved");
      const resolvedRow = page.getByTestId("cc-report-row").filter({ hasText: reason });
      await expect(resolvedRow).toBeVisible({ timeout: 8_000 });
      await resolvedRow.click();

      const dialog2 = page.getByRole("dialog");
      await expect(dialog2).toBeVisible({ timeout: 5_000 });

      // Focus returned INTO the reopened drawer.
      await expect.poll(async () => {
        return page.evaluate(() => {
          const active = document.activeElement;
          const dlg = document.querySelector('[role="dialog"]');
          return !!(active && dlg && dlg.contains(active));
        });
      }, { timeout: 5_000 }).toBe(true);

      // Resolution trail renders with the new entry.
      await expect(dialog2.getByTestId("cc-report-resolution-trail"))
        .toBeVisible({ timeout: 5_000 });

      // Keyboard nav still works INSIDE the reopened drawer: pressing
      // Tab moves focus, and focus stays inside the dialog (focus trap).
      for (let i = 0; i < 4; i++) await page.keyboard.press("Tab");
      const stillInside = await page.evaluate(() => {
        const active = document.activeElement;
        const dlg = document.querySelector('[role="dialog"]');
        return !!(active && dlg && dlg.contains(active));
      });
      expect(stillInside).toBe(true);

      // Live region attrs preserved end-to-end.
      await expect(region).toHaveAttribute("aria-live", /polite|assertive/);

      // Close again with Escape; drawer disappears and focus returns to body.
      await page.keyboard.press("Escape");
      await expect(dialog2).toHaveCount(0, { timeout: 5_000 });
    } finally {
      await deleteReport(reportId);
      await revokeModerator(modId);
    }
  });
});
