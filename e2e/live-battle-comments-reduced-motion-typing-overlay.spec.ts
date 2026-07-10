// E2E: With prefers-reduced-motion=reduce active, the live comments
// overlay must:
//   - Skip smooth-scroll animations when auto-scrolling new arrivals
//     (scroll-behavior must be 'auto', not 'smooth').
//   - Perform an instant jump (single scrollTop update, no animation
//     frames) when the "jump to latest" pill is used.
//   - Preserve aria-live behavior on BOTH the comments log region AND
//     the typing indicator region — a11y must not regress just because
//     motion is reduced.
import { test, expect, Page } from "@playwright/test";
import {
  seedLiveBattle, teardownLiveBattle, hasServiceRoleForLive,
} from "./helpers/liveBattleSeed";
import {
  seedComments, insertComment, deleteAllCommentsForBattle,
} from "./helpers/liveBattleCommentSeed";

async function signIn(page: Page, email: string, password: string) {
  await page.goto("/auth");
  await page.getByLabel(/email/i).fill(email);
  await page.getByLabel(/password/i).fill(password);
  await page.getByRole("button", { name: /sign in/i }).click();
  await page.waitForURL(/\/(feed|scrolls|me|battles)/, { timeout: 15_000 });
}

const canRun =
  hasServiceRoleForLive() &&
  !!process.env.E2E_USER_A_EMAIL && !!process.env.E2E_USER_A_PASSWORD &&
  !!process.env.E2E_USER_B_EMAIL && !!process.env.E2E_USER_B_PASSWORD;

test.describe("Live battle comments — reduced-motion disables smooth-scroll but keeps aria-live", () => {
  test.skip(!canRun, "Requires service-role + two seeded E2E users.");

  test("no smooth animations under reduced-motion; typing overlay aria-live still fires", async ({ browser }) => {
    const seed = await seedLiveBattle({ slug: "lbc-reduced-motion-typing", status: "live" });
    // Two contexts: A (typer/sender) + B (viewer with reduced-motion on).
    const aCtx = await browser.newContext();
    const bCtx = await browser.newContext({
      reducedMotion: "reduce",
      viewport: { width: 390, height: 780 },
    });
    const aPage = await aCtx.newPage();
    const bPage = await bCtx.newPage();
    try {
      // Belt-and-braces: also set the CSS-level media at runtime for pages
      // that check `matchMedia` at first render.
      await bPage.emulateMedia({ reducedMotion: "reduce" });

      // Seed enough comments so the log is scrollable in B's viewport.
      await seedComments({
        battleId: seed.id, authorId: seed.opponentId, count: 40,
        bodyPrefix: "rm", stepMs: 400,
      });

      await signIn(aPage, process.env.E2E_USER_A_EMAIL!, process.env.E2E_USER_A_PASSWORD!);
      await signIn(bPage, process.env.E2E_USER_B_EMAIL!, process.env.E2E_USER_B_PASSWORD!);

      await aPage.goto(`/live/${seed.id}`);
      await bPage.goto(`/live/${seed.id}`);
      const list = bPage.getByTestId("live-battle-comments-list");
      await expect(list).toBeVisible({ timeout: 10_000 });

      // matchMedia truly reports reduce — otherwise the rest of the test
      // would be measuring the wrong branch.
      const reduces = await bPage.evaluate(
        () => window.matchMedia("(prefers-reduced-motion: reduce)").matches,
      );
      expect(reduces).toBe(true);

      // The scrollable list's computed scroll-behavior must NOT be 'smooth'
      // under reduced motion. CSS defaults to 'auto', component may set
      // 'smooth' only when motion is allowed.
      const sb = await list.evaluate((el) => getComputedStyle(el).scrollBehavior);
      expect(sb).not.toBe("smooth");

      // Scroll up so we're NOT pinned to bottom — arrivals should show
      // the unread pill, and the "jump to latest" must be an instant jump.
      await list.evaluate((el) => { el.scrollTop = 20; });
      await bPage.waitForTimeout(150);
      const savedTop = await list.evaluate((el) => el.scrollTop);
      expect(savedTop).toBeLessThan(200);

      // Two new server-side arrivals via realtime.
      await insertComment({ battleId: seed.id, authorId: seed.opponentId, body: "rm-new-1" });
      await insertComment({ battleId: seed.id, authorId: seed.opponentId, body: "rm-new-2" });

      const pill = bPage.getByTestId("live-battle-comments-jump-latest");
      await expect(pill).toBeVisible({ timeout: 8_000 });

      // Jump to latest: measure scrollTop right after click; a smooth
      // animation would still be interpolating, an instant jump would
      // already be at the max. Under reduced-motion we require instant.
      const [beforeMax, afterTopImmediate, maxScroll] = await (async () => {
        const before = await list.evaluate((el) => ({ top: el.scrollTop, max: el.scrollHeight - el.clientHeight }));
        await pill.click();
        // No wait — capture the first paint after click.
        const after = await list.evaluate((el) => el.scrollTop);
        return [before.top, after, before.max];
      })();
      expect(beforeMax).toBeLessThan(maxScroll - 10);
      // Instant jump: within a couple of px of the bottom immediately.
      expect(Math.abs(afterTopImmediate - maxScroll)).toBeLessThan(8);

      // Pill clears after the jump (unread reset).
      await expect(pill).toHaveCount(0, { timeout: 5_000 });

      // ── aria-live contracts survive reduced-motion ─────────────────────
      // Comments log region.
      await expect(list).toHaveAttribute("aria-live", /polite|off/);

      // Typing indicator: A types → B still hears "typing…" via polite
      // live region announcement (motion setting is unrelated to a11y).
      const typingRegion = bPage.getByTestId("live-battle-comments-typing");
      await expect(typingRegion).toHaveAttribute("role", "status");
      await expect(typingRegion).toHaveAttribute("aria-live", "polite");
      await expect(typingRegion).toHaveAttribute("aria-atomic", "true");
      await expect(typingRegion).toHaveText("");

      const aInput = aPage.getByTestId("live-battle-comment-input");
      await aInput.focus();
      await aInput.type("reduced-motion burst", { delay: 40 });
      await expect(typingRegion).toHaveText(/typing/i, { timeout: 6_000 });

      // Stop typing → region clears (TTL sweep is not animated so RM
      // has no effect here — but the announcement must still clear).
      await aInput.blur();
      await expect(typingRegion).toHaveText("", { timeout: 8_000 });

      // Attributes preserved end-to-end.
      await expect(typingRegion).toHaveAttribute("aria-live", "polite");
    } finally {
      await aCtx.close();
      await bCtx.close();
      await deleteAllCommentsForBattle(seed.id);
      await teardownLiveBattle(seed.id);
    }
  });
});
