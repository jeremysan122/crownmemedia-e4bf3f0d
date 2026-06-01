/**
 * E2E seed flow — creates (or reuses) a deterministic test user, profile,
 * and post via the Supabase service-role API so visual-regression tests
 * don't depend on hand-curated production data.
 *
 * SAFETY
 *  - Every seeded row is namespaced with the prefix in `TEST_PREFIX`
 *    (email, username, caption) so it is trivially distinguishable from
 *    real user data and safe to delete.
 *  - The script refuses to run unless `SUPABASE_SERVICE_ROLE_KEY` and
 *    `VITE_SUPABASE_URL` are set — there is no fallback to anon writes.
 *  - It is idempotent: if the test user already exists, it's reused.
 *  - It never writes to or modifies any row that doesn't match the prefix.
 *
 * The resulting IDs are written to `e2e/.seed.json` (git-ignored) for the
 * Playwright specs to consume.
 */
import { createClient } from "@supabase/supabase-js";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

export const TEST_PREFIX = "e2e_share_test";
export const TEST_EMAIL = `${TEST_PREFIX}@crownme.test`;
export const TEST_USERNAME = TEST_PREFIX;
export const TEST_PASSWORD = "E2E-share-test-password-do-not-reuse";
const TEST_IMAGE_URL =
  "https://images.unsplash.com/photo-1503023345310-bd7c1de61c7d?w=800&q=80";

export interface SeedResult {
  userId: string;
  username: string;
  postId: string;
  imageUrl: string;
}

function requireEnv(name: string): string {
  const v = process.env[name];
  if (!v) {
    throw new Error(
      `[e2e/seed] Missing required env var ${name}. Add it to your local .env (NOT committed). ` +
        `You can find SUPABASE_SERVICE_ROLE_KEY in Lovable Cloud → backend settings.`,
    );
  }
  return v;
}

export async function seedE2E(): Promise<SeedResult> {
  const url = requireEnv("VITE_SUPABASE_URL");
  const serviceKey = requireEnv("SUPABASE_SERVICE_ROLE_KEY");

  // Admin client — bypasses RLS. Only used inside this script.
  const admin = createClient(url, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  // 1) Ensure a test auth user exists. We page through admin users and
  //    match by email so we never create duplicates.
  let userId: string | undefined;
  {
    let page = 1;
    while (!userId) {
      const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 200 });
      if (error) throw error;
      const hit = data.users.find((u) => u.email === TEST_EMAIL);
      if (hit) {
        userId = hit.id;
        break;
      }
      if (data.users.length < 200) break;
      page += 1;
    }
    if (!userId) {
      const { data, error } = await admin.auth.admin.createUser({
        email: TEST_EMAIL,
        password: TEST_PASSWORD,
        email_confirm: true,
        user_metadata: { e2e: true, purpose: "share-card visual regression" },
      });
      if (error) throw error;
      userId = data.user!.id;
    }
  }

  // 2) Upsert the profile row with the deterministic test username.
  //    Refuse to touch any profile whose username doesn't carry the prefix.
  {
    const { data: existing } = await admin
      .from("profiles")
      .select("id, username")
      .eq("id", userId)
      .maybeSingle();

    if (existing && existing.username && !existing.username.startsWith(TEST_PREFIX)) {
      throw new Error(
        `[e2e/seed] Refusing to overwrite profile ${userId} — username "${existing.username}" ` +
          `does not match the test prefix "${TEST_PREFIX}". Use a fresh test email.`,
      );
    }

    const profileRow = {
      id: userId,
      username: TEST_USERNAME,
      profile_photo_url:
        "https://images.unsplash.com/photo-1502685104226-ee32379fefbe?w=400&q=80",
      banner_url:
        "https://images.unsplash.com/photo-1500530855697-b586d89ba3ee?w=1200&q=80",
      bio: "[E2E] Automated visual-regression fixture. Do not delete during a test run.",
      city: "Testville",
      state: "TS",
      country: "Testland",
    };
    const { error } = await admin.from("profiles").upsert(profileRow, { onConflict: "id" });
    if (error) throw error;
  }

  // 3) Reuse the same fixture post across runs so the snapshot baseline
  //    stays valid. We look it up by submission_key (an app-level dedup key).
  const submissionKey = `${TEST_PREFIX}_post_v1`;
  let postId: string | undefined;
  {
    const { data: existing } = await admin
      .from("posts")
      .select("id, user_id")
      .eq("submission_key", submissionKey)
      .maybeSingle();

    if (existing) {
      if (existing.user_id !== userId) {
        throw new Error(
          `[e2e/seed] submission_key "${submissionKey}" exists but belongs to another user. ` +
            `Refusing to mutate.`,
        );
      }
      postId = existing.id;
    } else {
      const { data, error } = await admin
        .from("posts")
        .insert({
          user_id: userId,
          image_url: TEST_IMAGE_URL,
          image_urls: [TEST_IMAGE_URL],
          caption: `[${TEST_PREFIX}] Visual regression fixture post — do not delete during a run.`,
          category: "overall",
          city: "Testville",
          state: "TS",
          country: "Testland",
          submission_key: submissionKey,
        })
        .select("id")
        .single();
      if (error) throw error;
      postId = data.id;
    }
  }

  const result: SeedResult = {
    userId: userId!,
    username: TEST_USERNAME,
    postId: postId!,
    imageUrl: TEST_IMAGE_URL,
  };

  const out = resolve(process.cwd(), "e2e/.seed.json");
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, JSON.stringify(result, null, 2) + "\n");
  return result;
}

// Allow `bun run e2e/seed.ts` for manual seeding / debugging.
if (import.meta.url === `file://${process.argv[1]}`) {
  seedE2E()
    .then((r) => {
      console.log("[e2e/seed] OK", r);
    })
    .catch((e) => {
      console.error("[e2e/seed] FAILED", e);
      process.exit(1);
    });
}
