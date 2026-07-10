// E2E perf: with a large comment history and mobile emulation, the
// live-chat list must remain virtualized (bounded DOM node count) AND
// programmatic scrolling must maintain a healthy frame budget.
import { test, expect, Page, devices } from "@playwright/test";
import {
  seedLiveBattle, teardownLiveBattle, hasServiceRoleForLive,
} from "./helpers/liveBattleSeed";
import {
  seedComments, deleteAllCommentsForBattle,
} from "./helpers/liveBattleCommentSeed";

async function signInC(page: Page) {
  await page.goto("/auth");
  await page.getByLabel(/email/i).fill(process.env.E2E_USER_C_EMAIL!);
  await page.getByLabel(/password/i).fill(process.env.E2E_USER_C_PASSWORD!);
  await page.getByRole("button", { name: /sign in/i }).click();
  await page.waitForURL(/\/(feed|scrolls|me|battles)/, { timeout: 15_000 });
}

// Mobile emulation for this perf check.
test.use({ ...devices["iPhone 13"] });

test.describe("Live battle comments — virtualization perf", () => {
  test.skip(!hasServiceRoleForLive(), "Requires service-role + seeded users.");

  test("bounded DOM count and healthy frame budget while scrolling many comments", async ({ page }) => {
    const seed = await seedLiveBattle({ slug: "lbc-virtperf" });
    // Big backlog: 300 comments. Component pages first 30; the rest arrive
    // via "Load older" clicks. For pure scroll perf we only need the first
    // page (30 rows) rendered under the virtualizer window, but we also
    // load 3 more pages so total rows = 120 to prove bounded DOM.
    await seedComments({
      battleId: seed.id, authorId: seed.opponentId, count: 300,
      bodyPrefix: "vp", stepMs: 200,
    });
    try {
      await signInC(page);
      await page.goto(`/live/${seed.id}`);
      const list = page.getByTestId("live-battle-comments-list");
      await expect(list).toBeVisible({ timeout: 10_000 });
      await expect(page.getByTestId("live-battle-comment")).toHaveCount(30, { timeout: 10_000 });

      // Load 3 more pages → 120 seeded rows in state.
      for (let i = 0; i < 3; i++) {
        await page.getByTestId("live-battle-comments-load-older").click();
        // Wait until this page's rows have appended before clicking again.
        await expect(page.getByTestId("live-battle-comment"))
          .toHaveCount(30 * (i + 2), { timeout: 8_000 });
      }

      // Virtualization invariant: DOM count << total rows in state.
      // On mobile the visible window fits ~4–8 rows; overscan 8 puts an
      // upper bound around ~30. Assert well under total (120).
      const domCount = await page.getByTestId("live-battle-comment").count();
      expect(domCount).toBeLessThan(60);
      expect(domCount).toBeGreaterThan(0);

      // Measure frame times over a programmatic scroll pass.
      const stats = await page.evaluate(async () => {
        const el = document.querySelector<HTMLDivElement>(
          '[data-testid="live-battle-comments-list"]',
        )!;
        const frames: number[] = [];
        let last = performance.now();
        let running = true;
        function loop(t: number) {
          frames.push(t - last);
          last = t;
          if (running) requestAnimationFrame(loop);
        }
        requestAnimationFrame(loop);

        // Sweep the entire virtualized range: bottom → top → bottom.
        const totalHeight = el.scrollHeight;
        const step = 40;
        const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

        for (let y = totalHeight; y >= 0; y -= step) {
          el.scrollTop = y;
          await wait(16);
        }
        for (let y = 0; y <= totalHeight; y += step) {
          el.scrollTop = y;
          await wait(16);
        }
        running = false;
        // Drop the first two frames (setup noise).
        const sample = frames.slice(2).sort((a, b) => a - b);
        const p = (q: number) => sample[Math.floor(sample.length * q)] ?? 0;
        return {
          count: sample.length,
          median: p(0.5),
          p95: p(0.95),
          max: Math.max(...sample),
        };
      });

      // Sanity: we actually collected frames.
      expect(stats.count).toBeGreaterThan(30);
      // Generous thresholds so CI variability doesn't flake the test.
      // Virtualization keeps the median well under a slow-frame budget.
      expect(stats.median).toBeLessThan(50);
      expect(stats.p95).toBeLessThan(120);
    } finally {
      await deleteAllCommentsForBattle(seed.id);
      await teardownLiveBattle(seed.id);
    }
  });
});
