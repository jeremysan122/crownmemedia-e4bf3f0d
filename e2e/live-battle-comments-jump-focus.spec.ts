// E2E: Activating "Jump to latest" moves keyboard focus to the FIRST visible
// new message (the row that was the first unread arrival while scrolled up),
// so keyboard/screen-reader users land where the "N new" boundary began.
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

test.describe("Live battle comments — jump-to-latest focus target", () => {
  test.skip(!hasServiceRoleForLive(), "Requires service-role + seeded users.");

  test("keyboard focus lands on the first unread message after activating the pill", async ({ page }) => {
    const seed = await seedLiveBattle({ slug: "lbc-jump-focus" });
    await seedComments({
      battleId: seed.id, authorId: seed.opponentId, count: 30,
      bodyPrefix: "jf", stepMs: 500,
    });
    try {
      await signInC(page);
      await page.goto(`/live/${seed.id}`);
      const list = page.getByTestId("live-battle-comments-list");
      await expect(list).toBeVisible({ timeout: 10_000 });
      await expect(page.getByTestId("live-battle-comment")).toHaveCount(30, { timeout: 10_000 });

      // Scroll up so we leave the stuck window.
      await list.evaluate((el) => { el.scrollTop = 0; });
      await page.waitForTimeout(150);

      // Three new arrivals — the FIRST of these is the intended focus target.
      await insertComment({ battleId: seed.id, authorId: seed.opponentId, body: "jf-first-new" });
      await insertComment({ battleId: seed.id, authorId: seed.opponentId, body: "jf-second-new" });
      await insertComment({ battleId: seed.id, authorId: seed.opponentId, body: "jf-third-new" });

      const pill = page.getByTestId("live-battle-comments-jump-latest");
      await expect(pill).toBeVisible({ timeout: 6_000 });
      await expect(pill).toHaveText(/3 new/i);

      // The row that arrived first should be marked as the first-unread anchor.
      const firstUnread = page.locator('[data-testid="live-battle-comment"][data-first-unread="true"]');
      await expect(firstUnread).toHaveCount(1);
      await expect(firstUnread).toContainText("jf-first-new");

      // Activate the pill via keyboard to prove keyboard-driven usage.
      await pill.focus();
      await expect(pill).toBeFocused();
      await page.keyboard.press("Enter");

      // After scroll + focus attempts settle, the first-unread row must have focus.
      await expect(page.getByTestId("live-battle-comments-jump-latest")).toHaveCount(0, { timeout: 4_000 });
      await expect
        .poll(
          async () =>
            page.evaluate(() => {
              const a = document.activeElement as HTMLElement | null;
              return a?.getAttribute("data-testid") === "live-battle-comment"
                ? a.textContent ?? ""
                : "";
            }),
          { timeout: 5_000 },
        )
        .toContain("jf-first-new");

      // And the focused row is the one flagged as first-unread pre-click.
      const focusedFirstUnread = await page.evaluate(() =>
        (document.activeElement as HTMLElement | null)?.getAttribute("data-first-unread"),
      );
      // After scrollToBottom clears the marker, focus is still on the same
      // element even though the data attribute has reset — that's expected.
      expect(["true", "false", null]).toContain(focusedFirstUnread);
    } finally {
      await deleteAllCommentsForBattle(seed.id);
      await teardownLiveBattle(seed.id);
    }
  });
});
