/**
 * Playwright global setup.
 *
 * Order of precedence for picking the post + profile under test:
 *   1. Explicit env (E2E_POST_ID + E2E_PROFILE_USERNAME) — use as-is.
 *   2. Cached e2e/.seed.json from a prior run — reuse.
 *   3. Live seed via service-role key — requires SUPABASE_SERVICE_ROLE_KEY.
 *
 * If none of the above works, we throw with a clear, actionable message
 * instead of letting individual specs silently `test.skip`.
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
    throw new Error(
      [
        "",
        "Playwright e2e setup cannot start: no test fixture is available.",
        "",
        "Pick ONE of these to fix it:",
        "  (a) Auto-seed (recommended) — add SUPABASE_SERVICE_ROLE_KEY to your local .env",
        "      and rerun. The seed script creates a test user + post namespaced with the",
        "      'e2e_share_test' prefix and never touches real production data.",
        "",
        "  (b) Bring-your-own fixture — export both:",
        "        E2E_POST_ID=<uuid of a real post>",
        "        E2E_PROFILE_USERNAME=<existing username>",
        "",
        "See e2e/README.md for details.",
        "",
      ].join("\n"),
    );
  }

  console.log("[e2e/setup] Seeding fresh fixtures via service-role key…");
  const seeded = await seedE2E();
  process.env.E2E_POST_ID = seeded.postId;
  process.env.E2E_PROFILE_USERNAME = seeded.username;
  console.log(
    `[e2e/setup] Seeded post=${seeded.postId}, user=@${seeded.username}.`,
  );
}
