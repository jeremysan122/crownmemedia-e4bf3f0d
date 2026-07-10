// E2E RLS hardening: only moderators can hide comments; only the
// authenticated user may report as themselves; hidden comments never leak
// to non-mods even through realtime UPDATE broadcasts.
import { test, expect } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import {
  seedLiveBattle, teardownLiveBattle, hasServiceRoleForLive, adminClient,
} from "./helpers/liveBattleSeed";
import {
  insertComment, deleteAllCommentsForBattle, grantModerator, revokeModerator, readCommentRaw,
} from "./helpers/liveBattleCommentSeed";

/** Anon SDK client signed in as E2E_USER_C — mimics a real browser session. */
async function userClient() {
  const url = process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL!;
  const anon = process.env.SUPABASE_ANON_KEY ?? process.env.VITE_SUPABASE_PUBLISHABLE_KEY!;
  const c = createClient(url, anon, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data, error } = await c.auth.signInWithPassword({
    email: process.env.E2E_USER_C_EMAIL!,
    password: process.env.E2E_USER_C_PASSWORD!,
  });
  if (error || !data.user) throw error ?? new Error("signin failed");
  return { client: c, userId: data.user.id };
}

test.describe("Live battle comments — RLS hardening", () => {
  test.skip(!hasServiceRoleForLive(), "Requires service-role + seeded users.");
  test.skip(
    !(process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_PUBLISHABLE_KEY),
    "Requires anon key for direct RLS assertions.",
  );

  test("non-mod UPDATE to hide a comment is denied (RLS blocks)", async () => {
    const seed = await seedLiveBattle({ slug: "lbc-rls-hide-deny" });
    const cid = await insertComment({
      battleId: seed.id, authorId: seed.opponentId, body: "cannot-hide-me",
    });
    try {
      const { client, userId } = await userClient();
      await revokeModerator(userId); // ensure C is NOT a mod

      const { error, data } = await client
        .from("live_battle_comments")
        .update({ hidden_at: new Date().toISOString() })
        .eq("id", cid)
        .select("id, hidden_at");

      // Under RLS the UPDATE either errors or silently matches zero rows.
      expect(!!error || (data ?? []).length === 0).toBe(true);
      const raw = await readCommentRaw(cid);
      expect(raw?.hidden_at).toBeNull();

      // Non-mod calling the hide RPC directly is rejected with `forbidden`.
      const rpc = await client.rpc("admin_hide_live_battle_comment", {
        _comment_id: cid, _hide: true, _reason: "attempt",
      });
      expect(rpc.error?.message ?? "").toMatch(/forbidden|denied|policy/i);
      expect((await readCommentRaw(cid))?.hidden_at).toBeNull();
    } finally {
      await deleteAllCommentsForBattle(seed.id);
      await teardownLiveBattle(seed.id);
    }
  });

  test("granted moderator CAN hide via the RPC; revoked mod cannot", async () => {
    const seed = await seedLiveBattle({ slug: "lbc-rls-mod-toggle" });
    const cid = await insertComment({
      battleId: seed.id, authorId: seed.opponentId, body: "mod-only-target",
    });
    try {
      const { client, userId } = await userClient();
      await grantModerator(userId);
      try {
        const ok = await client.rpc("admin_hide_live_battle_comment", {
          _comment_id: cid, _hide: true, _reason: "e2e",
        });
        expect(ok.error).toBeNull();
        expect((await readCommentRaw(cid))?.hidden_at).not.toBeNull();
      } finally {
        await revokeModerator(userId);
      }

      // After revoke, unhide via RPC must be rejected.
      const bad = await client.rpc("admin_hide_live_battle_comment", {
        _comment_id: cid, _hide: false, _reason: null,
      });
      expect(bad.error?.message ?? "").toMatch(/forbidden|denied|policy/i);
      expect((await readCommentRaw(cid))?.hidden_at).not.toBeNull();
    } finally {
      await deleteAllCommentsForBattle(seed.id);
      await teardownLiveBattle(seed.id);
    }
  });

  test("report insert must use reporter_id = auth.uid(); spoofing another user fails", async () => {
    const seed = await seedLiveBattle({ slug: "lbc-rls-report" });
    const cid = await insertComment({
      battleId: seed.id, authorId: seed.opponentId, body: "reportable",
    });
    try {
      const { client, userId } = await userClient();

      // Legit report as self succeeds.
      const good = await client.from("live_battle_comment_reports").insert({
        comment_id: cid, battle_id: seed.id, reporter_id: userId, reason: "e2e legit",
      });
      expect(good.error).toBeNull();

      // Spoofed report: reporter_id = someone else. RLS with_check must reject.
      const spoofed = await client.from("live_battle_comment_reports").insert({
        comment_id: cid, battle_id: seed.id,
        reporter_id: seed.opponentId, reason: "e2e spoof",
      });
      expect(spoofed.error?.message ?? "").toMatch(/policy|denied|violates/i);

      // Confirm exactly one report row via service role.
      const { count } = await adminClient()
        .from("live_battle_comment_reports")
        .select("id", { count: "exact", head: true })
        .eq("comment_id", cid);
      expect(count).toBe(1);
    } finally {
      await deleteAllCommentsForBattle(seed.id);
      await teardownLiveBattle(seed.id);
    }
  });

  test("realtime: a comment hidden mid-session does not reveal its body to non-mods", async () => {
    const seed = await seedLiveBattle({ slug: "lbc-rls-realtime" });
    const cid = await insertComment({
      battleId: seed.id, authorId: seed.opponentId, body: "secret-body-do-not-leak",
    });
    try {
      const { client, userId } = await userClient();
      await revokeModerator(userId);

      // Subscribe non-mod to postgres_changes for this battle.
      const events: any[] = [];
      const ch = client
        .channel(`rls-test:${seed.id}`)
        .on(
          "postgres_changes",
          { event: "*", schema: "public", table: "live_battle_comments", filter: `battle_id=eq.${seed.id}` },
          (payload) => events.push(payload),
        );
      await new Promise<void>((resolve, reject) => {
        ch.subscribe((status) => {
          if (status === "SUBSCRIBED") resolve();
          if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") reject(new Error(status));
        });
      });

      // Service role hides the comment — simulating a mod action elsewhere.
      await adminClient().from("live_battle_comments").update({
        hidden_at: new Date().toISOString(), hidden_by: seed.hostId, hide_reason: "e2e",
      }).eq("id", cid);

      // Give realtime a moment to deliver (or filter) the UPDATE.
      await new Promise((r) => setTimeout(r, 2000));

      // Non-mod SELECT must never return the secret body for a hidden row
      // authored by someone else.
      const { data } = await client
        .from("live_battle_comments")
        .select("id, body, hidden_at")
        .eq("id", cid);
      const visible = (data ?? []).find((r: any) => r.id === cid);
      expect(visible).toBeUndefined();

      // Even if realtime broadcast the payload, the payload body must not
      // expose the row for a non-authorised viewer — Supabase RLS filters
      // postgres_changes with the same policy as SELECT.
      for (const ev of events) {
        const row = (ev as any).new ?? (ev as any).record ?? {};
        if (row?.id === cid) {
          // If it did come through, the sensitive column MUST be scrubbed
          // OR the row must belong to the viewer / a mod path.
          expect(row.body).not.toBe("secret-body-do-not-leak");
        }
      }

      await client.removeChannel(ch);
    } finally {
      await deleteAllCommentsForBattle(seed.id);
      await teardownLiveBattle(seed.id);
    }
  });
});
