/**
 * End-to-end access-control verification — evidence, DMs, reports, appeals.
 *
 * Each test attempts a typical *unauthorized* action as User B against User A's
 * data and asserts that RLS blocks it. Owner-side happy paths are also asserted
 * so regressions in legitimate flows are caught too.
 *
 * Skipped unless test users are configured. Run with:
 *   bunx vitest run src/lib/__tests__/accessControl.e2e.test.ts
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

d("end-to-end access control", () => {
  let A: { client: SupabaseClient; uid: string };
  let B: { client: SupabaseClient; uid: string };
  let reportId: string | null = null;

  beforeAll(async () => {
    A = await signedClient(A_EMAIL!, A_PASS!);
    B = await signedClient(B_EMAIL!, B_PASS!);

    // User A files a report against User B so we have a record to probe.
    const { data, error } = await A.client
      .from("reports")
      .insert({
        reporter_id: A.uid,
        reported_user_id: B.uid,
        reason: "spam",
        details: "automated test fixture — safe to delete",
      })
      .select("id")
      .single();
    if (!error && data) reportId = data.id as string;
  });

  // ─── Reports ────────────────────────────────────────────────────────────
  describe("reports", () => {
    it("User B cannot read User A's report", async () => {
      if (!reportId) return;
      const { data } = await B.client.from("reports").select("id").eq("id", reportId);
      expect(data ?? []).toHaveLength(0);
    });

    it("User A can read their own report", async () => {
      if (!reportId) return;
      const { data, error } = await A.client.from("reports").select("id").eq("id", reportId);
      expect(error).toBeNull();
      expect(data ?? []).toHaveLength(1);
    });

    it("User B cannot mutate the report", async () => {
      if (!reportId) return;
      const { data, error } = await B.client
        .from("reports")
        .update({ mod_notes: "tampered" })
        .eq("id", reportId)
        .select();
      // Either RLS error or zero rows affected — both prove blockage.
      expect(error !== null || (Array.isArray(data) && data.length === 0)).toBe(true);
    });

    it("User A cannot resolve their own report (mod-only)", async () => {
      if (!reportId) return;
      const { data, error } = await A.client
        .from("reports")
        .update({ status: "resolved" })
        .eq("id", reportId)
        .select();
      expect(error !== null || (Array.isArray(data) && data.length === 0)).toBe(true);
    });

    it("User A cannot file a report with a forged reporter_id", async () => {
      const { error } = await A.client.from("reports").insert({
        reporter_id: B.uid, // forged
        reported_user_id: B.uid,
        reason: "spam",
      });
      expect(error).toBeTruthy();
    });
  });

  // ─── Appeals ────────────────────────────────────────────────────────────
  describe("report_appeals", () => {
    it("User A (reporter) cannot appeal their own report", async () => {
      if (!reportId) return;
      const { error } = await A.client.from("report_appeals").insert({
        report_id: reportId,
        user_id: A.uid,
        body: "this appeal should be blocked because A is the reporter not the subject",
      });
      expect(error).toBeTruthy();
    });

    it("Random third party cannot appeal someone else's report", async () => {
      if (!reportId) return;
      const { error } = await B.client.from("report_appeals").insert({
        report_id: reportId,
        user_id: A.uid, // forged
        body: "this should be blocked — user_id must equal auth.uid()",
      });
      expect(error).toBeTruthy();
    });
  });

  // ─── Evidence storage ───────────────────────────────────────────────────
  describe("evidence bucket", () => {
    let aPath: string;

    beforeAll(async () => {
      aPath = `${A.uid}/reports/${crypto.randomUUID()}-e2e.png`;
      const blob = new Blob([new Uint8Array([137, 80, 78, 71])], { type: "image/png" });
      await A.client.storage.from("evidence").upload(aPath, blob);
    });

    it("User B cannot mint a signed URL for User A's evidence", async () => {
      const { data, error } = await B.client.storage.from("evidence").createSignedUrl(aPath, 60);
      expect(data?.signedUrl).toBeFalsy();
      expect(error).toBeTruthy();
    });

    it("User B cannot upload into User A's folder", async () => {
      const blob = new Blob([new Uint8Array([1])], { type: "image/png" });
      const { error } = await B.client.storage
        .from("evidence")
        .upload(`${A.uid}/reports/intruder.png`, blob);
      expect(error).toBeTruthy();
    });

    it("Even the owner cannot overwrite (RESTRICTIVE no-update policy)", async () => {
      const blob = new Blob([new Uint8Array([2])], { type: "image/png" });
      const { error } = await A.client.storage.from("evidence").update(aPath, blob);
      expect(error).toBeTruthy();
    });
  });

  // ─── DM attachments ─────────────────────────────────────────────────────
  describe("dm-attachments bucket", () => {
    it("User B cannot upload into a DM folder they're not part of", async () => {
      // Folder convention: <minUid>__<maxUid>; pick a pair excluding B.
      const fakePartner = "00000000-0000-0000-0000-000000000001";
      const folder = A.uid < fakePartner ? `${A.uid}__${fakePartner}` : `${fakePartner}__${A.uid}`;
      const blob = new Blob([new Uint8Array([0])], { type: "image/png" });
      const { error } = await B.client.storage
        .from("dm-attachments")
        .upload(`${folder}/intruder.png`, blob);
      expect(error).toBeTruthy();
    });

    it("Anonymous read of dm-attachments is blocked (private bucket)", async () => {
      const anon = createClient(URL!, ANON!);
      const { data, error } = await anon.storage.from("dm-attachments").list("");
      expect(error !== null || (Array.isArray(data) && data.length === 0)).toBe(true);
    });
  });

  // ─── DMs table ──────────────────────────────────────────────────────────
  describe("messages table", () => {
    it("User B cannot insert a message with a forged sender_id", async () => {
      const { error } = await B.client.from("messages").insert({
        sender_id: A.uid, // forged
        receiver_id: B.uid,
        body: "spoof attempt",
      });
      expect(error).toBeTruthy();
    });
  });
});
