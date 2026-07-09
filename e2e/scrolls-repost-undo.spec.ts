/**
 * End-to-end: Scrolls repost + undo flow between two users.
 *
 * Flow:
 *   1. User A owns a seeded Scroll post.
 *   2. User B logs in.
 *   3. User B reposts A's Scroll → success toast + repost_count +1.
 *   4. User A receives a 'repost' notification (Bell badge increments).
 *   5. User B taps Undo within 5 minutes → success toast + count rollback.
 *   6. Notification is deleted for User A (badge decrements again).
 *   7. Counters remain consistent after a hard refresh.
 *
 * This spec requires a service-role key to seed two isolated test users. On
 * Lovable Cloud that key is intentionally unavailable — the spec is skipped
 * with a clear reason and the local/CI command to run it.
 */
import { test, expect } from "@playwright/test";

const HAS_SERVICE_ROLE =
  !!process.env.SUPABASE_SERVICE_ROLE_KEY &&
  !!process.env.E2E_USER_A_EMAIL &&
  !!process.env.E2E_USER_A_PASSWORD &&
  !!process.env.E2E_USER_B_EMAIL &&
  !!process.env.E2E_USER_B_PASSWORD;

test.describe("Scrolls repost + undo (cross-user)", () => {
  test.skip(
    !HAS_SERVICE_ROLE,
    [
      "Requires service-role credentials + two seeded test users, which are",
      "not available on Lovable Cloud. To run locally or in CI, export:",
      "  SUPABASE_SERVICE_ROLE_KEY=<key>",
      "  E2E_USER_A_EMAIL=<owner@example.com>",
      "  E2E_USER_A_PASSWORD=<pw>",
      "  E2E_USER_B_EMAIL=<reposter@example.com>",
      "  E2E_USER_B_PASSWORD=<pw>",
      "  E2E_POST_ID=<seeded scroll post uuid owned by A>",
      "then run: bunx playwright test e2e/scrolls-repost-undo.spec.ts",
    ].join("\n"),
  );

  test("User B reposts A's Scroll, sees toast, undoes, counts + notification roll back", async ({ browser }) => {
    const postId = process.env.E2E_POST_ID!;

    // ── User B: sign in and repost ──────────────────────────────────────────
    const bCtx = await browser.newContext();
    const bPage = await bCtx.newPage();
    await bPage.goto("/auth");
    await bPage.getByLabel(/email/i).fill(process.env.E2E_USER_B_EMAIL!);
    await bPage.getByLabel(/password/i).fill(process.env.E2E_USER_B_PASSWORD!);
    await bPage.getByRole("button", { name: /sign in/i }).click();
    await bPage.waitForURL(/\/(feed|scrolls|me)/);

    await bPage.goto(`/post/${postId}`);
    const initialCountText = (await bPage.getByTestId("repost-count").first().textContent()) ?? "0";
    const initialCount = parseInt(initialCountText.replace(/\D+/g, ""), 10) || 0;

    await bPage.getByRole("button", { name: /repost/i }).first().click();
    await bPage.getByRole("button", { name: /confirm|repost/i }).click();
    await expect(bPage.getByText(/reposted/i)).toBeVisible();
    await expect(bPage.getByText(/undo/i)).toBeVisible();

    // Count bumps immediately (optimistic + realtime)
    await expect
      .poll(async () => {
        const t = (await bPage.getByTestId("repost-count").first().textContent()) ?? "0";
        return parseInt(t.replace(/\D+/g, ""), 10) || 0;
      })
      .toBeGreaterThan(initialCount);

    // ── User A: verify notification arrived ─────────────────────────────────
    const aCtx = await browser.newContext();
    const aPage = await aCtx.newPage();
    await aPage.goto("/auth");
    await aPage.getByLabel(/email/i).fill(process.env.E2E_USER_A_EMAIL!);
    await aPage.getByLabel(/password/i).fill(process.env.E2E_USER_A_PASSWORD!);
    await aPage.getByRole("button", { name: /sign in/i }).click();
    await aPage.waitForURL(/\/(feed|scrolls|me)/);
    await aPage.goto("/notifications");
    await expect(aPage.getByText(/repost/i).first()).toBeVisible({ timeout: 10_000 });

    // Bottom-nav badge is visible with unread count > 0
    await expect(aPage.getByTestId("bottom-nav-notif-badge")).toBeVisible();

    // ── User B: undo within 5 min ───────────────────────────────────────────
    await bPage.getByRole("button", { name: /undo/i }).click();
    await expect(bPage.getByText(/repost undone/i)).toBeVisible();

    await expect
      .poll(async () => {
        const t = (await bPage.getByTestId("repost-count").first().textContent()) ?? "0";
        return parseInt(t.replace(/\D+/g, ""), 10) || 0;
      })
      .toBe(initialCount);

    // ── User A: notification is removed after undo ──────────────────────────
    await aPage.reload();
    await expect(aPage.getByText(/no notifications|nothing/i)).toBeVisible({ timeout: 10_000 });

    // ── Hard refresh: counters are consistent ───────────────────────────────
    await bPage.reload();
    const afterRefresh = (await bPage.getByTestId("repost-count").first().textContent()) ?? "0";
    expect(parseInt(afterRefresh.replace(/\D+/g, ""), 10) || 0).toBe(initialCount);

    await aCtx.close();
    await bCtx.close();
  });
});
