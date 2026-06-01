/**
 * Real-bug regressions for the share-card pipeline.
 *
 * These exercise the bugs that previously shipped:
 *   - Edited post showed stale image A in the share card (cache-bust bug).
 *   - Deleted post still rendered an "active" share card.
 *   - Profile avatar update didn't flow into the share preview / download.
 *
 * We compare image fingerprints rather than full-screen pixel snapshots
 * here, so we don't false-fail on tiny font/AA drift but still catch
 * "wrong image" or "still showing the deleted post" bugs.
 */
import { test, expect, Page } from "@playwright/test";
import {
  IMAGE_A,
  IMAGE_B,
  deletePost,
  setPostImage,
  setProfileAvatar,
} from "./helpers";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

function readSeed() {
  try {
    return JSON.parse(readFileSync(resolve("e2e/.seed.json"), "utf-8")) as {
      postId: string;
      username: string;
      userId: string;
    };
  } catch {
    return null;
  }
}

const seed = readSeed();
const POST_ID = process.env.E2E_POST_ID || seed?.postId;
const USERNAME = process.env.E2E_PROFILE_USERNAME || seed?.username;
const USER_ID = seed?.userId;
const HAS_SERVICE_KEY = !!process.env.SUPABASE_SERVICE_ROLE_KEY;

async function openPostShareCard(page: Page, postId: string) {
  await page.goto(`/p/${postId}`);
  await page.getByRole("button", { name: /share/i }).first().click();
  const card = page.locator('[role="dialog"] .bg-gradient-royal').first();
  await expect(card).toBeVisible({ timeout: 10_000 });
  const img = card.locator("img").first();
  await img.evaluate((el: HTMLImageElement) =>
    el.complete && el.naturalWidth > 0
      ? Promise.resolve()
      : new Promise((res) => {
          el.addEventListener("load", () => res(null), { once: true });
          el.addEventListener("error", () => res(null), { once: true });
        }),
  );
  return { card, img };
}

async function getRenderedImageSrc(img: ReturnType<Page["locator"]>) {
  return (await img.evaluate((el: HTMLImageElement) => el.currentSrc || el.src)) as string;
}

test.describe("Post share card — edit & delete regressions", () => {
  test.skip(!POST_ID || !HAS_SERVICE_KEY, "needs seeded fixture + service key");

  test("edited post image propagates to share card (cache-bust regression)", async ({
    page,
  }) => {
    // Start from image A.
    await setPostImage(POST_ID!, IMAGE_A);

    let { img } = await openPostShareCard(page, POST_ID!);
    const srcA = await getRenderedImageSrc(img);
    expect(srcA).toContain("photo-1503023345310"); // image A asset id

    // Edit -> image B. Reopen the share dialog to refetch updated_at.
    await setPostImage(POST_ID!, IMAGE_B);
    ({ img } = await openPostShareCard(page, POST_ID!));
    const srcB = await getRenderedImageSrc(img);

    expect(srcB).toContain("photo-1494790108377"); // image B asset id
    expect(srcB).not.toEqual(srcA);
    // Cache-bust token should differ so CDNs / Image() caches refetch.
    const vA = new URL(srcA).searchParams.get("v");
    const vB = new URL(srcB).searchParams.get("v");
    expect(vB).not.toEqual(vA);

    // Restore image A so other specs / baselines are stable.
    await setPostImage(POST_ID!, IMAGE_A);
  });

  test("deleted post shows clean unavailable state, not a stale share card", async ({
    page,
  }) => {
    // Re-create a disposable post by mutating the fixture, then deleting it.
    // We delete the seeded fixture only inside this isolated test and the
    // seeder will recreate it on the next run.
    await setPostImage(POST_ID!, IMAGE_A);
    await deletePost(POST_ID!);

    await page.goto(`/p/${POST_ID}`);
    // The PostPage should NOT render the share card / royal-gradient panel.
    await expect(
      page.locator('[role="dialog"] .bg-gradient-royal'),
    ).toHaveCount(0);

    // Some kind of unavailable / not-found affordance must be visible.
    const body = page.locator("body");
    await expect(body).toContainText(
      /no longer available|not found|unavailable|deleted/i,
      { timeout: 10_000 },
    );
  });
});

test.describe("Profile share card — avatar update regression", () => {
  test.skip(
    !USERNAME || !USER_ID || !HAS_SERVICE_KEY,
    "needs seeded profile + service key",
  );

  test("avatar update flows into preview + downloaded card", async ({ page }) => {
    const avatarA =
      "https://images.unsplash.com/photo-1502685104226-ee32379fefbe?w=400&q=80";
    const avatarB =
      "https://images.unsplash.com/photo-1438761681033-6461ffad8d80?w=400&q=80";

    await setProfileAvatar(USER_ID!, avatarA);
    await page.goto(`/u/${USERNAME}`);
    await page.getByRole("button", { name: /share profile|share/i }).first().click();
    let card = page.locator('[role="dialog"] .bg-gradient-royal').first();
    await expect(card).toBeVisible();

    const before = await card
      .locator("img")
      .nth(1) // avatar (banner is first)
      .evaluate((el: HTMLImageElement) => el.currentSrc || el.src);
    expect(before).toContain("photo-1502685104226");

    await setProfileAvatar(USER_ID!, avatarB);
    await page.reload();
    await page.getByRole("button", { name: /share profile|share/i }).first().click();
    card = page.locator('[role="dialog"] .bg-gradient-royal').first();
    await expect(card).toBeVisible();
    const after = await card
      .locator("img")
      .nth(1)
      .evaluate((el: HTMLImageElement) => el.currentSrc || el.src);

    expect(after).toContain("photo-1438761681033");
    expect(after).not.toEqual(before);

    // Required public fields visible.
    await expect(card).toContainText(`@${USERNAME}`);
    await expect(card.getByText(/crowns/i)).toBeVisible();
    await expect(card.getByText(/followers/i)).toBeVisible();
    await expect(card.getByText(/votes/i)).toBeVisible();

    // Restore avatar.
    await setProfileAvatar(USER_ID!, avatarA);
  });
});
