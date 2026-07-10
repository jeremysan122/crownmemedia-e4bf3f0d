// Verifies the LiveBattleVoteChip announces pending → confirmed and
// pending → failed transitions through the persistent aria-live announcer,
// and that once the battle ends the vote controls unmount (no more chip
// updates) but any final "confirmed" announcement already made stays put.
import { test, expect } from "@playwright/test";
import {
  adminClient, seedLiveBattle, teardownLiveBattle, hasServiceRoleForLive,
} from "./helpers/liveBattleSeed";

test.describe("Live battle — chip aria-live announcements", () => {
  test.skip(!hasServiceRoleForLive(), "Requires service-role + seeded users.");

  async function signInViewer(page: import("@playwright/test").Page) {
    await page.goto("/auth");
    await page.getByLabel(/email/i).fill(process.env.E2E_USER_C_EMAIL!);
    await page.getByLabel(/password/i).fill(process.env.E2E_USER_C_PASSWORD!);
    await page.getByRole("button", { name: /sign in/i }).click();
    await page.waitForURL(/\/(feed|scrolls|me|battles)/, { timeout: 15_000 });
  }

  test("pending → confirmed announcement, then no further updates after end", async ({ page }) => {
    const admin = adminClient();
    const seed = await seedLiveBattle({ slug: "chip-aria-confirm", durationSeconds: 900 });
    try {
      await signInViewer(page);
      await page.goto(`/live/${seed.id}`);
      await expect(page.getByTestId("live-vote-host")).toBeEnabled({ timeout: 8_000 });

      await page.getByTestId("live-vote-host").click();

      const announcer = page.getByTestId("vote-chip-announcer");
      await expect(announcer).toHaveText(/Counting your vote/i, { timeout: 3_000 });
      await expect(announcer).toHaveAttribute("aria-live", "polite");

      await expect(announcer).toHaveText(/Vote confirmed/i, { timeout: 8_000 });

      // End the battle — the vote controls (and the announcer inside them)
      // must fully unmount and stop taking updates.
      await admin.from("live_battles")
        .update({ status: "ended", ended_reason: "e2e_aria_confirm", ends_at: new Date(Date.now() - 1_000).toISOString() })
        .eq("id", seed.id);
      await expect(page.getByTestId("live-battle-ended")).toBeVisible({ timeout: 8_000 });
      await expect(page.getByTestId("vote-chip-announcer")).toHaveCount(0);
      await expect(page.getByTestId("live-vote-host")).toHaveCount(0);
    } finally {
      await teardownLiveBattle(seed.id);
    }
  });

  test("pending → failed announcement uses assertive politeness", async ({ page }) => {
    const seed = await seedLiveBattle({ slug: "chip-aria-fail", durationSeconds: 900 });
    try {
      await signInViewer(page);

      // Force the RPC to reject.
      await page.route("**/rest/v1/rpc/live_battle_vote", (route) =>
        route.fulfill({ status: 400, body: JSON.stringify({ message: "rate_limited:60" }) })
      );

      await page.goto(`/live/${seed.id}`);
      await page.getByTestId("live-vote-opponent").click();

      const announcer = page.getByTestId("vote-chip-announcer");
      await expect(announcer).toHaveText(/Vote failed/i, { timeout: 6_000 });
      await expect(announcer).toHaveAttribute("aria-live", "assertive");
    } finally {
      await teardownLiveBattle(seed.id);
    }
  });
});
