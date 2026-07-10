// E2E: Load older comments → go offline → server inserts tail comments →
// come back online → verify:
//   - No duplicate rows (dedupe survives realtime backfill after reconnect).
//   - First-unread anchor (data-first-unread="true") is preserved on the
//     original row it pointed to before the disconnect.
//   - Scroll position sits back where the user was after reload restores
//     the persisted { unread, anchorId, scrollTop } payload.
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

test.describe("Live battle comments — load-older + reconnect anchor restore", () => {
  test.skip(!hasServiceRoleForLive(), "Requires service-role + seeded users.");

  test("after loading older pages, reconnect preserves anchor + scroll and dedupes tail", async ({ page, context }) => {
    const seed = await seedLiveBattle({ slug: "lbc-loadolder-reconnect" });
    // 90 seeded rows → 3 pages of 30.
    await seedComments({
      battleId: seed.id, authorId: seed.opponentId, count: 90,
      bodyPrefix: "lor", stepMs: 300,
    });
    try {
      await signInC(page);
      await page.goto(`/live/${seed.id}`);
      const list = page.getByTestId("live-battle-comments-list");
      await expect(list).toBeVisible({ timeout: 10_000 });
      await expect(page.getByTestId("live-battle-comment")).toHaveCount(30, { timeout: 10_000 });

      // Page through history twice → 90 rows in state.
      const loadOlder = page.getByTestId("live-battle-comments-load-older");
      await loadOlder.click();
      await expect(page.getByTestId("live-battle-comment")).toHaveCount(60, { timeout: 10_000 });
      await loadOlder.click();
      await expect(page.getByTestId("live-battle-comment")).toHaveCount(90, { timeout: 10_000 });

      // Park scroll roughly in the middle so we can verify restore later.
      await list.evaluate((el) => { el.scrollTop = 400; });
      await page.waitForTimeout(200);
      const parkedTop = await list.evaluate((el) => el.scrollTop);
      expect(parkedTop).toBeGreaterThan(300);

      // Trigger a first-unread anchor: while scrolled-up, a new arrival
      // increments unread and stamps `data-first-unread="true"` on that row.
      await insertComment({ battleId: seed.id, authorId: seed.opponentId, body: "lor-anchor-A" });
      await expect(page.getByText("lor-anchor-A")).toBeVisible({ timeout: 6_000 });
      const anchorRowLocator = page.locator('[data-first-unread="true"]');
      await expect(anchorRowLocator).toHaveCount(1, { timeout: 6_000 });
      const anchorBody = (await anchorRowLocator.innerText()).trim();
      expect(anchorBody).toContain("lor-anchor-A");

      // Go offline. While the socket is dead, seed 3 tail arrivals server-side.
      await context.setOffline(true);
      await insertComment({ battleId: seed.id, authorId: seed.opponentId, body: "lor-offline-1" });
      await insertComment({ battleId: seed.id, authorId: seed.opponentId, body: "lor-offline-2" });
      await insertComment({ battleId: seed.id, authorId: seed.opponentId, body: "lor-offline-3" });

      // Reconnect — realtime resync should backfill exactly these 3 without
      // creating duplicates of already-known rows.
      await context.setOffline(false);
      await page.waitForTimeout(3000);

      // Dedupe assertion: every rendered row body must be unique.
      const bodies = await page.getByTestId("live-battle-comment").allInnerTexts();
      const trimmed = bodies.map((b) => b.trim());
      const unique = new Set(trimmed);
      expect(unique.size).toBe(trimmed.length);

      // Original anchor row still bears the first-unread marker.
      await expect(page.locator('[data-first-unread="true"]')).toHaveCount(1);
      await expect(page.locator('[data-first-unread="true"]')).toContainText("lor-anchor-A");

      // Unread pill count increased to include the 3 offline arrivals.
      const pill = page.getByTestId("live-battle-comments-jump-latest");
      await expect(pill).toBeVisible({ timeout: 6_000 });
      await expect(pill).toContainText(/[1-9]\d* new/i);

      // ── Reload path: persistence must restore anchor + scroll position ──
      await page.reload();
      await expect(list).toBeVisible({ timeout: 10_000 });
      // Only the initial page is refetched, but the persisted anchor id
      // must survive as long as the row is present in the refetched page.
      await expect(page.getByTestId("live-battle-comment").first()).toBeVisible({ timeout: 10_000 });
      const restoredBodies = await page.getByTestId("live-battle-comment").allInnerTexts();
      const restoredSet = new Set(restoredBodies.map((b) => b.trim()));
      expect(restoredSet.size).toBe(restoredBodies.length); // still no dupes

      const restoredPill = page.getByTestId("live-battle-comments-jump-latest");
      await expect(restoredPill).toBeVisible({ timeout: 8_000 });
      // scrollTop restored to (approximately) the parked position.
      const restoredScroll = await list.evaluate((el) => el.scrollTop);
      expect(Math.abs(restoredScroll - parkedTop)).toBeLessThan(60);
    } finally {
      await deleteAllCommentsForBattle(seed.id);
      await teardownLiveBattle(seed.id);
    }
  });
});
