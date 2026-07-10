// E2E: Live-battle comments pagination — "Load older" fetches the next
// page without duplicating or skipping rows, and works correctly even
// after new comments arrive at the tail via realtime.
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

async function bodiesInList(page: Page): Promise<string[]> {
  // Extract the body text (after the "@username " prefix) from every rendered row.
  return page.evaluate(() => {
    const rows = document.querySelectorAll('[data-testid="live-battle-comment"]');
    return Array.from(rows).map((el) => {
      // last text-bearing span is the body
      const spans = el.querySelectorAll("span");
      return spans[spans.length - 1]?.textContent?.trim() ?? "";
    });
  });
}

test.describe("Live battle comments — pagination integrity", () => {
  test.skip(!hasServiceRoleForLive(), "Requires service-role + seeded users.");

  test("Load older prepends the previous page without duplicates or gaps", async ({ page }) => {
    const seed = await seedLiveBattle({ slug: "lbc-pagination" });
    // Seed 75 comments spaced 1s apart so they order deterministically.
    // Component page size = 30 → first paint shows the 30 newest; "Load
    // older" should reveal the next 30, then the final 15.
    const seeded = await seedComments({
      battleId: seed.id, authorId: seed.opponentId, count: 75,
      bodyPrefix: "pg", stepMs: 1000,
    });
    try {
      await signInC(page);
      await page.goto(`/live/${seed.id}`);

      const list = page.getByTestId("live-battle-comments-list");
      await expect(list).toBeVisible({ timeout: 10_000 });
      await expect(page.getByTestId("live-battle-comment")).toHaveCount(30, { timeout: 10_000 });

      // First page = newest 30 → bodies pg-0045 … pg-0074 (chronological).
      const page1 = await bodiesInList(page);
      const expectedPage1 = seeded.slice(-30).map((r) => r.body);
      expect(page1).toEqual(expectedPage1);

      // Load older #1 → 60 total, oldest 30 of these are pg-0015 … pg-0044.
      await page.getByTestId("live-battle-comments-load-older").click();
      await expect(page.getByTestId("live-battle-comment")).toHaveCount(60, { timeout: 8_000 });
      let all = await bodiesInList(page);
      expect(new Set(all).size).toBe(all.length); // no duplicates
      expect(all).toEqual(seeded.slice(-60).map((r) => r.body)); // no gaps, correct order

      // Load older #2 → 75 total, all remaining pg-0000 … pg-0014 prepended.
      await page.getByTestId("live-battle-comments-load-older").click();
      await expect(page.getByTestId("live-battle-comment")).toHaveCount(75, { timeout: 8_000 });
      all = await bodiesInList(page);
      expect(new Set(all).size).toBe(all.length);
      expect(all).toEqual(seeded.map((r) => r.body));

      // No more history → the button hides.
      await expect(page.getByTestId("live-battle-comments-load-older")).toHaveCount(0);
    } finally {
      await deleteAllCommentsForBattle(seed.id);
      await teardownLiveBattle(seed.id);
    }
  });

  test("realtime tail additions do not cause duplicates or lose older items when paginating", async ({ page }) => {
    const seed = await seedLiveBattle({ slug: "lbc-pagination-realtime" });
    const seeded = await seedComments({
      battleId: seed.id, authorId: seed.opponentId, count: 35,
      bodyPrefix: "rt", stepMs: 1000,
    });
    try {
      await signInC(page);
      await page.goto(`/live/${seed.id}`);
      await expect(page.getByTestId("live-battle-comment")).toHaveCount(30, { timeout: 10_000 });

      // A new comment arrives at the tail via realtime.
      await insertComment({
        battleId: seed.id, authorId: seed.opponentId, body: "rt-live-arrival-a",
      });
      await expect(page.getByTestId("live-battle-comment")).toHaveCount(31, { timeout: 8_000 });

      // Load older reveals the 5 oldest without duplicating the tail arrival
      // or double-counting the boundary row.
      await page.getByTestId("live-battle-comments-load-older").click();
      await expect(page.getByTestId("live-battle-comment")).toHaveCount(36, { timeout: 8_000 });

      const bodies = await bodiesInList(page);
      expect(new Set(bodies).size).toBe(bodies.length);
      // Order: all 35 seeded bodies (chronological) followed by the arrival.
      expect(bodies).toEqual([...seeded.map((r) => r.body), "rt-live-arrival-a"]);

      // Another realtime arrival after pagination — still no dupes.
      await insertComment({
        battleId: seed.id, authorId: seed.opponentId, body: "rt-live-arrival-b",
      });
      await expect(page.getByTestId("live-battle-comment")).toHaveCount(37, { timeout: 8_000 });
      const final = await bodiesInList(page);
      expect(new Set(final).size).toBe(final.length);
      expect(final[final.length - 1]).toBe("rt-live-arrival-b");
    } finally {
      await deleteAllCommentsForBattle(seed.id);
      await teardownLiveBattle(seed.id);
    }
  });
});
