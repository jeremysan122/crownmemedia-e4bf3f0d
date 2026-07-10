/**
 * Deterministic seed helpers for Live Battle *comments* E2E specs.
 * Uses the same service-role client as liveBattleSeed.
 */
import { adminClient } from "./liveBattleSeed";

/** Insert N comments spaced apart in time (older → newer) as the given author. */
export async function seedComments(opts: {
  battleId: string;
  authorId: string;
  count: number;
  bodyPrefix?: string;
  /** Base timestamp for the *oldest* comment (defaults: 10 min ago). */
  baseMs?: number;
  /** Milliseconds between successive comments. */
  stepMs?: number;
}): Promise<{ id: string; body: string; created_at: string }[]> {
  const admin = adminClient();
  const base = opts.baseMs ?? Date.now() - 10 * 60 * 1000;
  const step = opts.stepMs ?? 1000;
  const rows = Array.from({ length: opts.count }).map((_, i) => ({
    battle_id: opts.battleId,
    user_id: opts.authorId,
    body: `${opts.bodyPrefix ?? "e2e-lbc"}-${String(i).padStart(4, "0")}`,
    created_at: new Date(base + i * step).toISOString(),
  }));
  const { data, error } = await admin
    .from("live_battle_comments")
    .insert(rows)
    .select("id, body, created_at");
  if (error) throw error;
  return (data as any[]).map((r) => ({
    id: r.id as string,
    body: r.body as string,
    created_at: r.created_at as string,
  }));
}

export async function insertComment(opts: {
  battleId: string;
  authorId: string;
  body: string;
  createdAt?: Date;
}): Promise<string> {
  const admin = adminClient();
  const { data, error } = await admin
    .from("live_battle_comments")
    .insert({
      battle_id: opts.battleId,
      user_id: opts.authorId,
      body: opts.body,
      created_at: (opts.createdAt ?? new Date()).toISOString(),
    })
    .select("id")
    .single();
  if (error || !data) throw error ?? new Error("insertComment failed");
  return (data as any).id as string;
}

export async function deleteAllCommentsForBattle(battleId: string) {
  const admin = adminClient();
  await admin.from("live_battle_comment_reports").delete().eq("battle_id", battleId);
  await admin.from("live_battle_comments").delete().eq("battle_id", battleId);
}

export async function grantModerator(userId: string) {
  const admin = adminClient();
  // upsert-safe: table has unique (user_id, role)
  await admin.from("user_roles").upsert(
    { user_id: userId, role: "moderator" },
    { onConflict: "user_id,role", ignoreDuplicates: true },
  );
}

export async function revokeModerator(userId: string) {
  const admin = adminClient();
  await admin.from("user_roles").delete().eq("user_id", userId).eq("role", "moderator");
}

/** Read a single comment as service-role (bypasses RLS) for assertions. */
export async function readCommentRaw(id: string) {
  const admin = adminClient();
  const { data } = await admin
    .from("live_battle_comments")
    .select("id, hidden_at, hidden_by, hide_reason, body")
    .eq("id", id)
    .maybeSingle();
  return data as {
    id: string;
    hidden_at: string | null;
    hidden_by: string | null;
    hide_reason: string | null;
    body: string;
  } | null;
}

export async function countReports(commentId: string): Promise<number> {
  const admin = adminClient();
  const { count } = await admin
    .from("live_battle_comment_reports")
    .select("id", { count: "exact", head: true })
    .eq("comment_id", commentId);
  return count ?? 0;
}
