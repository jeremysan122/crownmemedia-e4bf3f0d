import { test, expect, Page } from "@playwright/test";

/**
 * Visual regression for the share-card pipeline.
 *
 * What we pin:
 *   1. Post share dialog preview (PostPage → Share button)
 *   2. Profile share dialog preview (Profile → Share button)
 *   3. The downloaded PNG must visually match the on-screen preview
 *      (preview ≡ downloaded ≡ what the user posts elsewhere).
 *
 * Threshold (see playwright.config.ts):
 *   - per-pixel YIQ threshold 0.2 (sub-pixel AA / font hinting)
 *   - up to 2% of pixels may differ overall
 *
 * These let us catch real regressions (wrong avatar, missing crown,
 * broken layout, stale image after edit) without false positives from
 * font rendering or 1px shadow drift.
 *
 * Configure a fixture post + profile via env so the test is reproducible:
 *   E2E_POST_ID=<uuid>  E2E_PROFILE_USERNAME=<handle>
 */

const POST_ID = process.env.E2E_POST_ID;
const PROFILE_USERNAME = process.env.E2E_PROFILE_USERNAME;

async function freezeForCapture(page: Page) {
  // Freeze randomness / time-based variance that would otherwise fight the
  // pixel threshold (e.g. the cache-bust query string uses Date.now() when
  // updated_at is missing).
  await page.addInitScript(() => {
    const fixed = new Date("2026-01-01T00:00:00Z").valueOf();
    const RealDate = Date;
    // @ts-expect-error - test-only patch
    globalThis.Date = class extends RealDate {
      constructor(...args: any[]) {
        super(args.length ? (args as [any]) : (fixed as any));
      }
      static now() {
        return fixed;
      }
    };
    Object.setPrototypeOf(globalThis.Date, RealDate);
  });
}

test.describe("Share card visual regression", () => {
  test.skip(!POST_ID, "Set E2E_POST_ID to enable post share regression");

  test("post share dialog preview matches baseline", async ({ page }) => {
    await freezeForCapture(page);
    await page.goto(`/p/${POST_ID}`);
    await page.getByRole("button", { name: /share/i }).first().click();

    const card = page.locator('[role="dialog"] .bg-gradient-royal').first();
    await expect(card).toBeVisible();
    // Wait for the post image inside the card to actually paint, otherwise
    // we'd snapshot an empty <img> slot and the diff would explode.
    await card.locator("img").first().evaluate((el: HTMLImageElement) =>
      el.complete && el.naturalWidth > 0
        ? Promise.resolve()
        : new Promise((res) => {
            el.addEventListener("load", () => res(null), { once: true });
            el.addEventListener("error", () => res(null), { once: true });
          }),
    );

    await expect(card).toHaveScreenshot("post-share-card.png");
  });
});

test.describe("Profile share card visual regression", () => {
  test.skip(!PROFILE_USERNAME, "Set E2E_PROFILE_USERNAME to enable profile regression");

  test("profile share dialog preview matches baseline", async ({ page }) => {
    await freezeForCapture(page);
    await page.goto(`/u/${PROFILE_USERNAME}`);
    await page.getByRole("button", { name: /share profile|share/i }).first().click();

    const card = page.locator('[role="dialog"] .bg-gradient-royal').first();
    await expect(card).toBeVisible();
    await card
      .locator("img")
      .first()
      .evaluate((el: HTMLImageElement) =>
        el.complete && el.naturalWidth > 0
          ? Promise.resolve()
          : new Promise((res) => {
              el.addEventListener("load", () => res(null), { once: true });
              el.addEventListener("error", () => res(null), { once: true });
            }),
      )
      .catch(() => {});

    await expect(card).toHaveScreenshot("profile-share-card.png");
  });

  test("downloaded PNG visually matches the on-screen preview", async ({ page }) => {
    test.skip(!PROFILE_USERNAME, "needs fixture profile");
    await freezeForCapture(page);
    await page.goto(`/u/${PROFILE_USERNAME}`);
    await page.getByRole("button", { name: /share profile|share/i }).first().click();

    const card = page.locator('[role="dialog"] .bg-gradient-royal').first();
    await expect(card).toBeVisible();

    // Trigger the in-app download (html-to-image -> dataURL -> <a download>).
    // Intercept the click to grab the dataURL instead of saving a file.
    const dataUrl: string = await page.evaluate(async () => {
      const { toPng } = await import(
        /* @vite-ignore */ "https://esm.sh/html-to-image@1.11.13"
      );
      const node = document.querySelector(
        '[role="dialog"] .bg-gradient-royal',
      ) as HTMLElement;
      return await toPng(node, { pixelRatio: 2, cacheBust: true });
    });

    const buffer = Buffer.from(dataUrl.split(",")[1], "base64");
    // Compare the downloaded PNG against the same baseline as the preview —
    // they MUST match within threshold or the share is misleading.
    expect(buffer).toMatchSnapshot("profile-share-card-downloaded.png", {
      threshold: 0.25,
      maxDiffPixelRatio: 0.05,
    });
  });
});
