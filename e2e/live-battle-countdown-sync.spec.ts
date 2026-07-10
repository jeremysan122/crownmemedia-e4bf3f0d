/**
 * E2E — Server-synced countdown stays accurate across navigations.
 *
 * The arena's MM:SS timer is anchored to server time via the offset helper
 * in `src/lib/serverTime.ts`, so a device with a skewed clock still displays
 * the correct remaining seconds within a small tolerance.
 *
 * We compute the expected remaining seconds from the seeded `ends_at`
 * relative to the client wall clock and verify the displayed value is
 * close enough (±3s covers request latency + one tick). We then wait an
 * extra 4 seconds and re-check — the two samples must drop by roughly the
 * elapsed real time, proving the timer is ticking, not stuck.
 */
import { test, expect } from "@playwright/test";
import {
  hasServiceRoleForLive,
  seedLiveBattle,
  teardownLiveBattle,
} from "./helpers/liveBattleSeed";

async function readTimer(page: import("@playwright/test").Page): Promise<number> {
  const el = page.getByTestId("live-battle-timer");
  await expect(el).toBeVisible({ timeout: 10_000 });
  const attr = await el.getAttribute("data-remaining-sec");
  const n = Number(attr);
  if (!Number.isFinite(n)) throw new Error(`bad timer value: ${attr}`);
  return n;
}

test.describe("Live battle — server-synced countdown", () => {
  test.skip(!hasServiceRoleForLive(), "Requires service-role + seeded users A/B/C.");

  test("Displayed MM:SS matches ends_at after navigation and ticks correctly", async ({ page }) => {
    const durationSec = 600;
    const seededAtMs = Date.now();
    const endsAtMs = seededAtMs + durationSec * 1000;
    const seed = await seedLiveBattle({ slug: "countdown-sync", durationSeconds: durationSec, endsInSeconds: durationSec });

    try {
      await page.goto("/auth");
      await page.getByLabel(/email/i).fill(process.env.E2E_USER_C_EMAIL!);
      await page.getByLabel(/password/i).fill(process.env.E2E_USER_C_PASSWORD!);
      await page.getByRole("button", { name: /sign in/i }).click();
      await page.waitForURL(/\/(feed|scrolls|me|battles)/, { timeout: 15_000 });

      await page.goto(`/live/${seed.id}`);

      const first = await readTimer(page);
      const expectedFirst = Math.floor((endsAtMs - Date.now()) / 1000);
      expect(Math.abs(first - expectedFirst)).toBeLessThanOrEqual(3);

      // Wait ~4s of wall clock; timer should have dropped ~4s (± tick jitter).
      await page.waitForTimeout(4_200);
      const second = await readTimer(page);
      const drop = first - second;
      expect(drop).toBeGreaterThanOrEqual(3);
      expect(drop).toBeLessThanOrEqual(6);
    } finally {
      await teardownLiveBattle(seed.id);
    }
  });
});
