// E2E: Live-battle comments overlay under prefers-reduced-motion.
//  - Emulates the OS "reduce motion" setting.
//  - Verifies core UX still works (auto-scroll, unread pill, jump-to-latest).
//  - Verifies motion-heavy affordances (typing dots, jump pill slide-in,
//    per-row slide-in) drop their animation classes and use static fallbacks.
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

// Emulate the OS-level reduce-motion setting for the whole page.
test.use({ reducedMotion: "reduce" });

test.describe("Live battle comments — reduced-motion mode", () => {
  test.skip(!hasServiceRoleForLive(), "Requires service-role + seeded users.");

  test("chat overlay stays usable and drops motion-heavy animation classes", async ({ page, browser }) => {
    const seed = await seedLiveBattle({ slug: "lbc-reduced-motion" });
    await seedComments({
      battleId: seed.id, authorId: seed.opponentId, count: 12,
      bodyPrefix: "rm", stepMs: 400,
    });
    try {
      await signInC(page);
      await page.goto(`/live/${seed.id}`);

      const list = page.getByTestId("live-battle-comments-list");
      await expect(list).toBeVisible({ timeout: 10_000 });
      await expect(page.getByTestId("live-battle-comment")).toHaveCount(12, { timeout: 10_000 });

      // Message rows must render, but WITHOUT the fade/slide-in animation
      // classes that non-reduced mode uses.
      const rowClass = await page.getByTestId("live-battle-comment").first().getAttribute("class");
      expect(rowClass ?? "").not.toMatch(/slide-in-from-bottom-1/);
      expect(rowClass ?? "").not.toMatch(/\banimate-in\b/);

      // Scroll up → new comment arrives → pill appears with unread count.
      await list.evaluate((el) => { el.scrollTop = 0; });
      await page.waitForTimeout(200);
      await insertComment({ battleId: seed.id, authorId: seed.opponentId, body: "rm-new-1" });

      const pill = page.getByTestId("live-battle-comments-jump-latest");
      await expect(pill).toBeVisible({ timeout: 6_000 });
      await expect(pill).toHaveText(/1 new/i);
      // Jump-to-latest pill drops slide/fade-in animation under reduced motion.
      await expect(pill).toHaveAttribute("data-reduced-motion", "true");
      const pillClass = await pill.getAttribute("class");
      expect(pillClass ?? "").not.toMatch(/slide-in-from-bottom-2/);
      expect(pillClass ?? "").not.toMatch(/\banimate-in\b/);

      // Pill still works: click resets unread and scrolls to newest.
      await pill.click();
      await expect(page.getByTestId("live-battle-comments-jump-latest")).toHaveCount(0, { timeout: 4_000 });
      // "auto" behavior (no smooth) settles immediately.
      await page.waitForTimeout(150);
      const atBottom = await page.evaluate(() => {
        const el = document.querySelector<HTMLDivElement>(
          '[data-testid="live-battle-comments-list"]',
        );
        return !!el && el.scrollHeight - el.scrollTop - el.clientHeight < 8;
      });
      expect(atBottom).toBe(true);

      // Typing indicator: dots use a static opacity fallback, not animate-bounce.
      if (
        process.env.E2E_USER_A_EMAIL && process.env.E2E_USER_A_PASSWORD &&
        seed.opponentId !== process.env.E2E_USER_A_ID
      ) {
        const aCtx = await browser.newContext(); // A's context does NOT reduce motion — we're only asserting on the reader.
        const aPage = await aCtx.newPage();
        try {
          await aPage.goto("/auth");
          await aPage.getByLabel(/email/i).fill(process.env.E2E_USER_A_EMAIL!);
          await aPage.getByLabel(/password/i).fill(process.env.E2E_USER_A_PASSWORD!);
          await aPage.getByRole("button", { name: /sign in/i }).click();
          await aPage.waitForURL(/\/(feed|scrolls|me|battles)/, { timeout: 15_000 });
          await aPage.goto(`/live/${seed.id}`);
          await expect(aPage.getByTestId("live-battle-comments-list")).toBeVisible({ timeout: 10_000 });

          await aPage.getByTestId("live-battle-comment-input").type("hey ", { delay: 30 });
          const typing = page.getByTestId("live-battle-comments-typing");
          await expect(typing).toHaveText(/typing/i, { timeout: 6_000 });
          const dotsWrap = typing.locator('[data-reduced-motion="true"]');
          await expect(dotsWrap).toHaveCount(1);
          const dotClass = await dotsWrap.locator("span").first().getAttribute("class");
          expect(dotClass ?? "").not.toMatch(/animate-bounce/);
        } finally {
          await aCtx.close();
        }
      }
    } finally {
      await deleteAllCommentsForBattle(seed.id);
      await teardownLiveBattle(seed.id);
    }
  });
});
