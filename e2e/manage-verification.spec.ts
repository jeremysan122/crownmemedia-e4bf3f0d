/**
 * Manage Verification regression — guards against the "dead button" bug.
 *
 * For each verification plan that can exist in the DB (one_time /
 * subscription / royal_pass), we sign in as the seeded test user, force
 * the row into that plan, and verify the Manage Verification screen:
 *   - renders the correct current status
 *   - exposes a working Verification rules link
 *   - exposes a working Contact support affordance (mailto)
 *   - exposes Update profile info (routes into /edit-profile)
 *   - shows the billing portal CTA only for the subscription plan
 *   - never has a button that goes nowhere
 */
import { test, expect, Page } from "@playwright/test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { admin } from "./helpers";
import { TEST_EMAIL, TEST_PASSWORD, TEST_PREFIX } from "./seed";

function readSeed() {
  try {
    return JSON.parse(readFileSync(resolve("e2e/.seed.json"), "utf-8")) as {
      userId: string;
      username: string;
    };
  } catch {
    return null;
  }
}

const seed = readSeed();
const USER_ID = seed?.userId;
const HAS_SERVICE_KEY = !!process.env.SUPABASE_SERVICE_ROLE_KEY;

async function setVerification(
  userId: string,
  plan: "one_time" | "subscription" | "royal_pass" | null,
  category = "creator",
) {
  const sb = admin();
  // Wipe any existing test verification rows (only ones tagged with the
  // namespaced category note in metadata, if you have one — otherwise just
  // matching on user_id is fine because this is a dedicated test account).
  await sb.from("verification_requests").delete().eq("user_id", userId);
  if (plan) {
    const { error } = await sb.from("verification_requests").insert({
      user_id: userId,
      status: "approved",
      plan,
      category,
      submitted_at: new Date().toISOString(),
      reviewed_at: new Date().toISOString(),
      notes: `${TEST_PREFIX} fixture`,
    });
    if (error) throw error;
  }
}

async function signInAsTestUser(page: Page) {
  await page.goto("/auth");
  await page.getByLabel(/email/i).first().fill(TEST_EMAIL);
  await page.getByLabel(/password/i).first().fill(TEST_PASSWORD);
  await page.getByRole("button", { name: /sign in|log in/i }).first().click();
  await page.waitForURL((url) => !url.pathname.startsWith("/auth"), {
    timeout: 15_000,
  });
}

async function assertCommonManageControls(page: Page) {
  // Verification rules
  const rules = page.getByRole("link", { name: /verification rules/i });
  await expect(rules).toBeVisible();
  await expect(rules).toHaveAttribute("href", /community-guidelines/);

  // Contact support
  const support = page.getByRole("link", { name: /contact support/i });
  await expect(support).toBeVisible();
  await expect(support).toHaveAttribute("href", /^mailto:support@/);

  // Update profile info
  const update = page.getByRole("link", { name: /update profile info/i });
  await expect(update).toBeVisible();
  await expect(update).toHaveAttribute("href", /\/edit-profile/);

  // No dead buttons: every visible button/link must have an action.
  const dead = await page
    .locator(
      '[role="dialog"] button:not([disabled]):not([type="submit"]), main button:not([disabled]):not([type="submit"])',
    )
    .evaluateAll((els) =>
      els
        .filter((el) => {
          const a = el.closest("a") as HTMLAnchorElement | null;
          if (a && a.href) return false;
          const hasHandler =
            !!(el as any).onclick ||
            el.getAttribute("type") === "submit" ||
            el.hasAttribute("data-state");
          return !hasHandler;
        })
        .map((el) => (el.textContent || "").trim())
        .filter(Boolean),
    );
  expect(dead, `Dead buttons found: ${dead.join(", ")}`).toEqual([]);
}

const PLANS: Array<"one_time" | "subscription" | "royal_pass"> = [
  "one_time",
  "subscription",
  "royal_pass",
];

test.describe("Manage Verification — all plans", () => {
  test.skip(!USER_ID || !HAS_SERVICE_KEY, "needs seeded user + service key");
  test.describe.configure({ mode: "serial" });

  test.afterAll(async () => {
    if (USER_ID) await setVerification(USER_ID, null);
  });

  for (const plan of PLANS) {
    test(`plan="${plan}" renders working Manage Verification screen`, async ({
      page,
    }) => {
      await setVerification(USER_ID!, plan);
      await signInAsTestUser(page);
      await page.goto("/verification");

      await expect(
        page.getByRole("heading", { name: /you're verified/i }),
      ).toBeVisible({ timeout: 15_000 });

      // Billing portal CTA is conditional on subscription plan.
      const billing = page.getByRole("button", { name: /open billing portal/i });
      if (plan === "subscription") {
        await expect(billing).toBeVisible();
      } else {
        await expect(billing).toHaveCount(0);
      }

      await assertCommonManageControls(page);
    });
  }
});
