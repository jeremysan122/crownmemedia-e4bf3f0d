// E2E: Escalate → Resolve a report from the Command Center. Verifies:
//   - Status transitions open → escalated → resolved (server truth).
//   - The Open / Escalated / Resolved StatTiles update at each hop.
//   - After resolution, the entire cc-report-actions row disappears from
//     the list — matching the component contract that only status
//     `open` or `escalated` reports render inline actions.
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
  const tile = page.locator("div").filter({ hasText: label }).first();
  const txt = (await tile.innerText()).replace(/\D+/g, " ").trim();
  const first = txt.split(/\s+/).find((s) => /^\d+$/.test(s));
  return first ? Number(first) : NaN;
}

test.describe("Command Center — escalate then resolve flow", () => {
  test.skip(!hasServiceRoleForLive(), "Requires service-role + seeded users.");

  test("escalate then resolve updates status, tiles, and action buttons for resolved rows", async ({ page }) => {
    const modId = process.env.E2E_USER_C_ID!;
    const reporterId = process.env.E2E_USER_A_ID!;
    const reportedId = process.env.E2E_USER_B_ID!;
    await grantModerator(modId);
    const reason = `e2e-esc-then-resolve-${Date.now()}`;
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
      await expect(openRow).toHaveAttribute("data-report-status", "open");

      const openBefore = await countFor(page, /^Open\b/i);
      const escBefore = await countFor(page, /^Escalated\b/i);
      const resBefore = await countFor(page, /^Resolved\b/i);
      for (const v of [openBefore, escBefore, resBefore]) expect(Number.isFinite(v)).toBeTruthy();

      // ── Step 1: Escalate ───────────────────────────────────────────────
      await openRow.locator("..").getByTestId("cc-report-actions")
        .getByTestId("cc-report-escalate").click();
      await page.getByRole("button", { name: /^Escalate$/ }).click();
      await expect(page.getByText(/Report escalated for senior review/i))
        .toBeVisible({ timeout: 8_000 });

      let raw = await readReportRaw(reportId);
      expect(raw?.status).toBe("escalated");
      expect(raw?.resolved_by).toBe(modId);

      await expect.poll(async () => countFor(page, /^Open\b/i), { timeout: 8_000 })
        .toBe(openBefore - 1);
      await expect.poll(async () => countFor(page, /^Escalated\b/i), { timeout: 8_000 })
        .toBe(escBefore + 1);

      // Switch to Escalated to find the row again.
      await filter.selectOption("escalated");
      const escRow = page.getByTestId("cc-report-row").filter({ hasText: reason });
      await expect(escRow).toBeVisible({ timeout: 8_000 });
      await expect(escRow).toHaveAttribute("data-report-status", "escalated");

      // Escalate must be hidden now — Resolve + Dismiss remain.
      const escActions = escRow.locator("..").getByTestId("cc-report-actions");
      await expect(escActions.getByTestId("cc-report-escalate")).toHaveCount(0);
      await expect(escActions.getByTestId("cc-report-resolve")).toBeVisible();

      // ── Step 2: Resolve the escalated report ───────────────────────────
      await escActions.getByTestId("cc-report-resolve").click();
      await page.getByRole("button", { name: /^Resolve$/ }).click();
      // Success toast copy from resolveReport handler.
      await expect(page.getByText(/resolved/i).first()).toBeVisible({ timeout: 8_000 });

      raw = await readReportRaw(reportId);
      expect(raw?.status).toBe("resolved");
      expect(raw?.resolved_by).toBe(modId);
      expect(raw?.resolved_at).not.toBeNull();

      // Tiles: Escalated -1, Resolved +1 vs baseline.
      await expect.poll(async () => countFor(page, /^Escalated\b/i), { timeout: 8_000 })
        .toBe(escBefore);
      await expect.poll(async () => countFor(page, /^Resolved\b/i), { timeout: 8_000 })
        .toBe(resBefore + 1);

      // Row is gone from the Escalated filter.
      await expect(escRow).toHaveCount(0, { timeout: 8_000 });

      // Under the Resolved filter the row surfaces but has NO actions row —
      // resolved reports render no inline actions per the panel contract.
      await filter.selectOption("resolved");
      const resRow = page.getByTestId("cc-report-row").filter({ hasText: reason });
      await expect(resRow).toBeVisible({ timeout: 8_000 });
      await expect(resRow).toHaveAttribute("data-report-status", "resolved");
      const resActions = resRow.locator("..").getByTestId("cc-report-actions");
      await expect(resActions).toHaveCount(0);
    } finally {
      await deleteReport(reportId);
      await revokeModerator(modId);
    }
  });
});
