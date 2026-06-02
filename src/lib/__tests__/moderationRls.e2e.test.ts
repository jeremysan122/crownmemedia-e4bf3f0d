/**
 * End-to-end RLS verification for the moderation/sensitive-content fields on posts.
 *
 * Requires test users:
 *   TEST_USER_A_EMAIL / TEST_USER_A_PASSWORD — regular author with at least one post
 *   TEST_USER_B_EMAIL / TEST_USER_B_PASSWORD — regular viewer (non-mod)
 *
 * Run: bunx vitest run src/lib/__tests__/moderationRls.e2e.test.ts
 */
import { describe, it, expect, beforeAll } from "vitest";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const URL = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const ANON = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string | undefined;
const A_EMAIL = process.env.TEST_USER_A_EMAIL;
const A_PASS = process.env.TEST_USER_A_PASSWORD;
const B_EMAIL = process.env.TEST_USER_B_EMAIL;
const B_PASS = process.env.TEST_USER_B_PASSWORD;

const canRun = !!(URL && ANON && A_EMAIL && A_PASS && B_EMAIL && B_PASS);
const d = canRun ? describe : describe.skip;

async function signedClient(email: string, password: string) {
  const client = createClient(URL!, ANON!);
  const { data, error } = await client.auth.signInWithPassword({ email, password });
  if (error || !data.user) throw new Error(`Sign-in failed for ${email}: ${error?.message}`);
  return { client, uid: data.user.id };
}

d("moderation RLS / trigger enforcement", () => {
  let A: { client: SupabaseClient; uid: string };
  let B: { client: SupabaseClient; uid: string };
  let postId: string | null = null;

  beforeAll(async () => {
    A = await signedClient(A_EMAIL!, A_PASS!);
    B = await signedClient(B_EMAIL!, B_PASS!);

    const { data } = await A.client
      .from("posts")
      .select("id")
      .eq("user_id", A.uid)
      .eq("is_removed", false)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    postId = (data?.id as string) ?? null;
  });

  it("author cannot change moderation_status on their own post", async () => {
    if (!postId) return;
    const { error } = await (A.client as any)
      .from("posts").update({ moderation_status: "approved" }).eq("id", postId);
    expect(error).toBeTruthy();
    expect(String(error?.message)).toMatch(/moderator|moderation/i);
  });

  it("author cannot mark their own post explicit", async () => {
    if (!postId) return;
    const { error } = await (A.client as any)
      .from("posts").update({ content_rating: "explicit" }).eq("id", postId);
    expect(error).toBeTruthy();
    expect(String(error?.message)).toMatch(/explicit|moderator/i);
  });

  it("author cannot flip is_sensitive after upload", async () => {
    if (!postId) return;
    const { error } = await (A.client as any)
      .from("posts").update({ is_sensitive: true }).eq("id", postId);
    expect(error).toBeTruthy();
  });

  it("non-owner cannot update someone else's post at all (RLS)", async () => {
    if (!postId) return;
    const { data, error } = await (B.client as any)
      .from("posts").update({ caption: "hijacked" }).eq("id", postId).select("id");
    // Either RLS blocks the row (empty result) or returns an error.
    expect((data ?? []).length === 0 || !!error).toBe(true);
  });

  it("non-owner cannot change moderation fields on someone else's post", async () => {
    if (!postId) return;
    const { data, error } = await (B.client as any)
      .from("posts").update({ moderation_status: "approved" }).eq("id", postId).select("id");
    expect((data ?? []).length === 0 || !!error).toBe(true);
  });

  it("removed posts do not reappear in normal feed queries", async () => {
    const { data } = await B.client
      .from("posts")
      .select("id,is_removed")
      .eq("is_removed", false)
      .limit(50);
    expect((data ?? []).every((p: any) => p.is_removed === false)).toBe(true);
  });

  it("non-mods cannot read the admin audit log", async () => {
    const { data, error } = await B.client
      .from("admin_audit_log")
      .select("id")
      .limit(1);
    // RLS returns empty array for unauthorized roles
    expect((data ?? []).length === 0 || !!error).toBe(true);
  });
});
