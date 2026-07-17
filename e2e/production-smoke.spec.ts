import { expect, test } from "@playwright/test";

test.describe("production availability", () => {
  test.skip(process.env.PRODUCTION_SMOKE !== "true", "Runs only from the production smoke workflow");

  for (const route of ["/", "/auth", "/legal"]) {
    test(`${route} renders without bootstrap failures`, async ({ page }) => {
      const pageErrors: string[] = [];
      page.on("pageerror", (error) => pageErrors.push(error.message));

      const response = await page.goto(route, { waitUntil: "networkidle" });
      expect(response?.status(), `${route} HTTP status`).toBeLessThan(400);
      await expect(page.locator("#root")).not.toBeEmpty();
      await expect(page.getByTestId("configuration-error")).toHaveCount(0);
      await expect(page.locator("body")).not.toContainText("supabaseUrl is required");
      expect(pageErrors, `${route} page errors`).toEqual([]);
    });
  }

  test("public discovery files are valid", async ({ request }) => {
    const home = await request.get("/");
    const headers = home.headers();
    expect(headers["strict-transport-security"]).toContain("includeSubDomains");
    expect(headers["x-content-type-options"]).toBe("nosniff");
    expect(headers["referrer-policy"]).toBe("strict-origin-when-cross-origin");
    expect(headers["content-security-policy"]).toContain("frame-ancestors 'none'");
    expect(headers["permissions-policy"]).toContain("camera=(self)");

    const robots = await request.get("/robots.txt");
    expect(robots.ok()).toBe(true);
    expect(await robots.text()).toContain("User-agent:");

    const manifest = await request.get("/site.webmanifest");
    expect(manifest.ok()).toBe(true);
    expect((await manifest.json()).name).toContain("CrownMe");
  });
});
