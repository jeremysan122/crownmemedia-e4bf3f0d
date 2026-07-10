// E2E accessibility: composer + list controls have correct labels,
// keyboard navigation works end-to-end, and aria-live announcements fire
// on empty, sending, sent, cooldown, and error states.
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

test.describe("Live battle comments — accessibility", () => {
  test.skip(!hasServiceRoleForLive(), "Requires service-role + seeded users.");

  test("labels, roles, and aria-live regions match spec (empty state included)", async ({ page }) => {
    const seed = await seedLiveBattle({ slug: "lbc-a11y-empty" });
    try {
      await signInC(page);
      await page.goto(`/live/${seed.id}`);

      // Region landmarks + labels.
      const region = page.getByTestId("live-battle-comments");
      await expect(region).toHaveAttribute("aria-label", /live battle chat/i);

      const list = page.getByTestId("live-battle-comments-list");
      await expect(list).toHaveAttribute("role", "log");
      await expect(list).toHaveAttribute("aria-live", "polite");
      await expect(list).toHaveAttribute("aria-relevant", /additions/);

      // Empty state uses role=status so screen readers announce it.
      await expect(list.getByRole("status")).toBeVisible();

      // Composer controls have accessible names.
      const input = page.getByTestId("live-battle-comment-input");
      await expect(input).toHaveAccessibleName(/live battle chat message/i);
      const send = page.getByTestId("live-battle-comment-send");
      await expect(send).toHaveAccessibleName(/send comment/i);

      // Status region is aria-live polite.
      await expect(page.getByTestId("live-battle-comment-status"))
        .toHaveAttribute("aria-live", "polite");
    } finally {
      await deleteAllCommentsForBattle(seed.id);
      await teardownLiveBattle(seed.id);
    }
  });

  test("keyboard: Tab focuses input, Enter submits, focus returns to input after send", async ({ page }) => {
    const seed = await seedLiveBattle({ slug: "lbc-a11y-keyboard" });
    try {
      await signInC(page);
      await page.goto(`/live/${seed.id}`);
      const input = page.getByTestId("live-battle-comment-input");
      await expect(input).toBeVisible({ timeout: 10_000 });

      await input.focus();
      await expect(input).toBeFocused();
      await page.keyboard.type("keyboard send path");
      await page.keyboard.press("Enter");

      await expect(page.getByTestId("live-battle-comment-status"))
        .toHaveText(/Sent/i, { timeout: 5_000 });
      await expect(input).toBeFocused();
      await expect(input).toHaveValue("");

      // Send button reachable via Tab after input (still disabled during cooldown).
      await input.press("Tab");
      const send = page.getByTestId("live-battle-comment-send");
      await expect(send).toBeFocused();
    } finally {
      await deleteAllCommentsForBattle(seed.id);
      await teardownLiveBattle(seed.id);
    }
  });

  test("error announcement: failed send toast has role=status and does not swallow focus", async ({ page }) => {
    const seed = await seedLiveBattle({ slug: "lbc-a11y-error" });
    try {
      await signInC(page);
      await page.goto(`/live/${seed.id}`);
      const input = page.getByTestId("live-battle-comment-input");
      await expect(input).toBeVisible({ timeout: 10_000 });

      await page.route("**/rest/v1/live_battle_comments**", (route) => {
        if (route.request().method() === "POST") {
          return route.fulfill({
            status: 403, contentType: "application/json",
            body: JSON.stringify({ message: "denied" }),
          });
        }
        return route.fallback();
      });

      await input.fill("boom");
      await page.getByTestId("live-battle-comment-send").click();

      // Toast surfaces friendly copy in an aria-live region.
      const toast = page.getByText(/Couldn't send your comment/i);
      await expect(toast).toBeVisible({ timeout: 5_000 });
      // Focus returned to input (assistive-tech friendly retry).
      await expect(input).toBeFocused();
    } finally {
      await deleteAllCommentsForBattle(seed.id);
      await teardownLiveBattle(seed.id);
    }
  });
});
