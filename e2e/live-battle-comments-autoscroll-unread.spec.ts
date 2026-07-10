// E2E: Live-battle comments overlay
//  - Auto-scrolls to the newest comment when the user is pinned to the bottom.
//  - Increments an unread counter on the jump-to-latest pill when the user
//    has scrolled up and new comments arrive via realtime.
//  - Clicking the pill scrolls back to the newest and resets the counter to 0.
import { test, expect, Page } from "@playwright/test";
import {
  seedLiveBattle, teardownLiveBattle, hasServiceRoleForLive,
} from "./helpers/liveBattleSeed";
import {
  seedComments, insertComment, deleteAllCommentsForBattle,
} from "./helpers/liveBattleCommentSeed";

async function signInC(page: Page) {
  await page.goto("/auth");
  await page.getByLabel(/email/i).fill(process.env.E2E_USER_C_EMAIL!);
  await page.getByLabel(/password/i).fill(process.env.E2E_USER_C_PASSWORD!);
  await page.getByRole("button", { name: /sign in/i }).click();
  await page.waitForURL(/\/(feed|scrolls|me|battles)/, { timeout: 15_000 });
}

async function isAtBottom(page: Page): Promise<boolean> {
  return page.evaluate(() => {
    const el = document.querySelector<HTMLDivElement>(
      '[data-testid="live-battle-comments-list"]',
    );
    if (!el) return false;
    return el.scrollHeight - el.scrollTop - el.clientHeight < 8;
  });
}

test.describe("Live battle comments — auto-scroll, unread, jump-to-latest", () => {
  test.skip(!hasServiceRoleForLive(), "Requires service-role + seeded users.");

  test("auto-scrolls when stuck; tracks unread when scrolled up; pill resets on click", async ({ page }) => {
    const seed = await seedLiveBattle({ slug: "lbc-autoscroll" });
    // Seed enough history so the list is scrollable and pagination is available.
    await seedComments({
      battleId: seed.id, authorId: seed.opponentId, count: 40,
      bodyPrefix: "as", stepMs: 500,
    });
    try {
      await signInC(page);
      await page.goto(`/live/${seed.id}`);

      const list = page.getByTestId("live-battle-comments-list");
      await expect(list).toBeVisible({ timeout: 10_000 });
      await expect(page.getByTestId("live-battle-comment")).toHaveCount(30, { timeout: 10_000 });

      // Initial render should end pinned to the bottom → no jump pill.
      await expect(page.getByTestId("live-battle-comments-jump-latest")).toHaveCount(0);
      // Give the smooth auto-scroll a beat to settle.
      await page.waitForTimeout(400);
      expect(await isAtBottom(page)).toBe(true);

      // A new comment arrives while we're stuck to bottom — still stuck, no pill.
      await insertComment({ battleId: seed.id, authorId: seed.opponentId, body: "as-tail-1" });
      await expect(page.getByTestId("live-battle-comment").last()).toContainText("as-tail-1", { timeout: 8_000 });
      await page.waitForTimeout(400);
      expect(await isAtBottom(page)).toBe(true);
      await expect(page.getByTestId("live-battle-comments-jump-latest")).toHaveCount(0);

      // Scroll the user up so they leave the "stuck" window.
      await list.evaluate((el) => { el.scrollTop = 0; });
      await page.waitForTimeout(200);

      // Now new comments arriving should increment the unread counter on the pill.
      await insertComment({ battleId: seed.id, authorId: seed.opponentId, body: "as-tail-2" });
      const pill = page.getByTestId("live-battle-comments-jump-latest");
      await expect(pill).toBeVisible({ timeout: 6_000 });
      await expect(pill).toHaveText(/1 new/i);
      await expect(pill).toHaveAttribute("aria-label", /1 new message/i);

      await insertComment({ battleId: seed.id, authorId: seed.opponentId, body: "as-tail-3" });
      await insertComment({ battleId: seed.id, authorId: seed.opponentId, body: "as-tail-4" });
      await expect(pill).toHaveText(/3 new/i, { timeout: 6_000 });
      await expect(pill).toHaveAttribute("aria-label", /3 new messages/i);

      // The list must NOT auto-scroll away from the user's read position.
      expect(await isAtBottom(page)).toBe(false);

      // Click the pill → resets counter, hides pill, and jumps to the newest row.
      await pill.click();
      await expect(page.getByTestId("live-battle-comments-jump-latest")).toHaveCount(0, { timeout: 4_000 });
      await page.waitForTimeout(500); // let scroll animation settle
      expect(await isAtBottom(page)).toBe(true);
      await expect(page.getByTestId("live-battle-comment").last()).toContainText("as-tail-4");
    } finally {
      await deleteAllCommentsForBattle(seed.id);
      await teardownLiveBattle(seed.id);
    }
  });
});
