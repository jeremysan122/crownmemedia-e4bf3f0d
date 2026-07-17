/**
 * Playwright global setup.
 *
 * Order of precedence for picking the post + profile under test:
 *   1. Explicit env (E2E_POST_ID + E2E_PROFILE_USERNAME) — use as-is.
 *   2. Cached e2e/.seed.json from a prior run — reuse.
 *   3. Live seed via service-role key — requires SUPABASE_SERVICE_ROLE_KEY.
 *
 * If none of the above works, fixture-dependent specs skip while the
 * fixture-free browser suite still runs. Set E2E_REQUIRE_FIXTURE=1 when a
 * missing fixture should fail the entire run (for example, in a fully
 * provisioned release pipeline).
 */
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { seedE2E } from "./seed";

export default async function globalSetup() {
  const envPost = process.env.E2E_POST_ID;
  const envUser = process.env.E2E_PROFILE_USERNAME;
  if (envPost && envUser) {
    console.log("[e2e/setup] Using E2E_POST_ID / E2E_PROFILE_USERNAME from env.");
    return;
  }

  const cachePath = resolve(process.cwd(), "e2e/.seed.json");
  if (existsSync(cachePath) && !process.env.E2E_RESEED) {
    try {
      const cached = JSON.parse(readFileSync(cachePath, "utf-8"));
      if (cached.postId && cached.username) {
        process.env.E2E_POST_ID ||= cached.postId;
        process.env.E2E_PROFILE_USERNAME ||= cached.username;
        console.log(
          `[e2e/setup] Reusing cached seed (post=${cached.postId}, user=@${cached.username}). ` +
            `Set E2E_RESEED=1 to force a fresh seed.`,
        );
        return;
      }
    } catch {
      // fall through to live seeding
    }
  }

  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
    const message = [
      "Playwright has no database fixture: fixture-dependent specs will skip.",
      "Add SUPABASE_SERVICE_ROLE_KEY for safe auto-seeding, or set both",
      "E2E_POST_ID and E2E_PROFILE_USERNAME to use an existing fixture.",
      "Set E2E_REQUIRE_FIXTURE=1 to make a missing fixture fatal.",
      "See e2e/README.md for details.",
    ].join(" ");

    if (process.env.E2E_REQUIRE_FIXTURE === "1") {
      throw new Error(message);
    }

    console.warn(`[e2e/setup] ${message}`);
    return;
  }

  console.log("[e2e/setup] Seeding fresh fixtures via service-role key…");
  const seeded = await seedE2E();
  process.env.E2E_POST_ID = seeded.postId;
  process.env.E2E_PROFILE_USERNAME = seeded.username;
  console.log(
    `[e2e/setup] Seeded post=${seeded.postId}, user=@${seeded.username}.`,
  );
}
