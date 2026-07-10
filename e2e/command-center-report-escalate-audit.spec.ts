// E2E: Clicking Escalate in the moderation panel must write an
// `report_escalated` row into admin_audit_log with the correct actor_id
// (the moderator that clicked) and details.reason (the confirm-dialog note).
import { test, expect, Page } from "@playwright/test";
import { hasServiceRoleForLive } from "./helpers/liveBattleSeed";
import {
  seedReport, deleteReport, grantModerator, revokeModerator,
  readLatestReportEscalatedAudit,
} from "./helpers/liveBattleCommentSeed";

async function signInC(page: Page) {
  await page.goto("/auth");
  await page.getByLabel(/email/i).fill(process.env.E2E_USER_C_EMAIL!);
  await page.getByLabel(/password/i).fill(process.env.E2E_USER_C_PASSWORD!);
  await page.getByRole("button", { name: /sign in/i }).click();
  await page.waitForURL(/\/(feed|scrolls|me|battles)/, { timeout: 15_000 });
}

test.describe("Command Center — report_escalated audit log entry", () => {
  test.skip(!hasServiceRoleForLive(), "Requires service-role + seeded users.");

  test("writes an admin_audit_log row with correct resolver and reason", async ({ page }) => {
    const modId = process.env.E2E_USER_C_ID!;
    const reporterId = process.env.E2E_USER_A_ID!;
    const reportedId = process.env.E2E_USER_B_ID!;
    await grantModerator(modId);
    const reason = `e2e-audit-${Date.now()}`;
    const escalationNote = `Escalated by E2E (${Date.now()}) — needs senior review`;
    const reportId = await seedReport({
      reporterId, reportedUserId: reportedId, reason, reasonCode: "harassment",
    });
    try {
      // Sanity: no prior audit row for this report id.
      const pre = await readLatestReportEscalatedAudit(reportId);
      expect(pre).toBeNull();

      await signInC(page);
      await page.goto("/admin/command-center/reports");

      const filter = page.getByTestId("cc-reports-filter");
      await expect(filter).toBeVisible({ timeout: 15_000 });
      await filter.selectOption("open");

      const row = page.getByTestId("cc-report-row").filter({ hasText: reason });
      await expect(row).toBeVisible({ timeout: 10_000 });
      await row.locator("..").getByTestId("cc-report-actions")
        .getByTestId("cc-report-escalate").click();

      // Replace the pre-filled reason with our uniquely-identifiable note
      // so the audit assertion is strictly about *this* click.
      const dialog = page.getByRole("dialog");
      await expect(dialog).toBeVisible({ timeout: 5_000 });
      const reasonInput = dialog.getByRole("textbox");
      await reasonInput.fill(escalationNote);
      await page.getByRole("button", { name: /^Escalate$/ }).click();
      await expect(page.getByText(/Report escalated for senior review/i))
        .toBeVisible({ timeout: 8_000 });

      // Poll for the audit row — the write is best-effort/async in the
      // client (fire-and-forget after the status update commits).
      await expect.poll(
        async () => (await readLatestReportEscalatedAudit(reportId)) !== null,
        { timeout: 8_000, message: "audit log row not written" },
      ).toBe(true);
      const audit = await readLatestReportEscalatedAudit(reportId);

      expect(audit).not.toBeNull();
      expect(audit!.action).toBe("report_escalated");
      expect(audit!.target_type).toBe("report");
      expect(audit!.target_id).toBe(reportId);
      expect(audit!.actor_id).toBe(modId);
      // details is a JSONB — resolver stored the exact reason we typed.
      const details = (audit!.details ?? {}) as Record<string, unknown>;
      expect(details.reason).toBe(escalationNote);
    } finally {
      await deleteReport(reportId);
      await revokeModerator(modId);
    }
  });
});
