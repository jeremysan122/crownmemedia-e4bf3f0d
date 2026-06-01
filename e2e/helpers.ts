/**
 * Shared e2e helpers — service-role mutations for tests that need to
 * actually edit/delete the seeded fixture post (image swap regression,
 * deletion regression). Imported only by Playwright specs.
 */
import { createClient, SupabaseClient } from "@supabase/supabase-js";
import { TEST_PREFIX } from "./seed";

export const IMAGE_A =
  "https://images.unsplash.com/photo-1503023345310-bd7c1de61c7d?w=800&q=80";
export const IMAGE_B =
  "https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=800&q=80";

let _admin: SupabaseClient | null = null;
export function admin(): SupabaseClient {
  if (_admin) return _admin;
  const url = process.env.VITE_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error(
      "e2e/helpers: VITE_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY required for mutation tests.",
    );
  }
  _admin = createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  return _admin;
}

/** Refuse any write that targets a post not namespaced by the test prefix. */
async function assertTestPost(postId: string) {
  const { data, error } = await admin()
    .from("posts")
    .select("id, submission_key, caption")
    .eq("id", postId)
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new Error(`assertTestPost: post ${postId} not found`);
  const ok =
    (data.submission_key && String(data.submission_key).startsWith(TEST_PREFIX)) ||
    (data.caption && String(data.caption).includes(TEST_PREFIX));
  if (!ok) {
    throw new Error(
      `assertTestPost: refusing to mutate post ${postId} — not namespaced with "${TEST_PREFIX}".`,
    );
  }
}

export async function setPostImage(postId: string, imageUrl: string) {
  await assertTestPost(postId);
  const { error } = await admin()
    .from("posts")
    .update({
      image_url: imageUrl,
      image_urls: [imageUrl],
      updated_at: new Date().toISOString(),
    })
    .eq("id", postId);
  if (error) throw error;
}

export async function deletePost(postId: string) {
  await assertTestPost(postId);
  const { error } = await admin().from("posts").delete().eq("id", postId);
  if (error) throw error;
}

export async function setProfileAvatar(userId: string, avatarUrl: string) {
  const { data } = await admin()
    .from("profiles")
    .select("username")
    .eq("id", userId)
    .maybeSingle();
  if (!data?.username?.startsWith(TEST_PREFIX)) {
    throw new Error(
      `setProfileAvatar: refusing — profile ${userId} not namespaced with "${TEST_PREFIX}".`,
    );
  }
  const { error } = await admin()
    .from("profiles")
    .update({
      profile_photo_url: avatarUrl,
      updated_at: new Date().toISOString(),
    })
    .eq("id", userId);
  if (error) throw error;
}
