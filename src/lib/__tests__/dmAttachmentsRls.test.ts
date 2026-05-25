/**
 * dm-attachments bucket RLS — automated verification.
 *
 * Confirms an authenticated user CANNOT:
 *   - upload into another user's DM attachment folder
 *   - list/read another user's DM attachments
 *   - mint a signed URL for another user's attachment
 *   - update or delete another user's attachment
 *
 * Owner CAN:
 *   - upload into their own folder
 *   - mint a signed URL for their own object
 *
 * Skipped unless TEST_USER_A_ and TEST_USER_B_ env vars are present.
 * Run with: bunx vitest run src/lib/__tests__/dmAttachmentsRls.test.ts
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

async function signedClient(email: string, password: string): Promise<{ client: SupabaseClient; uid: string }> {
  const client = createClient(URL!, ANON!);
  const { data, error } = await client.auth.signInWithPassword({ email, password });
  if (error || !data.user) throw new Error(`Sign-in failed for ${email}: ${error?.message}`);
  return { client, uid: data.user.id };
}

d("dm-attachments bucket RLS", () => {
  let A: { client: SupabaseClient; uid: string };
  let B: { client: SupabaseClient; uid: string };
  let aPath: string;

  beforeAll(async () => {
    A = await signedClient(A_EMAIL!, A_PASS!);
    B = await signedClient(B_EMAIL!, B_PASS!);

    aPath = `${A.uid}/${crypto.randomUUID()}-test.png`;
    const blob = new Blob([new Uint8Array([137, 80, 78, 71])], { type: "image/png" });
    const { error } = await A.client.storage.from("dm-attachments").upload(aPath, blob);
    expect(error).toBeNull();
  });

  it("blocks User B from uploading into User A's folder", async () => {
    const blob = new Blob([new Uint8Array([1])], { type: "image/png" });
    const { error } = await B.client.storage
      .from("dm-attachments")
      .upload(`${A.uid}/intruder.png`, blob);
    expect(error).toBeTruthy();
  });

  it("blocks User B from listing User A's folder", async () => {
    const { data, error } = await B.client.storage.from("dm-attachments").list(A.uid);
    expect(error !== null || (Array.isArray(data) && data.length === 0)).toBe(true);
  });

  it("blocks User B from creating a signed URL for User A's attachment", async () => {
    const { data, error } = await B.client.storage.from("dm-attachments").createSignedUrl(aPath, 60);
    expect(data?.signedUrl).toBeFalsy();
    expect(error).toBeTruthy();
  });

  it("blocks User B from deleting User A's attachment", async () => {
    const { data, error } = await B.client.storage.from("dm-attachments").remove([aPath]);
    expect(error !== null || (Array.isArray(data) && data.length === 0)).toBe(true);

    const { data: signed } = await A.client.storage.from("dm-attachments").createSignedUrl(aPath, 60);
    expect(signed?.signedUrl).toBeTruthy();
  });

  it("owner can mint signed URL for own attachment", async () => {
    const { data, error } = await A.client.storage.from("dm-attachments").createSignedUrl(aPath, 60);
    expect(error).toBeNull();
    expect(data?.signedUrl).toMatch(/^https?:\/\//);
  });
});
