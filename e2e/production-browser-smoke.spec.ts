import { expect, test } from "@playwright/test";

const PRODUCTION_ORIGIN = "https://crownmemedia.com";

const publicRoutes = [
  "/auth",
  "/get-royal-pass",
  "/legal",
  "/privacy",
  "/terms",
] as const;

test("production public surfaces boot without browser or server failures", async ({ page }) => {
  test.setTimeout(120_000);

  const pageErrors: string[] = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));

  for (const path of publicRoutes) {
    const response = await page.goto(`${PRODUCTION_ORIGIN}${path}`, {
      waitUntil: "domcontentloaded",
    });

    expect(response, `${path} should return an HTTP response`).not.toBeNull();
    expect(response?.status(), `${path} should not return a server error`).toBeLessThan(500);
    await expect(page).toHaveTitle(/CrownMe/i);
    await expect(page.locator("body")).not.toContainText("Application error");
    await expect(page.locator("body")).not.toContainText("Internal Server Error");
  }

  expect(pageErrors, `uncaught browser errors: ${pageErrors.join(" | ")}`).toEqual([]);
});
