// E2E: network drop → reconnect. While offline, comments arrive server-side.
// Client persists unread count + first-unread anchor to localStorage, so a
// full reload after reconnect restores the "N new" pill AND scroll position
// exactly where the user left off (not slammed to the bottom).
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

test.describe("Live battle comments — network drop and reconnect", () => {
  test.skip(!hasServiceRoleForLive(), "Requires service-role + seeded users.");

  test("unread indicator + scroll position survive offline arrivals + reload", async ({ page, context }) => {
    const seed = await seedLiveBattle({ slug: "lbc-net-drop" });
    await seedComments({
      battleId: seed.id, authorId: seed.opponentId, count: 30,
      bodyPrefix: "nd", stepMs: 500,
    });
    try {
      await signInC(page);
      await page.goto(`/live/${seed.id}`);
      const list = page.getByTestId("live-battle-comments-list");
      await expect(list).toBeVisible({ timeout: 10_000 });
      await expect(page.getByTestId("live-battle-comment")).toHaveCount(30, { timeout: 10_000 });

      // Scroll up so the user is anchored in history — unread starts to matter.
      await list.evaluate((el) => { el.scrollTop = 40; });
      await page.waitForTimeout(150);
      const savedScroll = await list.evaluate((el) => el.scrollTop);

      // Drop the network. Any realtime channel breaks; RPC calls fail.
      await context.setOffline(true);

      // Server-side inserts happen from a different context (service role
      // over the CDP-controlled fetch is bypassed by the seed helper which
      // uses its own http client outside the browser network stack).
      await insertComment({ battleId: seed.id, authorId: seed.opponentId, body: "nd-offline-A" });
      await insertComment({ battleId: seed.id, authorId: seed.opponentId, body: "nd-offline-B" });
      await insertComment({ battleId: seed.id, authorId: seed.opponentId, body: "nd-offline-C" });

      // Bring the network back and give realtime a moment to backfill.
      await context.setOffline(false);
      await page.waitForTimeout(2500);

      // Pill should appear with the 3 offline arrivals once realtime resyncs.
      const pill = page.getByTestId("live-battle-comments-jump-latest");
      await expect(pill).toBeVisible({ timeout: 10_000 });
      await expect(pill).toHaveText(/3 new/i);

      // Full reload — this is the crucial persistence check.
      await page.reload();
      await expect(list).toBeVisible({ timeout: 10_000 });
      await expect(page.getByTestId("live-battle-comment")).toHaveCount(30, { timeout: 10_000 });

      // Unread pill restored from localStorage on the fresh mount.
      const restoredPill = page.getByTestId("live-battle-comments-jump-latest");
      await expect(restoredPill).toBeVisible({ timeout: 8_000 });
      await expect(restoredPill).toHaveText(/3 new/i);

      // Scroll position restored to (approximately) where we left it.
      const restoredScroll = await list.evaluate((el) => el.scrollTop);
      expect(Math.abs(restoredScroll - savedScroll)).toBeLessThan(50);

      // Activating the pill clears the persisted state.
      await restoredPill.click();
      await expect(page.getByTestId("live-battle-comments-jump-latest")).toHaveCount(0, { timeout: 4_000 });
      const stored = await page.evaluate(
        (key) => window.localStorage.getItem(key),
        `lbc:unread:${seed.id}`,
      );
      expect(stored).toBeNull();
    } finally {
      await deleteAllCommentsForBattle(seed.id);
      await teardownLiveBattle(seed.id);
    }
  });
});
