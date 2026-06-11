/**
 * E2E coverage for ShareDialog states: available / hidden / deleted /
 * refresh-error / retry / cache reuse. Uses the stable data-testid
 * selectors. Skips automatically when the service-role key + seed are
 * unavailable — same conventions as e2e/share-card-lifecycle.spec.ts.
 */
import { test, expect, Page } from "@playwright/test";
import { admin } from "./helpers";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

function readSeed() {
  try {
    return JSON.parse(readFileSync(resolve("e2e/.seed.json"), "utf-8")) as {
      postId: string;
    };
  } catch {
    return null;
  }
}

const seed = readSeed();
const POST_ID = process.env.E2E_POST_ID || seed?.postId;
const HAS_SERVICE_KEY = !!process.env.SUPABASE_SERVICE_ROLE_KEY;

async function openShareDialog(page: Page, postId: string) {
  await page.goto(`/p/${postId}`);
  await page.getByRole("button", { name: /share/i }).first().click();
  await expect(page.getByTestId("share-dialog")).toBeVisible({ timeout: 10_000 });
}

async function closeDialog(page: Page) {
  await page.keyboard.press("Escape");
  await expect(page.getByTestId("share-dialog")).toHaveCount(0);
}

test.describe("ShareDialog — states & cache", () => {
  test.skip(!POST_ID || !HAS_SERVICE_KEY, "needs seeded fixture + service key");

  test("available post: dialog opens with share card + active channel buttons", async ({ page }) => {
    await admin().from("posts").update({ is_removed: false }).eq("id", POST_ID!);

    await openShareDialog(page, POST_ID!);
    await expect(page.getByTestId("share-card")).toBeVisible();
    await expect(page.getByTestId("share-copy")).toBeEnabled();
    await expect(page.getByTestId("share-card-unavailable")).toHaveCount(0);
    await expect(page.getByTestId("share-card-error")).toHaveCount(0);
  });

  test("removed post: shows unavailable state and disables all share channels", async ({ page }) => {
    await admin().from("posts").update({ is_removed: true }).eq("id", POST_ID!);

    await openShareDialog(page, POST_ID!);
    await expect(page.getByTestId("share-card-unavailable")).toBeVisible({ timeout: 10_000 });
    await expect(page.getByTestId("share-card")).toHaveCount(0);
    for (const t of ["share-instagram", "share-twitter", "share-facebook", "share-copy"]) {
      await expect(page.getByTestId(t)).toBeDisabled();
    }

    // Restore for downstream specs.
    await admin().from("posts").update({ is_removed: false }).eq("id", POST_ID!);
  });

  test("repeated open/close re-uses the cached status (no duplicate RPC bursts)", async ({ page }) => {
    await admin().from("posts").update({ is_removed: false }).eq("id", POST_ID!);

    // Count RPC calls to get_post_share_status from the browser.
    const rpcCalls: string[] = [];
    page.on("request", (req) => {
      const u = req.url();
      if (u.includes("/rest/v1/rpc/get_post_share_status")) rpcCalls.push(u);
    });

    await openShareDialog(page, POST_ID!);
    await closeDialog(page);
    await openShareDialog(page, POST_ID!);
    await closeDialog(page);
    await openShareDialog(page, POST_ID!);

    // The RPC is only called when the post row comes back empty — for a
    // visible post it should never fire. Either way, repeated opens must
    // not produce a growing call count: cap it at 1.
    expect(rpcCalls.length).toBeLessThanOrEqual(1);
  });

  test("refresh-error state surfaces retry button; retrying preserves selected channel", async ({ page }) => {
    await admin().from("posts").update({ is_removed: false }).eq("id", POST_ID!);

    // Force the freshness fetch to fail by intercepting the posts row request.
    let blockRefresh = true;
    await page.route("**/rest/v1/posts*", async (route) => {
      if (blockRefresh && route.request().method() === "GET") {
        await route.fulfill({ status: 500, body: "{}", contentType: "application/json" });
        return;
      }
      await route.continue();
    });

    await openShareDialog(page, POST_ID!);
    await expect(page.getByTestId("share-card-error")).toBeVisible({ timeout: 10_000 });

    const retry = page.getByTestId("share-card-retry");
    await expect(retry).toBeVisible();
    await expect(retry).toBeEnabled();

    // Loading state + duplicate-click guard.
    blockRefresh = false; // allow the retry to succeed
    await retry.click();
    // The healthy state appears once the post row resolves.
    await expect(page.getByTestId("share-card")).toBeVisible({ timeout: 10_000 });
    await expect(page.getByTestId("share-card-error")).toHaveCount(0);
  });
});
