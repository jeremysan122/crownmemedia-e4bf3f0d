// E2E: Live-battle comment composer enforces cooldown, shows cooldown
// feedback, and transitions correctly between loading / sent / error
// states with matching accessible announcements.
import { test, expect, Page } from "@playwright/test";
import {
  seedLiveBattle, teardownLiveBattle, hasServiceRoleForLive,
} from "./helpers/liveBattleSeed";
import { deleteAllCommentsForBattle } from "./helpers/liveBattleCommentSeed";

async function signInC(page: Page) {
  await page.goto("/auth");
  await page.getByLabel(/email/i).fill(process.env.E2E_USER_C_EMAIL!);
  await page.getByLabel(/password/i).fill(process.env.E2E_USER_C_PASSWORD!);
  await page.getByRole("button", { name: /sign in/i }).click();
  await page.waitForURL(/\/(feed|scrolls|me|battles)/, { timeout: 15_000 });
}

test.describe("Live battle comment composer — cooldown + state transitions", () => {
  test.skip(!hasServiceRoleForLive(), "Requires service-role + seeded users.");

  test("send → loading → sent → cooldown feedback → re-enables", async ({ page }) => {
    const seed = await seedLiveBattle({ slug: "lbc-composer-cooldown" });
    try {
      await signInC(page);
      await page.goto(`/live/${seed.id}`);

      const input = page.getByTestId("live-battle-comment-input");
      const send = page.getByTestId("live-battle-comment-send");
      const status = page.getByTestId("live-battle-comment-status");
      await expect(input).toBeVisible({ timeout: 10_000 });
      await expect(status).toHaveAttribute("aria-live", "polite");

      // First send.
      await input.fill("hello cooldown one");
      await send.click();

      // Loading label swaps to "Sending comment" then "Comment sent";
      // status region announces "Sent".
      await expect(send).toHaveAccessibleName(/Sending|Comment sent|Send comment/);
      await expect(status).toHaveText(/Sent/i, { timeout: 5_000 });

      // Cooldown kicks in: send button reports the wait, status shows countdown.
      await input.fill("hello cooldown two");
      await expect(send).toBeDisabled();
      await expect(send).toHaveAccessibleName(/Wait \d+ seconds/i, { timeout: 3_000 });
      await expect(status).toHaveText(/Slow down.*chat again in \ds/i, { timeout: 3_000 });

      // Enter key must not bypass the cooldown either.
      await input.press("Enter");
      // No new row should have been sent — assert by counting rows for our body.
      await expect(
        page.getByTestId("live-battle-comment").filter({ hasText: "hello cooldown two" }),
      ).toHaveCount(0);

      // After the cooldown window elapses, the button re-enables and sending works.
      await expect(send).toBeEnabled({ timeout: 6_000 });
      await send.click();
      await expect(status).toHaveText(/Sent/i, { timeout: 5_000 });
      await expect(
        page.getByTestId("live-battle-comment").filter({ hasText: "hello cooldown two" }),
      ).toHaveCount(1);
    } finally {
      await deleteAllCommentsForBattle(seed.id);
      await teardownLiveBattle(seed.id);
    }
  });

  test("failed insert rolls back optimistic row and surfaces error toast; input keeps focus", async ({ page }) => {
    const seed = await seedLiveBattle({ slug: "lbc-composer-error" });
    try {
      await signInC(page);
      await page.goto(`/live/${seed.id}`);
      const input = page.getByTestId("live-battle-comment-input");
      await expect(input).toBeVisible({ timeout: 10_000 });

      // Force the POST insert to fail *after* first paint.
      await page.route("**/rest/v1/live_battle_comments**", (route) => {
        if (route.request().method() === "POST") {
          return route.fulfill({
            status: 403,
            contentType: "application/json",
            body: JSON.stringify({ message: "new row violates row-level security policy" }),
          });
        }
        return route.fallback();
      });

      await input.fill("this should fail");
      await page.getByTestId("live-battle-comment-send").click();

      // Toast surfaces friendly copy.
      await expect(page.getByText(/Couldn't send your comment/i)).toBeVisible({ timeout: 5_000 });
      // Optimistic row rolled back — body not present.
      await expect(
        page.getByTestId("live-battle-comment").filter({ hasText: "this should fail" }),
      ).toHaveCount(0);
      // Focus returned to the input so the user can retry with keyboard.
      await expect(input).toBeFocused();
    } finally {
      await deleteAllCommentsForBattle(seed.id);
      await teardownLiveBattle(seed.id);
    }
  });
});
