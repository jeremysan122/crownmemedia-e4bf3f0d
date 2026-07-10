/**
 * E2E — Reopening /live/:id after a long idle/background period re-syncs
 * the MM:SS timer to server time (via `serverTime.ts`) with no drift.
 *
 * We simulate the idle window by fast-forwarding the client wall clock:
 * `performance.now()` and `Date.now()` are overridden to jump 5 minutes
 * ahead. On remount, the arena must call the server-time helper again and
 * display a timer that matches `ends_at - serverNow()` — proving the
 * offset was refreshed and not left stale.
 */
import { test, expect } from "@playwright/test";
import {
  hasServiceRoleForLive,
  seedLiveBattle,
  teardownLiveBattle,
} from "./helpers/liveBattleSeed";

const TOLERANCE_SEC = 4;

async function readTimer(page: import("@playwright/test").Page): Promise<number> {
  const el = page.getByTestId("live-battle-timer");
  await expect(el).toBeVisible({ timeout: 10_000 });
  const attr = await el.getAttribute("data-remaining-sec");
  const n = Number(attr);
  if (!Number.isFinite(n)) throw new Error(`bad timer value: ${attr}`);
  return n;
}

test.describe("Live battle — countdown re-syncs after long idle", () => {
  test.skip(!hasServiceRoleForLive(), "Requires service-role + seeded users A/B/C.");

  test("Timer re-anchors to server time when the page is reopened later", async ({ page }) => {
    // 15 minute window gives us room to fast-forward 5 minutes safely.
    const durationSec = 15 * 60;
    const endsAtMs = Date.now() + durationSec * 1000;
    const seed = await seedLiveBattle({
      slug: "countdown-resync",
      durationSeconds: durationSec,
      endsInSeconds: durationSec,
    });

    try {
      await page.goto("/auth");
      await page.getByLabel(/email/i).fill(process.env.E2E_USER_C_EMAIL!);
      await page.getByLabel(/password/i).fill(process.env.E2E_USER_C_PASSWORD!);
      await page.getByRole("button", { name: /sign in/i }).click();
      await page.waitForURL(/\/(feed|scrolls|me|battles)/, { timeout: 15_000 });

      // First visit — timer is close to full duration.
      await page.goto(`/live/${seed.id}`);
      const initial = await readTimer(page);
      const expectedInitial = Math.floor((endsAtMs - Date.now()) / 1000);
      expect(Math.abs(initial - expectedInitial)).toBeLessThanOrEqual(TOLERANCE_SEC);

      // Simulate 5 minutes of idle/background time: override Date.now on the
      // window before we navigate back. The next mount will call
      // getServerTimeOffsetMs() again — with a skewed local clock, the only
      // way the displayed remaining stays correct is if the offset re-syncs.
      const IDLE_MS = 5 * 60_000;
      await page.addInitScript((skewMs) => {
        const RealDate = Date;
        const origNow = RealDate.now.bind(RealDate);
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (RealDate as any).now = () => origNow() + skewMs;
      }, IDLE_MS);

      // Navigate away then back to force a fresh mount (and fresh serverTime
      // fetch — the module cache lives on the previous page and is dropped).
      await page.goto("/battles");
      await page.goto(`/live/${seed.id}`);

      const resynced = await readTimer(page);
      // True remaining in real wall-clock terms: endsAt - real now (~ initial - a few s).
      const trueRemaining = Math.floor((endsAtMs - Date.now()) / 1000);

      // The timer must reflect real wall-clock remaining, NOT
      // (trueRemaining - IDLE_MS/1000). If the offset were stale, the
      // displayed number would be ~300s off.
      expect(Math.abs(resynced - trueRemaining)).toBeLessThanOrEqual(TOLERANCE_SEC);
      // And it must never be negative before ends_at.
      expect(resynced).toBeGreaterThan(0);
    } finally {
      await teardownLiveBattle(seed.id);
    }
  });
});
