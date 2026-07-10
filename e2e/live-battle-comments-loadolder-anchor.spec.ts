// E2E: Loading older comments preserves the EXACT scroll position, even when
// new comments arrive at the tail via realtime during the pagination fetch.
// Anchor invariant: the top-most visible row stays under the same viewport y.
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

/** Read the viewport-relative Y offset of the row with the given body. */
async function viewportYForBody(page: Page, body: string): Promise<number | null> {
  return page.evaluate((b) => {
    const rows = Array.from(document.querySelectorAll<HTMLElement>('[data-testid="live-battle-comment"]'));
    for (const r of rows) {
      if ((r.textContent ?? "").includes(b)) {
        const list = r.closest<HTMLElement>('[data-testid="live-battle-comments-list"]');
        if (!list) return null;
        return r.getBoundingClientRect().top - list.getBoundingClientRect().top;
      }
    }
    return null;
  }, body);
}

test.describe("Live battle comments — load-older preserves scroll position", () => {
  test.skip(!hasServiceRoleForLive(), "Requires service-role + seeded users.");

  test("anchor row stays at the same viewport Y after loading older, even with tail arrivals", async ({ page }) => {
    const seed = await seedLiveBattle({ slug: "lbc-loadolder-anchor" });
    const seeded = await seedComments({
      battleId: seed.id, authorId: seed.opponentId, count: 60,
      bodyPrefix: "an", stepMs: 500,
    });
    try {
      await signInC(page);
      await page.goto(`/live/${seed.id}`);

      const list = page.getByTestId("live-battle-comments-list");
      await expect(list).toBeVisible({ timeout: 10_000 });
      await expect(page.getByTestId("live-battle-comment")).toHaveCount(30, { timeout: 10_000 });

      // Scroll to the very top of the current window so the Load-older button
      // is on screen and the top row becomes the anchor.
      await list.evaluate((el) => { el.scrollTop = 0; });
      await page.waitForTimeout(200);

      // Anchor = oldest currently-mounted row. First page shows the newest 30
      // (bodies an-0030 … an-0059 chronologically) so anchor body = an-0030.
      const anchorBody = seeded[30]!.body;
      const yBefore = await viewportYForBody(page, anchorBody);
      expect(yBefore).not.toBeNull();

      // Kick off the pagination fetch AND fire a realtime tail arrival
      // "during" it, so the total-size delta approach would break. The
      // anchor-index approach must ignore the tail growth.
      await Promise.all([
        page.getByTestId("live-battle-comments-load-older").click(),
        (async () => {
          await page.waitForTimeout(30);
          await insertComment({ battleId: seed.id, authorId: seed.opponentId, body: "an-tail-mid-fetch" });
        })(),
      ]);

      // Wait for both the prepended 30 and the tail arrival to settle.
      await expect(page.getByTestId("live-battle-comment")).toHaveCount(61, { timeout: 10_000 });
      await page.waitForTimeout(300); // let two rAFs run + measure

      const yAfter = await viewportYForBody(page, anchorBody);
      expect(yAfter).not.toBeNull();
      // Anchor must sit within a few pixels of its original viewport Y —
      // NOT jump by ~30 row-heights (~600px) or by the tail row height.
      expect(Math.abs((yAfter as number) - (yBefore as number))).toBeLessThan(20);

      // And no duplicates were introduced by the concurrent insert.
      const bodies = await page.evaluate(() => {
        const rows = document.querySelectorAll('[data-testid="live-battle-comment"]');
        return Array.from(rows).map((el) => {
          const spans = el.querySelectorAll("span");
          return spans[spans.length - 1]?.textContent?.trim() ?? "";
        });
      });
      expect(new Set(bodies).size).toBe(bodies.length);
    } finally {
      await deleteAllCommentsForBattle(seed.id);
      await teardownLiveBattle(seed.id);
    }
  });
});
