// E2E: Clicking Resolve in the Command Center writes a `report_resolved`
// row to admin_audit_log with the moderator as actor and the entered
// reason in details, AND the drawer's Resolution trail renders that
// exact entry immediately (no page reload) once the drawer is reopened.
import { test, expect, Page } from "@playwright/test";
import { hasServiceRoleForLive } from "./helpers/liveBattleSeed";
import {
  seedReport, deleteReport, grantModerator, revokeModerator,
  readLatestReportResolvedAudit,
} from "./helpers/liveBattleCommentSeed";

async function signInC(page: Page) {
  await page.goto("/auth");
  await page.getByLabel(/email/i).fill(process.env.E2E_USER_C_EMAIL!);
  await page.getByLabel(/password/i).fill(process.env.E2E_USER_C_PASSWORD!);
  await page.getByRole("button", { name: /sign in/i }).click();
  await page.waitForURL(/\/(feed|scrolls|me|battles)/, { timeout: 15_000 });
}

test.describe("Command Center — report_resolved audit row + drawer trail render", () => {
  test.skip(!hasServiceRoleForLive(), "Requires service-role + seeded users.");

  test("audit_log gets report_resolved with actor+reason and the drawer trail renders it", async ({ page }) => {
    const modId = process.env.E2E_USER_C_ID!;
    await grantModerator(modId);
    const reason = `e2e-resolve-audit-${Date.now()}`;
    const reportId = await seedReport({
      reporterId: process.env.E2E_USER_A_ID!,
      reportedUserId: process.env.E2E_USER_B_ID!,
      reason,
      reasonCode: "harassment",
    });
    try {
      await signInC(page);
      await page.goto("/admin/command-center/reports");
      const filter = page.getByTestId("cc-reports-filter");
      await expect(filter).toBeVisible({ timeout: 15_000 });
      await filter.selectOption("open");

      const openRow = page.getByTestId("cc-report-row").filter({ hasText: reason });
      await expect(openRow).toBeVisible({ timeout: 10_000 });

      // Trigger Resolve with a specific reason string we can grep for
      // both in admin_audit_log.details AND in the drawer's rendered trail.
      const resolveReason = `resolved via e2e — ${reason}`;
      await openRow.locator("..").getByTestId("cc-report-actions")
        .getByTestId("cc-report-resolve").click();

      // ModerationReasonDialog: overwrite default reason with ours.
      const reasonInput = page.getByRole("textbox").last();
      await reasonInput.fill(resolveReason);
      await page.getByRole("button", { name: /^Resolve$/ }).click();
      await expect(page.getByText(/^Report resolved$/i)).toBeVisible({ timeout: 8_000 });

      // ── Server-side audit truth ────────────────────────────────────────
      const audit = await (async () => {
        for (let i = 0; i < 20; i++) {
          const row = await readLatestReportResolvedAudit(reportId);
          if (row) return row;
          await page.waitForTimeout(300);
        }
        return null;
      })();
      expect(audit).not.toBeNull();
      expect(audit!.action).toBe("report_resolved");
      expect(audit!.target_type).toBe("report");
      expect(audit!.target_id).toBe(reportId);
      expect(audit!.actor_id).toBe(modId);
      const details = (audit!.details ?? {}) as { reason?: string; resolution?: string };
      const detailText = `${details.reason ?? ""} ${details.resolution ?? ""}`;
      expect(detailText).toContain(resolveReason);

      // ── Drawer trail renders the new entry immediately ─────────────────
      await filter.selectOption("resolved");
      const resolvedRow = page.getByTestId("cc-report-row").filter({ hasText: reason });
      await expect(resolvedRow).toBeVisible({ timeout: 8_000 });
      await resolvedRow.click();

      const dialog = page.getByRole("dialog");
      await expect(dialog).toBeVisible({ timeout: 5_000 });

      const trail = dialog.getByTestId("cc-report-resolution-trail");
      await expect(trail).toBeVisible({ timeout: 5_000 });

      const entries = trail.getByTestId("cc-resolution-entry");
      await expect(entries).toHaveCount(1, { timeout: 5_000 });
      // Trail shows our exact reason and marks resolver via actor_id.
      await expect(entries.first()).toContainText(resolveReason);
    } finally {
      await deleteReport(reportId);
      await revokeModerator(modId);
    }
  });
});
