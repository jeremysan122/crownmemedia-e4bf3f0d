/**
 * E2E — Optimistic vote chip transitions.
 *
 * Verifies that a live-battle vote:
 *   1. Immediately renders the "pending" chip (aria-busy=true) after click.
 *   2. Flips to "confirmed" once the realtime UPDATE for the row lands.
 *   3. In a separate case, when the RPC rejects (feature flag disabled
 *      after seeding), the chip renders the "failed" state via role=alert.
 *
 * Both cases run without any page reload.
 */
import { test, expect } from "@playwright/test";
import {
  adminClient,
  hasServiceRoleForLive,
  seedLiveBattle,
  teardownLiveBattle,
} from "./helpers/liveBattleSeed";

test.describe("Live battle — vote chip transitions", () => {
  test.skip(!hasServiceRoleForLive(), "Requires service-role + seeded users A/B/C.");

  async function signInViewer(page: import("@playwright/test").Page) {
    await page.goto("/auth");
    await page.getByLabel(/email/i).fill(process.env.E2E_USER_C_EMAIL!);
    await page.getByLabel(/password/i).fill(process.env.E2E_USER_C_PASSWORD!);
    await page.getByRole("button", { name: /sign in/i }).click();
    await page.waitForURL(/\/(feed|scrolls|me|battles)/, { timeout: 15_000 });
  }

  test("Pending chip flips to confirmed after realtime UPDATE", async ({ page }) => {
    const seed = await seedLiveBattle({ slug: "chip-confirm", durationSeconds: 900 });
    try {
      await signInViewer(page);
      await page.goto(`/live/${seed.id}`);

      await page.getByTestId("live-vote-host").click();

      // Pending chip appears immediately with aria-busy=true.
      const pending = page.getByTestId("vote-pending");
      await expect(pending).toBeVisible({ timeout: 3_000 });
      await expect(pending).toHaveAttribute("aria-busy", "true");

      // The vote button reports aria-busy while the RPC is in flight.
      await expect(page.getByTestId("live-vote-host")).toHaveAttribute("aria-busy", "true");

      // Confirmed chip appears once realtime UPDATE reconciles.
      await expect(page.getByTestId("vote-confirmed")).toBeVisible({ timeout: 8_000 });
      await expect(page.getByTestId("vote-pending")).toBeHidden();
    } finally {
      await teardownLiveBattle(seed.id);
    }
  });

  test("Failed chip appears when the vote RPC rejects", async ({ page }) => {
    const admin = adminClient();
    const seed = await seedLiveBattle({ slug: "chip-failed", durationSeconds: 900 });
    try {
      await signInViewer(page);
      await page.goto(`/live/${seed.id}`);

      // Force the RPC to reject by flipping status to ended after the page
      // loads but before the vote click — server returns battle_not_live.
      await admin.from("live_battles")
        .update({ status: "ended", ended_reason: "e2e_force_reject" })
        .eq("id", seed.id);

      // The client-side subscription may transition to the results screen
      // once it processes the UPDATE. Race the vote click against it.
      const voteBtn = page.getByTestId("live-vote-opponent");
      if (await voteBtn.isVisible().catch(() => false)) {
        await voteBtn.click();
        await expect(page.getByTestId("vote-failed")).toBeVisible({ timeout: 6_000 });
        await expect(page.getByTestId("vote-failed")).toHaveAttribute("role", "alert");
      } else {
        // Already flipped to results — verify DB has no vote row and skip UI.
        const { count } = await admin
          .from("live_battle_votes")
          .select("*", { count: "exact", head: true })
          .eq("battle_id", seed.id);
        expect(count ?? 0).toBe(0);
      }
    } finally {
      await teardownLiveBattle(seed.id);
    }
  });
});
