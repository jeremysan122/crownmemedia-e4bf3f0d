// E2E: Dismiss / Suspend / Ban flows. Each action must:
//   - Fire a Sonner toast inside an aria-live=polite region.
//   - Persist to server (status change; suspend/ban resolves the report).
//   - Correctly update inline action buttons: after a resolving action
//     the entire cc-report-actions row disappears from the list.
//   - Survive an offline → online reconnect without re-firing the toast
//     or resurrecting the action buttons.
import { test, expect, Page } from "@playwright/test";
import { hasServiceRoleForLive, adminClient } from "./helpers/liveBattleSeed";
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

async function clearUserFlags(userId: string) {
  const admin = adminClient();
  await admin.from("profiles")
    .update({ is_suspended: false, is_banned: false })
    .eq("id", userId);
}

test.describe("Command Center — dismiss / suspend / ban toasts + reconnect", () => {
  test.skip(!hasServiceRoleForLive(), "Requires service-role + seeded users.");

  test("each action announces politely once and buttons update after reconnect", async ({ page, context }) => {
    const modId = process.env.E2E_USER_C_ID!;
    const reportedId = process.env.E2E_USER_B_ID!;
    await grantModerator(modId);

    const cases: Array<{
      kind: "dismiss" | "suspend" | "ban";
      buttonName: RegExp;
      confirmName: RegExp;
      toastRx: RegExp;
    }> = [
      { kind: "dismiss", buttonName: /^Dismiss$/, confirmName: /^Dismiss$/, toastRx: /^Report dismissed$/i },
      { kind: "suspend", buttonName: /^Suspend user$/, confirmName: /^Suspend user$/, toastRx: /User suspended & report resolved/i },
      { kind: "ban",     buttonName: /^Ban user$/,     confirmName: /^Ban user$/,     toastRx: /User banned & report resolved/i },
    ];

    await signInC(page);

    for (const c of cases) {
      const reason = `e2e-${c.kind}-${Date.now()}`;
      const reportId = await seedReport({
        reporterId: process.env.E2E_USER_A_ID!,
        reportedUserId: reportedId,
        reason,
        reasonCode: "harassment",
      });
      try {
        await page.goto("/admin/command-center/reports");
        const filter = page.getByTestId("cc-reports-filter");
        await expect(filter).toBeVisible({ timeout: 15_000 });
        await filter.selectOption("open");

        const row = page.getByTestId("cc-report-row").filter({ hasText: reason });
        await expect(row).toBeVisible({ timeout: 10_000 });

        // Sonner live region contract — assert BEFORE the click, so we
        // know the announcement channel is present when the toast fires.
        const region = page.locator('[data-sonner-toaster], section[aria-label*="Notif" i]').first();
        await expect(region).toHaveAttribute("aria-live", /polite|assertive/);

        // Trigger the flow.
        const actions = row.locator("..").getByTestId("cc-report-actions");
        await actions.getByRole("button", { name: c.buttonName }).click();
        await page.getByRole("button", { name: c.confirmName }).click();

        const toast = page.getByText(c.toastRx);
        await expect(toast).toBeVisible({ timeout: 8_000 });
        // Toast text carries the reason for screen-reader context.
        await expect(toast.locator("xpath=ancestor::li[1]")).toContainText(reason);

        // Server-side truth.
        const raw = await readReportRaw(reportId);
        if (c.kind === "dismiss") {
          expect(raw?.status).toBe("dismissed");
        } else {
          expect(raw?.status).toBe("resolved");
          expect(raw?.resolved_by).toBe(modId);
        }

        // Inline action row: suspend/ban resolve → the entire actions
        // block is gone; dismiss also removes the row from Open filter.
        await expect(row).toHaveCount(0, { timeout: 8_000 });

        // Let the toast auto-dismiss so a re-fire would be detectable.
        await page.waitForTimeout(6000);
        await expect(toast).toHaveCount(0);

        // ── Reconnect round-trip. Realtime UPDATE backfill must NOT
        // re-fire a duplicate toast or resurrect the action buttons.
        await context.setOffline(true);
        await page.waitForTimeout(600);
        await context.setOffline(false);
        await page.waitForTimeout(2500);

        await expect(toast).toHaveCount(0);
        // Row still gone from Open filter after reconnect.
        await expect(page.getByTestId("cc-report-row").filter({ hasText: reason }))
          .toHaveCount(0);

        // Under the appropriate resolved-side filter, if actions render
        // at all for the row, they must NOT include the destructive
        // button we just consumed.
        await filter.selectOption(c.kind === "dismiss" ? "dismissed" : "resolved");
        const settledRow = page.getByTestId("cc-report-row").filter({ hasText: reason });
        await expect(settledRow).toHaveCount(1, { timeout: 8_000 });
        const settledActions = settledRow.locator("..").getByTestId("cc-report-actions");
        // Per the panel contract, dismissed/resolved rows render no actions row.
        await expect(settledActions).toHaveCount(0);
      } finally {
        await deleteReport(reportId);
        await clearUserFlags(reportedId);
      }
    }

    await revokeModerator(modId);
  });
});
