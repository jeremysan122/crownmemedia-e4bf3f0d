/**
 * Evidence bucket RLS — automated verification.
 *
 * This test scaffold confirms that an authenticated user CANNOT:
 *   - upload into another user's evidence folder
 *   - read/list another user's evidence objects
 *   - mint a signed URL for another user's evidence (the key check)
 *   - update/overwrite any evidence object
 *   - delete another user's evidence
 *
 * Requirements to run end-to-end:
 *   - VITE_SUPABASE_URL + VITE_SUPABASE_PUBLISHABLE_KEY in env (already injected by Lovable)
 *   - SUPABASE_SERVICE_ROLE_KEY available to the test runner ONLY (never ship to the client)
 *   - Two pre-created throwaway auth users; pass their emails/passwords via env:
 *       TEST_USER_A_EMAIL / TEST_USER_A_PASSWORD
 *       TEST_USER_B_EMAIL / TEST_USER_B_PASSWORD
 *
 * If any of those env vars are missing the suite is skipped — this file is
 * primarily a checklist-as-code reference. Run with: `bunx vitest run src/lib/__tests__/evidenceRls.test.ts`
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

d("evidence bucket RLS", () => {
  let A: { client: SupabaseClient; uid: string };
  let B: { client: SupabaseClient; uid: string };
  let aPath: string;

  beforeAll(async () => {
    A = await signedClient(A_EMAIL!, A_PASS!);
    B = await signedClient(B_EMAIL!, B_PASS!);

    // User A uploads a tiny evidence file to their own folder
    aPath = `${A.uid}/reports/${crypto.randomUUID()}-test.png`;
    const blob = new Blob([new Uint8Array([137, 80, 78, 71])], { type: "image/png" });
    const { error } = await A.client.storage.from("evidence").upload(aPath, blob);
    expect(error).toBeNull();
  });

  it("3.2 blocks User A uploading into User B's folder", async () => {
    const blob = new Blob([new Uint8Array([1])], { type: "image/png" });
    const { error } = await A.client.storage
      .from("evidence")
      .upload(`${B.uid}/reports/x.png`, blob);
    expect(error).toBeTruthy();
  });

  it("3.1 blocks User B from listing User A's folder", async () => {
    const { data, error } = await B.client.storage.from("evidence").list(`${A.uid}/reports`);
    // Either an error or an empty array — both prove RLS is filtering it out.
    expect(error !== null || (Array.isArray(data) && data.length === 0)).toBe(true);
  });

  it("3.9 blocks User B from creating a signed URL for User A's evidence", async () => {
    const { data, error } = await B.client.storage.from("evidence").createSignedUrl(aPath, 60);
    expect(data?.signedUrl).toBeFalsy();
    expect(error).toBeTruthy();
  });

  it("3.4 blocks UPDATE/overwrite of any evidence object", async () => {
    const blob = new Blob([new Uint8Array([2])], { type: "image/png" });
    const { error } = await A.client.storage.from("evidence").update(aPath, blob);
    expect(error).toBeTruthy(); // RESTRICTIVE policy "Evidence no update"
  });

  it("3.6 blocks User B from deleting User A's evidence", async () => {
    const { data, error } = await B.client.storage.from("evidence").remove([aPath]);
    // Supabase returns success with empty array when RLS filters out the target.
    expect(error !== null || (Array.isArray(data) && data.length === 0)).toBe(true);

    // Confirm the file still exists by signing it as the owner.
    const { data: signed } = await A.client.storage.from("evidence").createSignedUrl(aPath, 60);
    expect(signed?.signedUrl).toBeTruthy();
  });

  it("owner can mint signed URL for own evidence", async () => {
    const { data, error } = await A.client.storage.from("evidence").createSignedUrl(aPath, 60);
    expect(error).toBeNull();
    expect(data?.signedUrl).toMatch(/^https?:\/\//);
  });
});
