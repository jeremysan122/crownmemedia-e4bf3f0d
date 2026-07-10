// E2E perf: low-end Android emulation (Pixel 5 viewport + 6x CPU throttle
// via CDP). Confirms virtualization keeps a bounded DOM node count and that
// median/p95 frame times stay within our chat budget even on slow hardware.
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

// Pixel 5 approximates a mid-to-low-end Android device.
test.use({ ...devices["Pixel 5"] });

test.describe("Live battle comments — low-end Android virtualization perf", () => {
  test.skip(!hasServiceRoleForLive(), "Requires service-role + seeded users.");

  test("bounded DOM + healthy frame budget under 6x CPU throttle", async ({ page, browserName }) => {
    test.skip(browserName !== "chromium", "CDP CPU throttling is Chromium-only.");
    const seed = await seedLiveBattle({ slug: "lbc-lowend-perf" });
    await seedComments({
      battleId: seed.id, authorId: seed.opponentId, count: 300,
      bodyPrefix: "le", stepMs: 200,
    });
    try {
      await signInC(page);

      // Throttle CPU BEFORE navigating to the battle page so the whole
      // render + scroll path runs on the slow "device".
      const client = await page.context().newCDPSession(page);
      await client.send("Emulation.setCPUThrottlingRate", { rate: 6 });

      await page.goto(`/live/${seed.id}`);
      const list = page.getByTestId("live-battle-comments-list");
      await expect(list).toBeVisible({ timeout: 15_000 });
      await expect(page.getByTestId("live-battle-comment")).toHaveCount(30, { timeout: 15_000 });

      // Load 3 more pages → 120 seeded rows in state.
      for (let i = 0; i < 3; i++) {
        await page.getByTestId("live-battle-comments-load-older").click();
        await expect(page.getByTestId("live-battle-comment"))
          .toHaveCount(30 * (i + 2), { timeout: 15_000 });
      }

      // Virtualization invariant: DOM count << total rows in state.
      const domCount = await page.getByTestId("live-battle-comment").count();
      expect(domCount).toBeLessThan(60);
      expect(domCount).toBeGreaterThan(0);

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
        const sample = frames.slice(2).sort((a, b) => a - b);
        const p = (q: number) => sample[Math.floor(sample.length * q)] ?? 0;
        return {
          count: sample.length,
          median: p(0.5),
          p95: p(0.95),
        };
      });

      // Release the throttle before assertions so the harness doesn't hang.
      await client.send("Emulation.setCPUThrottlingRate", { rate: 1 });

      expect(stats.count).toBeGreaterThan(30);
      // Low-end thresholds — looser than the desktop perf test but still
      // proves virtualization is doing real work here.
      expect(stats.median).toBeLessThan(120);
      expect(stats.p95).toBeLessThan(280);
    } finally {
      await deleteAllCommentsForBattle(seed.id);
      await teardownLiveBattle(seed.id);
    }
  });
});
