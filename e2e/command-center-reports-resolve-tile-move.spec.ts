// E2E: Resolving a report moves the row from Open → Resolved without
// creating a duplicate anywhere. Verifies:
//   - Open count decrements by exactly 1, Resolved count increments by 1.
//   - The row disappears under the Open filter.
//   - Under the Resolved filter the row appears exactly once (no dupe
//     from realtime UPDATE + optimistic insert races).
//   - Under the All filter the row is present exactly once with status
//     resolved (no ghost open row lingering).
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

test.describe("Command Center — resolve moves report to Resolved tile without duplicates", () => {
  test.skip(!hasServiceRoleForLive(), "Requires service-role + seeded users.");

  test("open→resolved tile counts and filter rows update with no duplicate row", async ({ page }) => {
    const modId = process.env.E2E_USER_C_ID!;
    await grantModerator(modId);
    const reason = `e2e-resolve-move-${Date.now()}`;
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
      await expect(openRow).toHaveCount(1); // no seeding dupes

      const openBefore = await countFor(page, /^Open\b/i);
      const resBefore = await countFor(page, /^Resolved\b/i);
      expect(Number.isFinite(openBefore)).toBeTruthy();
      expect(Number.isFinite(resBefore)).toBeTruthy();

      // ── Resolve ────────────────────────────────────────────────────────
      await openRow.locator("..").getByTestId("cc-report-actions")
        .getByTestId("cc-report-resolve").click();
      await page.getByRole("button", { name: /^Resolve$/ }).click();
      await expect(page.getByText(/^Report resolved$/i)).toBeVisible({ timeout: 8_000 });

      // Server truth
      const raw = await readReportRaw(reportId);
      expect(raw?.status).toBe("resolved");

      // Tile deltas — exactly -1 / +1 (no double-count from realtime).
      await expect.poll(() => countFor(page, /^Open\b/i), { timeout: 8_000 }).toBe(openBefore - 1);
      await expect.poll(() => countFor(page, /^Resolved\b/i), { timeout: 8_000 }).toBe(resBefore + 1);

      // Open filter: row gone.
      await expect(openRow).toHaveCount(0, { timeout: 8_000 });

      // Resolved filter: row present exactly once.
      await filter.selectOption("resolved");
      const resRow = page.getByTestId("cc-report-row").filter({ hasText: reason });
      await expect(resRow).toHaveCount(1, { timeout: 8_000 });
      await expect(resRow).toHaveAttribute("data-report-status", "resolved");

      // All filter: still exactly one entry, and it's resolved.
      await filter.selectOption("all");
      const allRow = page.getByTestId("cc-report-row").filter({ hasText: reason });
      await expect(allRow).toHaveCount(1, { timeout: 8_000 });
      await expect(allRow).toHaveAttribute("data-report-status", "resolved");
    } finally {
      await deleteReport(reportId);
      await revokeModerator(modId);
    }
  });
});
