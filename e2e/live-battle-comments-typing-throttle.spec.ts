// E2E: Typing indicator broadcast is throttled to at most one per interval
// (TYPING_THROTTLE_MS = 1500ms) regardless of keystroke frequency.
// Verified via a per-page counter the component exposes on window.
import { test, expect, Page } from "@playwright/test";
import {
  seedLiveBattle, teardownLiveBattle, hasServiceRoleForLive,
} from "./helpers/liveBattleSeed";
import { deleteAllCommentsForBattle } from "./helpers/liveBattleCommentSeed";

async function signInC(page: Page) {
  await page.goto("/auth");
  await page.getByLabel(/email/i).fill(process.env.E2E_USER_C_EMAIL!);
  await page.getByLabel(/password/i).fill(process.env.E2E_USER_C_PASSWORD!);
  await page.getByRole("button", { name: /sign in/i }).click();
  await page.waitForURL(/\/(feed|scrolls|me|battles)/, { timeout: 15_000 });
}

test.describe("Live battle comments — typing broadcast throttle", () => {
  test.skip(!hasServiceRoleForLive(), "Requires service-role + seeded users.");

  test("rapid typing produces at most one broadcast per throttle window", async ({ page }) => {
    const seed = await seedLiveBattle({ slug: "lbc-typing-throttle" });
    try {
      await signInC(page);
      await page.goto(`/live/${seed.id}`);
      const input = page.getByTestId("live-battle-comment-input");
      await expect(input).toBeVisible({ timeout: 10_000 });

      // Reset the instrumentation counters.
      await page.evaluate(() => {
        (window as any).__lbcTypingSent = 0;
        (window as any).__lbcTypingThrottled = 0;
      });

      // Type ~30 characters over ~2.5s. With a 1500ms throttle we expect
      // at most 2 broadcasts (first keystroke + one after the window
      // elapses). The rest must be throttled.
      const start = Date.now();
      await input.focus();
      for (let i = 0; i < 30; i++) {
        await input.press(String.fromCharCode(97 + (i % 26)));
        await page.waitForTimeout(80);
      }
      const elapsed = Date.now() - start;
      expect(elapsed).toBeGreaterThan(2000);

      const sent = await page.evaluate(() => (window as any).__lbcTypingSent as number);
      const throttled = await page.evaluate(() => (window as any).__lbcTypingThrottled as number);

      // Hard cap: never more broadcasts than (elapsed / 1500) + 1.
      const maxAllowed = Math.floor(elapsed / 1500) + 1;
      expect(sent).toBeGreaterThanOrEqual(1);
      expect(sent).toBeLessThanOrEqual(maxAllowed);
      // The vast majority of keystrokes must have been throttled.
      expect(throttled).toBeGreaterThan(sent * 3);

      // A short pause then more typing yields at most ONE additional
      // broadcast within the next window.
      await page.waitForTimeout(1600);
      const sentBefore = sent;
      for (let i = 0; i < 10; i++) {
        await input.press("z");
        await page.waitForTimeout(50);
      }
      const sentAfter = await page.evaluate(() => (window as any).__lbcTypingSent as number);
      expect(sentAfter - sentBefore).toBeLessThanOrEqual(1);
    } finally {
      await deleteAllCommentsForBattle(seed.id);
      await teardownLiveBattle(seed.id);
    }
  });
});
