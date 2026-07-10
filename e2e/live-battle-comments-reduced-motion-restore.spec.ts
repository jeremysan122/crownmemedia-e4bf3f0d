// E2E: reduced-motion RESTORE path.
// Focus is on the restore behavior specifically:
//   1. Auto-scroll (stick-to-bottom) after a new tail arrival snaps to the
//      bottom WITHOUT `behavior: 'smooth'` when reduced-motion is set.
//   2. The "Jump to latest" button also restores the scroll instantly
//      (no smooth animation frames).
// We spy on Element.prototype.scrollTo BEFORE mount so we can inspect every
// call the overlay makes.
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

test.use({ reducedMotion: "reduce" });

test.describe("Live battle comments — reduced-motion restore path", () => {
  test.skip(!hasServiceRoleForLive(), "Requires service-role + seeded users.");

  test("auto-scroll and jump-to-latest restore without smooth animations", async ({ page }) => {
    const seed = await seedLiveBattle({ slug: "lbc-rm-restore" });
    await seedComments({
      battleId: seed.id, authorId: seed.opponentId, count: 20,
      bodyPrefix: "rmr", stepMs: 400,
    });
    try {
      await signInC(page);

      // Instrument scrollTo BEFORE app JS runs so the overlay's very first
      // scroll calls are captured.
      await page.addInitScript(() => {
        (window as any).__scrollCalls = [] as Array<{ behavior: string | null; top: number | null }>;
        const orig = Element.prototype.scrollTo;
        Element.prototype.scrollTo = function (...args: any[]) {
          const opts = typeof args[0] === "object" ? args[0] : { top: args[1], behavior: undefined };
          (window as any).__scrollCalls.push({
            behavior: opts?.behavior ?? null,
            top: typeof opts?.top === "number" ? opts.top : null,
          });
          return orig.apply(this, args as any);
        };
      });

      await page.goto(`/live/${seed.id}`);
      const list = page.getByTestId("live-battle-comments-list");
      await expect(list).toBeVisible({ timeout: 10_000 });
      await expect(page.getByTestId("live-battle-comment")).toHaveCount(20, { timeout: 10_000 });

      // ── (1) Auto-scroll on new tail arrival ─────────────────────────────
      // While stuck-to-bottom, a new comment must snap the view without
      // smooth scrolling. Reset the call log first so we only see the calls
      // caused by this specific arrival.
      await page.evaluate(() => { (window as any).__scrollCalls.length = 0; });
      await insertComment({ battleId: seed.id, authorId: seed.opponentId, body: "rmr-tail-1" });
      await expect(page.getByText("rmr-tail-1")).toBeVisible({ timeout: 6_000 });

      const autoCalls = await page.evaluate(() => (window as any).__scrollCalls as Array<{ behavior: string | null }>);
      expect(autoCalls.length).toBeGreaterThan(0);
      // Absolutely no smooth behavior under reduced motion.
      for (const c of autoCalls) {
        expect(c.behavior === "smooth").toBeFalsy();
      }

      // ── (2) Jump-to-latest restore ──────────────────────────────────────
      // Scroll up to detach from the bottom, receive more arrivals, then
      // click the pill. The restore must also be instant (no smooth).
      await list.evaluate((el) => { el.scrollTop = 0; });
      await page.waitForTimeout(150);
      await insertComment({ battleId: seed.id, authorId: seed.opponentId, body: "rmr-tail-2" });
      await insertComment({ battleId: seed.id, authorId: seed.opponentId, body: "rmr-tail-3" });

      const pill = page.getByTestId("live-battle-comments-jump-latest");
      await expect(pill).toBeVisible({ timeout: 6_000 });
      // Under reduced-motion the pill exposes this attribute for CSS/animation opt-out.
      await expect(pill).toHaveAttribute("data-reduced-motion", "true");

      await page.evaluate(() => { (window as any).__scrollCalls.length = 0; });
      await pill.click();

      // After the click the pill must disappear and we must be at the bottom.
      await expect(pill).toHaveCount(0, { timeout: 4_000 });
      const atBottom = await list.evaluate((el) => Math.abs(el.scrollHeight - el.clientHeight - el.scrollTop) < 4);
      expect(atBottom).toBeTruthy();

      const jumpCalls = await page.evaluate(() => (window as any).__scrollCalls as Array<{ behavior: string | null }>);
      expect(jumpCalls.length).toBeGreaterThan(0);
      for (const c of jumpCalls) {
        expect(c.behavior === "smooth").toBeFalsy();
      }
    } finally {
      await deleteAllCommentsForBattle(seed.id);
      await teardownLiveBattle(seed.id);
    }
  });
});
