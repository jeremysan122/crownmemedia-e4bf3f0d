// E2E: The moderation-panel escalate and resolve toasts must announce
// through Sonner's polite live region so screen-reader users hear the
// action confirmation. On reconnect (offline → online round-trip) the
// same action must NOT re-fire a duplicate toast — realtime backfills
// can resend rows, and we require each moderator action to produce
// exactly one announcement.
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

// Sonner mounts a single ordered list under section[aria-label]. Every
// individual toast <li> is role=status + aria-live=polite. We count
// distinct toasts that match a reason substring — dedupe is the point.
async function toastCountMatching(page: Page, needle: string | RegExp): Promise<number> {
  const rx = typeof needle === "string" ? new RegExp(needle.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i") : needle;
  return page.evaluate((pattern) => {
    const re = new RegExp(pattern, "i");
    const items = Array.from(document.querySelectorAll('[data-sonner-toast], li[data-sonner-toast]'));
    // Fallback for older sonner: any role=status li under sonner section.
    const fallback = Array.from(document.querySelectorAll('section[aria-label*="Notif" i] li[role="status"], ol[data-sonner-toaster] li'));
    const all = items.length ? items : fallback;
    return all.filter((el) => re.test((el as HTMLElement).innerText || "")).length;
  }, rx.source);
}

test.describe("Command Center — escalate/resolve toasts announce politely, no dupe on reconnect", () => {
  test.skip(!hasServiceRoleForLive(), "Requires service-role + seeded users.");

  test("polite announcement fires exactly once per action across reconnect", async ({ page, context }) => {
    const modId = process.env.E2E_USER_C_ID!;
    const reporterId = process.env.E2E_USER_A_ID!;
    const reportedId = process.env.E2E_USER_B_ID!;
    await grantModerator(modId);
    const reason = `e2e-toast-aria-${Date.now()}`;
    const reportId = await seedReport({
      reporterId, reportedUserId: reportedId, reason, reasonCode: "harassment",
    });
    try {
      await signInC(page);
      await page.goto("/admin/command-center/reports");

      const filter = page.getByTestId("cc-reports-filter");
      await expect(filter).toBeVisible({ timeout: 15_000 });
      await filter.selectOption("open");

      const openRow = page.getByTestId("cc-report-row").filter({ hasText: reason });
      await expect(openRow).toBeVisible({ timeout: 10_000 });

      // ── Step 1: Escalate — verify aria-live wrapper + toast copy ───────
      await openRow.locator("..").getByTestId("cc-report-actions")
        .getByTestId("cc-report-escalate").click();
      await page.getByRole("button", { name: /^Escalate$/ }).click();

      // Sonner's toaster region is aria-live=polite. The rendered toast
      // <li> inherits role=status. Both must be present when it fires.
      const region = page.locator('[data-sonner-toaster], section[aria-label*="Notif" i]').first();
      await expect(region).toHaveAttribute("aria-live", /polite|assertive/);

      const escToast = page.getByText(/Report escalated for senior review/i);
      await expect(escToast).toBeVisible({ timeout: 8_000 });
      // Toast text carries the reason + resolver — screen readers read both.
      await expect(escToast.locator("xpath=ancestor::li[1]")).toContainText(reason);

      // Exactly one live toast for this action right now.
      expect(await toastCountMatching(page, /Report escalated for senior review/i)).toBe(1);

      // Let it dismiss so we can independently detect any duplicate re-fire.
      await page.waitForTimeout(6000);
      await expect(escToast).toHaveCount(0);

      // ── Reconnect round-trip: realtime updates may re-arrive; the client
      // must NOT re-toast the escalate action.
      await context.setOffline(true);
      await page.waitForTimeout(600);
      await context.setOffline(false);
      await page.waitForTimeout(2500);
      // No duplicate escalation toast surfaced from the reconnect backfill.
      expect(await toastCountMatching(page, /Report escalated for senior review/i)).toBe(0);

      // Confirm server state independently.
      let raw = await readReportRaw(reportId);
      expect(raw?.status).toBe("escalated");

      // ── Step 2: Resolve — same aria-live contract, same no-dupe rule ───
      await filter.selectOption("escalated");
      const escRow = page.getByTestId("cc-report-row").filter({ hasText: reason });
      await expect(escRow).toBeVisible({ timeout: 8_000 });
      await escRow.locator("..").getByTestId("cc-report-actions")
        .getByTestId("cc-report-resolve").click();
      await page.getByRole("button", { name: /^Resolve$/ }).click();

      const resToast = page.getByText(/^Report resolved$/i);
      await expect(resToast).toBeVisible({ timeout: 8_000 });
      // Description carries reason for the screen-reader announcement.
      await expect(resToast.locator("xpath=ancestor::li[1]")).toContainText(reason);
      expect(await toastCountMatching(page, /^Report resolved$/i)).toBe(1);

      // Live region still valid (attrs not swapped between fires).
      await expect(region).toHaveAttribute("aria-live", /polite|assertive/);

      await page.waitForTimeout(6000);
      await expect(resToast).toHaveCount(0);

      await context.setOffline(true);
      await page.waitForTimeout(600);
      await context.setOffline(false);
      await page.waitForTimeout(2500);
      expect(await toastCountMatching(page, /^Report resolved$/i)).toBe(0);

      raw = await readReportRaw(reportId);
      expect(raw?.status).toBe("resolved");
      expect(raw?.resolved_by).toBe(modId);
    } finally {
      await deleteReport(reportId);
      await revokeModerator(modId);
    }
  });
});
