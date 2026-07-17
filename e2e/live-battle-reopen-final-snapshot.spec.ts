// Reopening /live/:id after a long idle must load the exact final weighted
// leaderboard snapshot from the backend — no transient pre-ended flicker.
import { test, expect } from "@playwright/test";
import { hasServiceRoleForLive, seedLiveBattle, signInAsSeed } from "./helpers/liveBattleSeed";

test.skip(!hasServiceRoleForLive(), "Requires service-role + seeded users.");

test("reopen after idle shows final snapshot without live-state flicker", async ({ page }) => {
  const { battleId, viewer } = await seedLiveBattle({
    status: "ended", host_votes: 42, opponent_votes: 17, duration_seconds: 300,
  });
  await signInAsSeed(page, viewer);

  // First visit.
  await page.goto(`/live/${battleId}`);
  await expect(page.getByTestId("live-battle-ended")).toBeVisible();

  // Simulate long idle: navigate away, wait, come back.
  await page.goto("/battles");
  await page.waitForTimeout(1500);
  await page.goto(`/live/${battleId}`);

  // Live-state UI (timer / vote buttons) must never render during load.
  const liveTimer = page.getByTestId("live-battle-timer");
  await Promise.all([
    expect(page.getByTestId("live-battle-ended")).toBeVisible({ timeout: 5000 }),
    expect(liveTimer).toHaveCount(0),
    expect(page.getByTestId("live-vote-host")).toHaveCount(0),
  ]);
  await expect(page.getByTestId("live-battle-ended")).toContainText("42");
  await expect(page.getByTestId("live-battle-ended")).toContainText("17");
});
