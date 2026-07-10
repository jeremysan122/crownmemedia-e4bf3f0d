// E2E: Load older comments → go offline mid-pagination → server inserts new
// tail comments → reconnect → verify:
//   - The first-unread anchor (data-first-unread="true") points at the SAME
//     row it did before the disconnect (unchanged despite tail arrivals).
//   - Scroll position sits within a small delta of where it was pre-offline.
//   - No duplicate comment bodies rendered after realtime backfill.
//   - The unread-count pill includes every tail insert received on reconnect.
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

test.describe("Live battle comments — offline mid-pagination tail restore", () => {
  test.skip(!hasServiceRoleForLive(), "Requires service-role + seeded users.");

  test("anchor + scroll survive offline tail inserts and reconnect dedupes", async ({ page, context }) => {
    const seed = await seedLiveBattle({ slug: "lbc-loadolder-offline-tail" });
    // 90 rows = 3 pages of 30.
    await seedComments({
      battleId: seed.id, authorId: seed.opponentId, count: 90,
      bodyPrefix: "lot", stepMs: 300,
    });
    try {
      await signInC(page);
      await page.goto(`/live/${seed.id}`);
      const list = page.getByTestId("live-battle-comments-list");
      await expect(list).toBeVisible({ timeout: 10_000 });
      await expect(page.getByTestId("live-battle-comment")).toHaveCount(30, { timeout: 10_000 });

      const loadOlder = page.getByTestId("live-battle-comments-load-older");
      // Page 2 loaded fully before we go offline; page 3 will happen after
      // reconnect — this is what "offline mid-pagination" means here.
      await loadOlder.click();
      await expect(page.getByTestId("live-battle-comment")).toHaveCount(60, { timeout: 10_000 });

      // Park the scroll roughly mid-history so restore is meaningful.
      await list.evaluate((el) => { el.scrollTop = 380; });
      await page.waitForTimeout(200);
      const parkedTop = await list.evaluate((el) => el.scrollTop);
      expect(parkedTop).toBeGreaterThan(280);

      // Force an anchor to appear: a new arrival while scrolled up stamps
      // data-first-unread="true" on that row.
      await insertComment({ battleId: seed.id, authorId: seed.opponentId, body: "lot-anchor-X" });
      await expect(page.getByText("lot-anchor-X")).toBeVisible({ timeout: 6_000 });
      const anchor = page.locator('[data-first-unread="true"]');
      await expect(anchor).toHaveCount(1, { timeout: 6_000 });
      const anchorTextBefore = (await anchor.innerText()).trim();
      expect(anchorTextBefore).toContain("lot-anchor-X");

      // ── Go offline mid-pagination ──────────────────────────────────────
      await context.setOffline(true);

      // Server-side tail inserts while the socket is dead. These must not
      // clobber the anchor, and must not be duplicated on reconnect.
      await insertComment({ battleId: seed.id, authorId: seed.opponentId, body: "lot-tail-1" });
      await insertComment({ battleId: seed.id, authorId: seed.opponentId, body: "lot-tail-2" });
      await insertComment({ battleId: seed.id, authorId: seed.opponentId, body: "lot-tail-3" });

      // Wait long enough that any realtime queueing would have flushed if
      // it were going to bypass the offline gate.
      await page.waitForTimeout(400);

      // ── Reconnect ──────────────────────────────────────────────────────
      await context.setOffline(false);
      // Realtime resync backfills the 3 tail rows.
      await expect(page.getByText("lot-tail-3")).toBeVisible({ timeout: 10_000 });

      // Anchor is UNCHANGED — still on lot-anchor-X, still exactly one.
      await expect(anchor).toHaveCount(1);
      const anchorTextAfter = (await page.locator('[data-first-unread="true"]').innerText()).trim();
      expect(anchorTextAfter).toBe(anchorTextBefore);

      // No duplicate comment bodies rendered.
      const bodies = (await page.getByTestId("live-battle-comment").allInnerTexts())
        .map((b) => b.trim());
      const uniq = new Set(bodies);
      expect(uniq.size).toBe(bodies.length);
      // And each tail row appears exactly once.
      for (const tail of ["lot-tail-1", "lot-tail-2", "lot-tail-3"]) {
        expect(bodies.filter((b) => b.includes(tail)).length).toBe(1);
      }

      // Scroll position preserved within a small delta despite tail growth.
      const restoredTop = await list.evaluate((el) => el.scrollTop);
      expect(Math.abs(restoredTop - parkedTop)).toBeLessThan(60);

      // Unread pill counts the offline tail inserts too.
      const pill = page.getByTestId("live-battle-comments-jump-latest");
      await expect(pill).toBeVisible({ timeout: 6_000 });
      const pillText = await pill.innerText();
      const num = Number((pillText.match(/(\d+)\s*new/i) || [])[1] ?? "0");
      // Anchor arrival (1) + 3 tail arrivals = at least 4.
      expect(num).toBeGreaterThanOrEqual(4);
    } finally {
      await deleteAllCommentsForBattle(seed.id);
      await teardownLiveBattle(seed.id);
    }
  });
});
