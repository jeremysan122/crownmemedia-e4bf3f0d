// E2E: Reconnect mid-typing. User A starts typing → the browser goes
// offline while the typing broadcast is in-flight → network comes back →
// A stops typing. Peer B's aria-live "typing" region MUST clear so
// screen-reader users don't hear a phantom "A is typing…" stuck across
// the reconnect. The TTL sweep guarantees clear even if the "stop"
// broadcast is dropped during the offline window.
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

test.describe("Live battle typing indicator — reconnect mid-typing clears on stop", () => {
  test.skip(!canRun, "Requires service-role + two seeded E2E users.");

  test("peer aria-live region clears after I stop typing following a reconnect", async ({ browser }) => {
    const seed = await seedLiveBattle({ slug: "lbc-typing-reconnect", status: "live" });
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
      await expect(typingRegion).toHaveAttribute("role", "status");
      await expect(typingRegion).toHaveAttribute("aria-live", "polite");
      await expect(typingRegion).toHaveText("");

      // ── A begins typing — peer B hears "typing…" via realtime broadcast.
      const aInput = aPage.getByTestId("live-battle-comment-input");
      await aInput.focus();
      await aInput.type("mid-flight", { delay: 40 });
      await expect(typingRegion).toHaveText(/typing/i, { timeout: 6_000 });

      // ── Drop A's network while still composing. The typing "stop"
      // broadcast that fires on blur may or may not survive the drop; the
      // client-side TTL on B must still clear the region either way.
      await aCtx.setOffline(true);
      // Continue typing while offline — broadcasts are being dropped.
      await aInput.type("-offline", { delay: 40 });
      await aPage.waitForTimeout(400);

      // ── Reconnect. A hasn't sent anything.
      await aCtx.setOffline(false);
      await aPage.waitForTimeout(1500);

      // Peer's region may still show typing at this exact moment (TTL not
      // yet expired) — attributes must remain a valid polite live region
      // so the next state change is announced.
      await expect(typingRegion).toHaveAttribute("aria-live", "polite");
      await expect(typingRegion).toHaveAttribute("aria-atomic", "true");

      // ── A stops typing (blur) AFTER reconnect. The stop broadcast now
      // rides on a healthy connection; if it's still lost, TYPING_TTL_MS
      // (3500ms) sweeps the state. Either path must clear the region.
      await aInput.blur();
      await expect(typingRegion).toHaveText("", { timeout: 8_000 });

      // ── Second burst after reconnect: the region must still be able to
      // re-announce (proves the live region wasn't torn down or muted by
      // the reconnect cycle).
      await aInput.focus();
      await aInput.type("post-reconnect burst", { delay: 40 });
      await expect(typingRegion).toHaveText(/typing/i, { timeout: 6_000 });
      await aInput.blur();
      await expect(typingRegion).toHaveText("", { timeout: 8_000 });

      // Final sanity: attrs preserved end-to-end.
      await expect(typingRegion).toHaveAttribute("role", "status");
      await expect(typingRegion).toHaveAttribute("aria-live", "polite");
    } finally {
      await aCtx.close();
      await bCtx.close();
      await deleteAllCommentsForBattle(seed.id);
      await teardownLiveBattle(seed.id);
    }
  });
});
