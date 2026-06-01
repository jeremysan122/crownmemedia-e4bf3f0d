/**
 * Mobile-only regression for the Feed → Crown Categories carousel.
 *
 * Bugs this guards against:
 *   - Horizontal swipe on the chip rail accidentally pulling-to-refresh
 *     the page (overscroll-behavior-y misconfig).
 *   - Carousel becoming unscrollable (touch-action regression).
 *   - Vertical feed scrolling getting hijacked by the chip rail.
 *
 * We can't simulate a real iOS pull-to-refresh in Playwright, but we
 * CAN assert the CSS contract that prevents it and verify the rail
 * actually scrolls horizontally without moving the page vertically.
 */
import { test, expect, devices } from "@playwright/test";

test.use({ ...devices["iPhone 13"] });

test.describe("Crown Categories mobile carousel", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
    // Feed is the home route for the app; if a splash redirects, wait for it.
    await page.waitForLoadState("networkidle");
  });

  test("carousel has the CSS guards that prevent pull-to-refresh", async ({
    page,
  }) => {
    const rail = page.getByTestId("crown-category-carousel");
    await expect(rail).toBeVisible({ timeout: 15_000 });

    const styles = await rail.evaluate((el) => {
      const cs = getComputedStyle(el);
      return {
        touchAction: cs.touchAction,
        overscrollY: cs.overscrollBehaviorY,
        overscrollX: cs.overscrollBehaviorX,
        overflowX: cs.overflowX,
      };
    });
    // pan-x prevents vertical pull-to-refresh from being triggered by a
    // horizontal swipe that started on the rail.
    expect(styles.touchAction).toMatch(/pan-x/);
    // contain prevents scroll chaining → no pull-to-refresh, no body bounce.
    expect(styles.overscrollY).toMatch(/contain|none/);
    expect(styles.overflowX).toMatch(/auto|scroll/);
  });

  test("rail scrolls horizontally without moving the page vertically", async ({
    page,
  }) => {
    const rail = page.getByTestId("crown-category-carousel");
    await expect(rail).toBeVisible({ timeout: 15_000 });

    const pageScrollBefore = await page.evaluate(() => window.scrollY);
    const before = await rail.evaluate((el) => el.scrollLeft);

    await rail.evaluate((el) => {
      el.scrollBy({ left: 200, behavior: "instant" as ScrollBehavior });
    });
    await page.waitForTimeout(100);

    const after = await rail.evaluate((el) => el.scrollLeft);
    const pageScrollAfter = await page.evaluate(() => window.scrollY);

    expect(after).toBeGreaterThan(before);
    // The page must not have scrolled vertically as a side effect.
    expect(pageScrollAfter).toBe(pageScrollBefore);
  });

  test("vertical feed scrolling still works outside the carousel", async ({
    page,
  }) => {
    const before = await page.evaluate(() => window.scrollY);
    await page.evaluate(() => window.scrollBy({ top: 400, behavior: "instant" as ScrollBehavior }));
    await page.waitForTimeout(100);
    const after = await page.evaluate(() => window.scrollY);
    expect(after).toBeGreaterThan(before);
  });

  test("category chips do not jitter / reflow on swipe", async ({ page }) => {
    const rail = page.getByTestId("crown-category-carousel");
    await expect(rail).toBeVisible({ timeout: 15_000 });
    const firstChip = rail.locator("button").first();

    const a = await firstChip.boundingBox();
    await rail.evaluate((el) =>
      el.scrollBy({ left: 50, behavior: "instant" as ScrollBehavior }),
    );
    await page.waitForTimeout(80);
    await rail.evaluate((el) =>
      el.scrollBy({ left: -50, behavior: "instant" as ScrollBehavior }),
    );
    await page.waitForTimeout(80);
    const b = await firstChip.boundingBox();

    expect(a && b).toBeTruthy();
    // Y should not drift more than 1px — chips reflowing vertically = jitter.
    expect(Math.abs((a!.y ?? 0) - (b!.y ?? 0))).toBeLessThanOrEqual(1);
    expect(Math.abs((a!.height ?? 0) - (b!.height ?? 0))).toBeLessThanOrEqual(1);
  });
});
