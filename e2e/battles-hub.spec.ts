/**
 * E2E: Battle Arena hub (/battles) — smoke coverage for the redesigned
 * BattlesHub. Verifies the hero renders, both CTA/mode entry points are
 * present, and the navigation tiles route to their respective pages.
 *
 * Uses the shared seed user (auto-provisioned by e2e/global-setup) so
 * this spec runs in the same environments as the rest of our suite.
 * Skips with a clear reason when service-role credentials aren't
 * available (Lovable Cloud), matching the pattern in scrolls-repost-undo.
 */
import { test, expect } from "@playwright/test";
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { TEST_EMAIL, TEST_PASSWORD } from "./seed";

const HAS_SERVICE_ROLE = !!process.env.SUPABASE_SERVICE_ROLE_KEY;

function cachedSeed(): { username?: string } {
  const p = resolve(process.cwd(), "e2e/.seed.json");
  if (!existsSync(p)) return {};
  try { return JSON.parse(readFileSync(p, "utf-8")); } catch { return {}; }
}

async function signIn(page: import("@playwright/test").Page) {
  await page.goto("/auth");
  await page.getByLabel(/email/i).fill(TEST_EMAIL);
  await page.getByLabel(/password/i).fill(TEST_PASSWORD);
  await page.getByRole("button", { name: /sign in/i }).click();
  await page.waitForURL(/\/(feed|scrolls|me|onboarding)/, { timeout: 15_000 });
}

test.describe("Battle Arena hub", () => {
  test.skip(
    !HAS_SERVICE_ROLE,
    "Requires SUPABASE_SERVICE_ROLE_KEY to auto-seed a test user (not available on Lovable Cloud).",
  );

  test("hero, CTAs, and navigation tiles render", async ({ page }) => {
    await signIn(page);
    await page.goto("/battles");

    // Hero
    await expect(page.getByRole("heading", { level: 1 })).toContainText(/Battle/i);
    await expect(page.getByText(/Challenge creators\. Win votes\./i)).toBeVisible();
    await expect(page.getByText(/Arena Live/i)).toBeVisible();

    // Post Battle CTA is always visible (no feature flag)
    await expect(page.getByRole("button", { name: /Start Post Battle/i })).toBeVisible();

    // Mode card + explore tiles
    await expect(page.getByText(/Community votes for 24 hours/i)).toBeVisible();
    await expect(page.getByRole("link", { name: /History/i })).toBeVisible();

    // "New to battles?" tip strip
    await expect(page.getByText(/New to battles\?/i)).toBeVisible();
  });

  test("Post Battle mode card routes to /battles/posts", async ({ page }) => {
    await signIn(page);
    await page.goto("/battles");
    await page.getByRole("link", { name: /Post Battle/i }).first().click();
    await page.waitForURL(/\/battles\/posts$/);
  });

  test("History tile routes to /battles/history", async ({ page }) => {
    await signIn(page);
    await page.goto("/battles");
    await page.getByRole("link", { name: /^History$/i }).click();
    await page.waitForURL(/\/battles\/history$/);
  });

  test("clicking Start Post Battle opens the challenge dialog", async ({ page }) => {
    await signIn(page);
    await page.goto("/battles");
    await page.getByRole("button", { name: /Start Post Battle/i }).click();
    // ChallengeDialog renders a search input for opponent lookup.
    await expect(page.getByRole("dialog")).toBeVisible();
  });

  test("no raw backend error text is exposed on load", async ({ page }) => {
    await signIn(page);
    await page.goto("/battles");
    const body = (await page.locator("body").innerText()).toLowerCase();
    expect(body).not.toContain("pgrst");
    expect(body).not.toContain("supabase");
    expect(body).not.toContain("permission denied");
    expect(body).not.toMatch(/error:\s+/);
    // Never advertise unavailable features
    expect(body).not.toContain("coming soon");
    // Log a hint for the cached seed so debugging is easier
    const seed = cachedSeed();
    if (seed.username) console.log(`[e2e/battles-hub] seed user: @${seed.username}`);
  });
});
