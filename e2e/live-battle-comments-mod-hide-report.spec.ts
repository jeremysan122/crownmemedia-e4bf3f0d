// E2E: Moderator can hide/unhide and report live-battle comments;
// hidden comments never appear for non-moderator viewers.
import { test, expect, Page } from "@playwright/test";
import {
  seedLiveBattle, teardownLiveBattle, hasServiceRoleForLive,
} from "./helpers/liveBattleSeed";
import {
  insertComment, seedComments, deleteAllCommentsForBattle,
  grantModerator, revokeModerator, readCommentRaw, countReports,
} from "./helpers/liveBattleCommentSeed";

async function signInC(page: Page) {
  await page.goto("/auth");
  await page.getByLabel(/email/i).fill(process.env.E2E_USER_C_EMAIL!);
  await page.getByLabel(/password/i).fill(process.env.E2E_USER_C_PASSWORD!);
  await page.getByRole("button", { name: /sign in/i }).click();
  await page.waitForURL(/\/(feed|scrolls|me|battles)/, { timeout: 15_000 });
}

test.describe("Live battle comments — moderation + reporting", () => {
  test.skip(!hasServiceRoleForLive(), "Requires service-role + seeded users.");

  const cUserId = process.env.E2E_USER_C_ID ?? ""; // may be unset; only needed for grant

  test("hidden comments are invisible to non-mod, then visible after granting moderator", async ({ page }) => {
    const seed = await seedLiveBattle({ slug: "lbc-hide-visibility" });
    const authoredByB = await insertComment({
      battleId: seed.id, authorId: seed.opponentId, body: "visible-body-e2e",
    });
    const hiddenByAdmin = await insertComment({
      battleId: seed.id, authorId: seed.opponentId, body: "hidden-body-e2e",
    });
    // Pre-hide the second comment via service role (simulating a prior mod action).
    const { adminClient } = await import("./helpers/liveBattleSeed");
    await adminClient().from("live_battle_comments").update({
      hidden_at: new Date().toISOString(), hidden_by: seed.hostId, hide_reason: "spam",
    }).eq("id", hiddenByAdmin);

    try {
      await signInC(page);
      await page.goto(`/live/${seed.id}`);

      const list = page.getByTestId("live-battle-comments-list");
      await expect(list).toBeVisible({ timeout: 10_000 });

      // Visible body appears; hidden body body-text does NOT.
      await expect(list).toContainText("visible-body-e2e");
      await expect(list).not.toContainText("hidden-body-e2e");
      // The "[hidden by moderator]" placeholder must not leak to non-mods either.
      await expect(list).not.toContainText(/hidden by moderator/i);

      // Grant moderator to C and refresh — the hidden comment appears as
      // a "[hidden by moderator]" placeholder.
      if (!cUserId) test.skip(true, "E2E_USER_C_ID is required to grant moderator.");
      await grantModerator(cUserId);
      try {
        await page.reload();
        await expect(list).toContainText("visible-body-e2e");
        await expect(list).toContainText(/hidden by moderator/i);
      } finally {
        await revokeModerator(cUserId);
      }
    } finally {
      await deleteAllCommentsForBattle(seed.id);
      await teardownLiveBattle(seed.id);
    }
    void authoredByB;
  });

  test("moderator can hide then unhide via the comment menu (audit writes hidden_at)", async ({ page }) => {
    if (!cUserId) test.skip(true, "E2E_USER_C_ID required.");
    const seed = await seedLiveBattle({ slug: "lbc-mod-hide-toggle" });
    const cid = await insertComment({
      battleId: seed.id, authorId: seed.opponentId, body: "mod-toggle-target",
    });
    await grantModerator(cUserId);
    try {
      await signInC(page);
      await page.goto(`/live/${seed.id}`);

      const row = page.getByTestId("live-battle-comment").filter({ hasText: "mod-toggle-target" });
      await expect(row).toBeVisible({ timeout: 10_000 });
      await row.getByTestId("live-battle-comment-menu").click();
      await page.getByRole("menuitem", { name: /hide comment/i }).click();

      // Row still present (mods see hidden rows) but text swapped to placeholder.
      await expect(row).toHaveAttribute("data-hidden", "true");
      await expect(row).toContainText(/hidden by moderator/i);

      // Server was actually updated — assert via raw read.
      await expect.poll(async () => (await readCommentRaw(cid))?.hidden_at ?? null,
        { timeout: 5000 }).not.toBeNull();

      // Unhide from the menu → data-hidden flips back and body returns.
      await row.getByTestId("live-battle-comment-menu").click();
      await page.getByRole("menuitem", { name: /unhide/i }).click();
      await expect(row).toHaveAttribute("data-hidden", "false");
      await expect(row).toContainText("mod-toggle-target");
      await expect.poll(async () => (await readCommentRaw(cid))?.hidden_at ?? null,
        { timeout: 5000 }).toBeNull();
    } finally {
      await revokeModerator(cUserId);
      await deleteAllCommentsForBattle(seed.id);
      await teardownLiveBattle(seed.id);
    }
  });

  test("non-mod viewer can report a peer comment; duplicate report is friendly", async ({ page }) => {
    const seed = await seedLiveBattle({ slug: "lbc-report-flow" });
    const cid = await insertComment({
      battleId: seed.id, authorId: seed.opponentId, body: "report-me-body",
    });
    try {
      await signInC(page);
      await page.goto(`/live/${seed.id}`);
      const row = page.getByTestId("live-battle-comment").filter({ hasText: "report-me-body" });
      await expect(row).toBeVisible({ timeout: 10_000 });

      await row.getByTestId("live-battle-comment-menu").click();
      await page.getByRole("menuitem", { name: /report/i }).click();

      const dialog = page.getByRole("dialog", { name: /report comment/i });
      await expect(dialog).toBeVisible();
      await dialog.getByLabel(/reason/i).fill("harassment — e2e");
      await dialog.getByRole("button", { name: /submit report/i }).click();

      // Toast confirms; row unchanged; report row exists.
      await expect(dialog).toBeHidden({ timeout: 5_000 });
      await expect.poll(() => countReports(cid), { timeout: 5000 }).toBe(1);

      // Second report attempt → treated as duplicate, no crash, count stays 1.
      await row.getByTestId("live-battle-comment-menu").click();
      await page.getByRole("menuitem", { name: /report/i }).click();
      await page.getByRole("dialog").getByLabel(/reason/i).fill("still bad");
      await page.getByRole("button", { name: /submit report/i }).click();
      await expect(page.getByRole("dialog")).toBeHidden({ timeout: 5_000 });
      expect(await countReports(cid)).toBe(1);
    } finally {
      await deleteAllCommentsForBattle(seed.id);
      await teardownLiveBattle(seed.id);
    }
    void seedComments; // silence unused warning if refactored
  });
});
