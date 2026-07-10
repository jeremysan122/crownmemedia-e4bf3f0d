// E2E: Live-battle comments — typing indicator
//  - When user A types in one browser context, user B (in another context on
//    the same battle) sees the typing pill within a couple of seconds.
//  - The indicator lives in a role="status" aria-live="polite" region so
//    screen readers announce it non-intrusively.
//  - When A stops typing (or sends), the indicator disappears for B.
import { test, expect, Page } from "@playwright/test";
import {
  seedLiveBattle, teardownLiveBattle, hasServiceRoleForLive,
} from "./helpers/liveBattleSeed";
import { deleteAllCommentsForBattle } from "./helpers/liveBattleCommentSeed";

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

test.describe("Live battle comments — typing indicator", () => {
  test.skip(!canRun, "Requires service-role + two seeded E2E users.");

  test("typing in one browser is announced in another via realtime aria-live", async ({ browser }) => {
    const seed = await seedLiveBattle({ slug: "lbc-typing" });
    const aCtx = await browser.newContext();
    const bCtx = await browser.newContext();
    const aPage = await aCtx.newPage();
    const bPage = await bCtx.newPage();
    try {
      await signIn(aPage, process.env.E2E_USER_A_EMAIL!, process.env.E2E_USER_A_PASSWORD!);
      await signIn(bPage, process.env.E2E_USER_B_EMAIL!, process.env.E2E_USER_B_PASSWORD!);

      // Both viewers open the same live battle.
      await aPage.goto(`/live/${seed.id}`);
      await bPage.goto(`/live/${seed.id}`);
      await expect(aPage.getByTestId("live-battle-comments-list")).toBeVisible({ timeout: 10_000 });
      await expect(bPage.getByTestId("live-battle-comments-list")).toBeVisible({ timeout: 10_000 });

      // ARIA contract: the typing region must be a polite live region so it
      // doesn't interrupt the message log (which is also polite).
      const typingRegion = bPage.getByTestId("live-battle-comments-typing");
      await expect(typingRegion).toHaveAttribute("role", "status");
      await expect(typingRegion).toHaveAttribute("aria-live", "polite");
      await expect(typingRegion).toHaveAttribute("aria-atomic", "true");
      // Empty at rest — no phantom announcements.
      await expect(typingRegion).toHaveText("");

      // A starts typing. The realtime broadcast should surface on B.
      const aInput = aPage.getByTestId("live-battle-comment-input");
      await aInput.focus();
      await aInput.type("hello ", { delay: 30 });

      // Text-content assertion (rather than visibility) proves the aria-live
      // region will be announced by a screen reader.
      await expect(typingRegion).toHaveText(/typing/i, { timeout: 6_000 });

      // The self view never shows "you're typing" to yourself.
      await expect(aPage.getByTestId("live-battle-comments-typing")).toHaveText("");

      // When A sends the comment, the typing state should clear on B once
      // the message insert lands (broadcast handler removes the sender).
      await aInput.press("Enter");
      await expect(bPage.getByTestId("live-battle-comment").last()).toContainText("hello", { timeout: 8_000 });
      // The typing pill fades once the sender's row appears (or the 3.5s TTL
      // elapses). Allow a generous window for realtime + TTL.
      await expect(typingRegion).toHaveText("", { timeout: 6_000 });
    } finally {
      await aCtx.close();
      await bCtx.close();
      await deleteAllCommentsForBattle(seed.id);
      await teardownLiveBattle(seed.id);
    }
  });
});
