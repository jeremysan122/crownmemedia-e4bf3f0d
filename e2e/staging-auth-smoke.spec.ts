import { expect, test } from "@playwright/test";

const email = process.env.E2E_USER_C_EMAIL;
const password = process.env.E2E_USER_C_PASSWORD;
const baseUrl = process.env.PLAYWRIGHT_BASE_URL;
const hasControlledStagingUser = Boolean(email && password && baseUrl);

test.describe("controlled staging account", () => {
  test.skip(
    !hasControlledStagingUser,
    "Requires PLAYWRIGHT_BASE_URL plus E2E_USER_C_EMAIL/E2E_USER_C_PASSWORD.",
  );

  test("signs in and renders the authenticated mobile shell without raw errors", async ({
    page,
  }) => {
    expect(new URL(baseUrl!).hostname).not.toBe("crownmemedia.com");

    await page.goto("/auth");
    await page.getByLabel(/email/i).fill(email!);
    await page.getByLabel(/password/i).fill(password!);
    await page.getByRole("button", { name: /sign in/i }).click();
    await page.waitForURL(/\/(feed|scrolls|me|onboarding)/, { timeout: 20_000 });

    await page.goto("/feed");
    await expect(page.locator("main")).toBeVisible({ timeout: 20_000 });

    const body = (await page.locator("body").innerText()).toLowerCase();
    expect(body).not.toContain("permission denied");
    expect(body).not.toContain("invalid jwt");
    expect(body).not.toContain("pgrst");
    expect(body).not.toMatch(/error:\s+(?:failed|unknown|internal)/);
  });
});

