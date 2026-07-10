// E2E: The typing indicator's aria-live region for the *peer* must both
// populate correctly while I'm actively typing AND clear promptly after I
// stop, so screen readers get exactly one polite announcement per burst
// (no stuck labels, no phantom repeats). This exercises the client-side
// TTL sweep (TYPING_TTL_MS = 3500ms) and the send-clears-typing path.
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

test.describe("Live battle comments — typing indicator aria-live clears on stop", () => {
  test.skip(!canRun, "Requires service-role + two seeded E2E users.");

  test("peer's polite live region populates while typing and clears after I stop / send", async ({ browser }) => {
    const seed = await seedLiveBattle({ slug: "lbc-typing-clear", status: "live" });
    const aCtx = await browser.newContext();
    const bCtx = await browser.newContext();
    const aPage = await aCtx.newPage();
    const bPage = await bCtx.newPage();
    try {
      await signIn(aPage, process.env.E2E_USER_A_EMAIL!, process.env.E2E_USER_A_PASSWORD!);
      await signIn(bPage, process.env.E2E_USER_B_EMAIL!, process.env.E2E_USER_B_PASSWORD!);

      await aPage.goto(`/live/${seed.id}`);
      await bPage.goto(`/live/${seed.id}`);
      await expect(aPage.getByTestId("live-battle-comments-list")).toBeVisible({ timeout: 10_000 });
      await expect(bPage.getByTestId("live-battle-comments-list")).toBeVisible({ timeout: 10_000 });

      const typingRegion = bPage.getByTestId("live-battle-comments-typing");

      // ARIA contract — attributes must be exactly this so screen readers
      // announce updates politely without interrupting the message log.
      await expect(typingRegion).toHaveAttribute("role", "status");
      await expect(typingRegion).toHaveAttribute("aria-live", "polite");
      await expect(typingRegion).toHaveAttribute("aria-atomic", "true");
      // Empty at rest — no phantom announcements before A does anything.
      await expect(typingRegion).toHaveText("");

      // ── Burst 1: A types → peer's polite region announces it. ──────────
      const aInput = aPage.getByTestId("live-battle-comment-input");
      await aInput.focus();
      await aInput.type("hello world", { delay: 40 });
      await expect(typingRegion).toHaveText(/typing/i, { timeout: 6_000 });
      // The typer's own view never announces themselves.
      await expect(aPage.getByTestId("live-battle-comments-typing")).toHaveText("");

      // A stops typing WITHOUT sending. The TTL sweep must clear the peer's
      // region within the TTL window (3500ms) so the announcement doesn't
      // stay stuck for screen-reader users. Give a generous ceiling.
      await aInput.blur();
      await expect(typingRegion).toHaveText("", { timeout: 6_000 });
      // Attributes preserved after clear — the region must remain a valid
      // live region so the next burst is re-announced.
      await expect(typingRegion).toHaveAttribute("role", "status");
      await expect(typingRegion).toHaveAttribute("aria-live", "polite");
      await expect(typingRegion).toHaveAttribute("aria-atomic", "true");

      // ── Burst 2: A types again → region announces AGAIN (not suppressed
      // because it went empty in between). Then A sends — the message-insert
      // handler clears the sender from typing state on the peer immediately.
      await aInput.focus();
      await aInput.type("second burst", { delay: 40 });
      await expect(typingRegion).toHaveText(/typing/i, { timeout: 6_000 });
      await aInput.press("Enter");
      // Sent comment appears on peer.
      await expect(bPage.getByTestId("live-battle-comment").last())
        .toContainText("second burst", { timeout: 8_000 });
      // Peer's typing region clears (either via send-clear path or TTL).
      await expect(typingRegion).toHaveText("", { timeout: 6_000 });

      // Sanity: after two full bursts the region is empty and the attrs
      // haven't been swapped. Screen readers can still be re-announced.
      await expect(typingRegion).toHaveAttribute("aria-live", "polite");
    } finally {
      await aCtx.close();
      await bCtx.close();
      await deleteAllCommentsForBattle(seed.id);
      await teardownLiveBattle(seed.id);
    }
  });
});
