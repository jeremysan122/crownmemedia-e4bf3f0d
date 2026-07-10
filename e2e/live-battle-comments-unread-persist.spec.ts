// E2E: Live-battle comments — unread count and "N new" pill survive when the
// tab is backgrounded (Page Visibility API) and restored. React state stays
// in memory so the pill must resume with the exact same count.
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

async function setVisibility(page: Page, hidden: boolean) {
  await page.evaluate((h) => {
    Object.defineProperty(document, "visibilityState", { value: h ? "hidden" : "visible", configurable: true });
    Object.defineProperty(document, "hidden", { value: h, configurable: true });
    document.dispatchEvent(new Event("visibilitychange"));
    if (!h) window.dispatchEvent(new Event("focus"));
    else window.dispatchEvent(new Event("blur"));
  }, hidden);
}

test.describe("Live battle comments — unread persistence across backgrounding", () => {
  test.skip(!hasServiceRoleForLive(), "Requires service-role + seeded users.");

  test("unread count and jump-to-latest pill survive tab hide/show", async ({ page }) => {
    const seed = await seedLiveBattle({ slug: "lbc-unread-persist" });
    await seedComments({
      battleId: seed.id, authorId: seed.opponentId, count: 40,
      bodyPrefix: "up", stepMs: 500,
    });
    try {
      await signInC(page);
      await page.goto(`/live/${seed.id}`);

      const list = page.getByTestId("live-battle-comments-list");
      await expect(list).toBeVisible({ timeout: 10_000 });
      await expect(page.getByTestId("live-battle-comment")).toHaveCount(30, { timeout: 10_000 });

      // Scroll up so unread starts accumulating.
      await list.evaluate((el) => { el.scrollTop = 0; });
      await page.waitForTimeout(150);

      // Two arrivals before backgrounding.
      await insertComment({ battleId: seed.id, authorId: seed.opponentId, body: "up-A" });
      await insertComment({ battleId: seed.id, authorId: seed.opponentId, body: "up-B" });
      const pill = page.getByTestId("live-battle-comments-jump-latest");
      await expect(pill).toBeVisible({ timeout: 6_000 });
      await expect(pill).toHaveText(/2 new/i);

      const savedScroll = await list.evaluate((el) => el.scrollTop);

      // Background the tab. The visibility handler must not clobber state.
      await setVisibility(page, true);
      await page.waitForTimeout(400);

      // Two more arrivals while backgrounded.
      await insertComment({ battleId: seed.id, authorId: seed.opponentId, body: "up-C" });
      await insertComment({ battleId: seed.id, authorId: seed.opponentId, body: "up-D" });

      // Return to foreground.
      await setVisibility(page, false);
      await page.waitForTimeout(600);

      // Pill must still be present and reflect the full accumulated count.
      await expect(page.getByTestId("live-battle-comments-jump-latest")).toBeVisible();
      await expect(page.getByTestId("live-battle-comments-jump-latest")).toHaveText(/4 new/i, { timeout: 8_000 });

      // Scroll position must not have jumped to the bottom on visibility change.
      const restoredScroll = await list.evaluate((el) => el.scrollTop);
      expect(Math.abs(restoredScroll - savedScroll)).toBeLessThan(30);

      // Clicking the pill still resets unread to 0 and hides it.
      await page.getByTestId("live-battle-comments-jump-latest").click();
      await expect(page.getByTestId("live-battle-comments-jump-latest")).toHaveCount(0, { timeout: 4_000 });
    } finally {
      await deleteAllCommentsForBattle(seed.id);
      await teardownLiveBattle(seed.id);
    }
  });
});
