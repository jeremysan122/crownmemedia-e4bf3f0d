// E2E: Escalate a report from the Command Center and verify the UI reflects
// the new status everywhere — status pill, filter count tiles, active-filter
// row visibility, and action-button set (Escalate hides, Resolve/Dismiss stay).
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

async function countFor(page: Page, label: RegExp): Promise<number> {
  // StatTile renders the label as text and the value as a sibling node.
  const tile = page.locator("div").filter({ hasText: label }).first();
  const txt = (await tile.innerText()).replace(/\D+/g, " ").trim();
  const first = txt.split(/\s+/).find((s) => /^\d+$/.test(s));
  return first ? Number(first) : NaN;
}

test.describe("Command Center — escalate report flow", () => {
  test.skip(!hasServiceRoleForLive(), "Requires service-role + seeded users.");

  test("escalating updates status pill, counts, filter visibility, and action buttons", async ({ page }) => {
    const modId = process.env.E2E_USER_C_ID!;
    const reporterId = process.env.E2E_USER_A_ID!;
    const reportedId = process.env.E2E_USER_B_ID!;
    await grantModerator(modId);
    const reason = `e2e-escalate-${Date.now()}`;
    const reportId = await seedReport({
      reporterId, reportedUserId: reportedId, reason, reasonCode: "harassment",
    });
    try {
      await signInC(page);
      await page.goto("/admin/command-center/reports");

      const filter = page.getByTestId("cc-reports-filter");
      await expect(filter).toBeVisible({ timeout: 15_000 });

      // Locate our row while the "Open" filter is active.
      await filter.selectOption("open");
      const row = page.getByTestId("cc-report-row")
        .filter({ hasText: reason });
      await expect(row).toBeVisible({ timeout: 10_000 });
      await expect(row).toHaveAttribute("data-report-status", "open");

      // Capture baseline counts BEFORE the escalate action.
      const openBefore = await countFor(page, /^Open\b/i);
      const escBefore = await countFor(page, /^Escalated\b/i);
      expect(Number.isFinite(openBefore)).toBeTruthy();
      expect(Number.isFinite(escBefore)).toBeTruthy();

      // Escalate — confirms via ConfirmDialog.
      const actions = row.locator("..").getByTestId("cc-report-actions");
      await actions.getByTestId("cc-report-escalate").click();
      // Confirm the dialog. Button label defined in pendingCopy.escalate.
      await page.getByRole("button", { name: /^Escalate$/ }).click();
      await expect(page.getByText(/Report escalated for senior review/i))
        .toBeVisible({ timeout: 8_000 });

      // Server truth (bypasses RLS): status must be `escalated`.
      const raw = await readReportRaw(reportId);
      expect(raw?.status).toBe("escalated");
      expect(raw?.resolved_by).toBe(modId);

      // Counts update: Open -1, Escalated +1.
      await expect.poll(async () => countFor(page, /^Open\b/i), { timeout: 8_000 })
        .toBe(openBefore - 1);
      await expect.poll(async () => countFor(page, /^Escalated\b/i), { timeout: 8_000 })
        .toBe(escBefore + 1);

      // Under the "Open" filter the row should no longer be visible.
      await expect(row).toHaveCount(0, { timeout: 8_000 });

      // Switch to the "Escalated" filter — the same reason surfaces there.
      await filter.selectOption("escalated");
      const escRow = page.getByTestId("cc-report-row").filter({ hasText: reason });
      await expect(escRow).toBeVisible({ timeout: 8_000 });
      await expect(escRow).toHaveAttribute("data-report-status", "escalated");

      // Action buttons: Escalate is gone (only shown for status='open'),
      // Resolve + Dismiss remain because status is still actionable.
      const escActions = escRow.locator("..").getByTestId("cc-report-actions");
      await expect(escActions.getByTestId("cc-report-escalate")).toHaveCount(0);
      await expect(escActions.getByTestId("cc-report-resolve")).toBeVisible();
      await expect(escActions.getByRole("button", { name: /^Dismiss$/ })).toBeVisible();
    } finally {
      await deleteReport(reportId);
      await revokeModerator(modId);
    }
  });
});
