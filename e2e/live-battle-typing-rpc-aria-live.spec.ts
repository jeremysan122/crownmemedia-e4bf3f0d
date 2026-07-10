// E2E: Trigger the typing indicator via the server rate-limited RPC path
// (broadcast_live_battle_typing) rather than by simulating keystrokes,
// and verify that a *second* viewer's typing region announces the update
// through the correct role="status" / aria-live="polite" / aria-atomic
// contract expected by screen readers.
import { test, expect, Page, BrowserContext } from "@playwright/test";
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

async function getAccessToken(page: Page): Promise<string> {
  const token = await page.evaluate(() => {
    for (let i = 0; i < window.localStorage.length; i++) {
      const k = window.localStorage.key(i);
      if (k && k.startsWith("sb-") && k.endsWith("-auth-token")) {
        try {
          const v = JSON.parse(window.localStorage.getItem(k) ?? "null");
          return v?.access_token ?? v?.currentSession?.access_token ?? null;
        } catch { /* ignore */ }
      }
    }
    return null;
  });
  if (!token) throw new Error("no_access_token_in_localstorage");
  return token as string;
}

async function callTypingRpc(page: Page, battleId: string, accessToken: string) {
  const url = process.env.SUPABASE_URL!.replace(/\/$/, "");
  const anon = process.env.SUPABASE_ANON_KEY!;
  return page.evaluate(async (args) => {
    const r = await fetch(`${args.url}/rest/v1/rpc/broadcast_live_battle_typing`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: args.anon,
        Authorization: `Bearer ${args.accessToken}`,
      },
      body: JSON.stringify({ _battle_id: args.battleId }),
    });
    return { ok: r.ok, status: r.status, body: await r.text() };
  }, { url, anon, accessToken, battleId });
}

const canRun =
  hasServiceRoleForLive() &&
  !!process.env.SUPABASE_URL && !!process.env.SUPABASE_ANON_KEY &&
  !!process.env.E2E_USER_A_EMAIL && !!process.env.E2E_USER_A_PASSWORD &&
  !!process.env.E2E_USER_B_EMAIL && !!process.env.E2E_USER_B_PASSWORD;

test.describe("Live battle typing — RPC path drives aria-live announcement", () => {
  test.skip(!canRun, "Requires service-role + SUPABASE_URL/ANON_KEY + 2 seeded users.");

  test("server-rate-limited RPC broadcast surfaces on peer via aria-live polite region", async ({ browser }) => {
    const seed = await seedLiveBattle({ slug: "lbc-typing-rpc-arialive", status: "live" });
    const aCtx: BrowserContext = await browser.newContext();
    const bCtx: BrowserContext = await browser.newContext();
    const aPage = await aCtx.newPage();
    const bPage = await bCtx.newPage();
    try {
      await signIn(aPage, process.env.E2E_USER_A_EMAIL!, process.env.E2E_USER_A_PASSWORD!);
      await signIn(bPage, process.env.E2E_USER_B_EMAIL!, process.env.E2E_USER_B_PASSWORD!);

      await aPage.goto(`/live/${seed.id}`);
      await bPage.goto(`/live/${seed.id}`);
      await expect(aPage.getByTestId("live-battle-comments-list")).toBeVisible({ timeout: 10_000 });
      await expect(bPage.getByTestId("live-battle-comments-list")).toBeVisible({ timeout: 10_000 });

      // Contract: the typing region must be an *empty* polite live region
      // at rest so screen readers never announce phantom activity.
      const typingRegion = bPage.getByTestId("live-battle-comments-typing");
      await expect(typingRegion).toHaveAttribute("role", "status");
      await expect(typingRegion).toHaveAttribute("aria-live", "polite");
      await expect(typingRegion).toHaveAttribute("aria-atomic", "true");
      await expect(typingRegion).toHaveText("");

      // Drive the indicator via the RPC — no keystrokes, so this exercises
      // the same server-rate-limited path the client uses in production.
      const aToken = await getAccessToken(aPage);
      const first = await callTypingRpc(aPage, seed.id, aToken);
      expect(first.ok).toBeTruthy();
      // First call in a fresh window must return `true` (broadcast sent).
      expect(JSON.parse(first.body)).toBe(true);

      // The peer's aria-live region announces the typing update.
      await expect(typingRegion).toHaveText(/typing/i, { timeout: 6_000 });

      // The typer's own view must NOT show a "you are typing" bubble.
      await expect(aPage.getByTestId("live-battle-comments-typing")).toHaveText("");

      // Region contract is preserved *while* content is present — screen
      // readers rely on these attrs not being swapped when the pill mounts.
      await expect(typingRegion).toHaveAttribute("role", "status");
      await expect(typingRegion).toHaveAttribute("aria-live", "polite");

      // Wait past the client-side TTL — the region must clear itself so
      // future announcements are re-announced instead of being suppressed.
      await expect(typingRegion).toHaveText("", { timeout: 8_000 });
    } finally {
      await aCtx.close();
      await bCtx.close();
      await deleteAllCommentsForBattle(seed.id);
      await teardownLiveBattle(seed.id);
    }
  });
});
