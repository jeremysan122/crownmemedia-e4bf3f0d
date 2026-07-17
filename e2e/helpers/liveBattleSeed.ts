/**
 * Deterministic seed helpers for Live Battle E2E specs.
 *
 * Every helper is idempotent: existing rows for a given `slug` are cleaned
 * up first so tests never share state across runs. Rooms are prefixed with
 * `e2e-live-` so we can garbage-collect stale rows in one pass.
 */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Page } from "@playwright/test";

export function adminClient(): SupabaseClient {
  const url = process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("missing_service_role_env");
  return createClient(url, key, { auth: { persistSession: false } });
}

export interface SeedLiveBattleOpts {
  slug?: string;
  hostId?: string;
  opponentId?: string;
  durationSeconds?: number;
  /** Legacy snake-case alias retained for older E2E specs. */
  duration_seconds?: number;
  host_votes?: number;
  opponent_votes?: number;
  /** Force `ends_at = now + endsInSeconds` regardless of duration. */
  endsInSeconds?: number;
  status?: "pending" | "live" | "ended";
}

export interface SeededLiveBattle {
  id: string;
  /** Legacy alias retained for older E2E specs. */
  battleId: string;
  hostId: string;
  opponentId: string;
  roomName: string;
  viewer: SeedUser;
}

export interface SeedUser {
  id?: string;
  email: string;
  password: string;
  username?: string;
}

function requireSeedUser(prefix: "A" | "B" | "C"): SeedUser {
  const email = process.env[`E2E_USER_${prefix}_EMAIL`];
  const password = process.env[`E2E_USER_${prefix}_PASSWORD`];
  if (!email || !password) throw new Error(`missing_e2e_user_${prefix.toLowerCase()}_credentials`);
  return {
    id: process.env[`E2E_USER_${prefix}_ID`],
    email,
    password,
    username: process.env[`E2E_USER_${prefix}_USERNAME`],
  };
}

export async function signInAsSeed(page: Page, user: SeedUser): Promise<void> {
  await page.goto("/auth");
  await page.getByLabel(/email/i).fill(user.email);
  await page.getByLabel(/password/i).fill(user.password);
  await page.getByRole("button", { name: /sign in/i }).click();
  await page.waitForURL(/\/(feed|scrolls|me|battles)/, { timeout: 15_000 });
}

export async function ensureAnySeedUser(): Promise<{
  user: SeedUser;
  opponent: SeedUser & { username: string };
}> {
  const user = requireSeedUser("A");
  const opponent = requireSeedUser("B");
  if (!opponent.username) throw new Error("missing_e2e_user_b_username");
  return { user, opponent: { ...opponent, username: opponent.username } };
}

export async function seedLiveBattle(opts: SeedLiveBattleOpts): Promise<SeededLiveBattle> {
  const admin = adminClient();
  const hostId = opts.hostId ?? process.env.E2E_USER_A_ID!;
  const opponentId = opts.opponentId ?? process.env.E2E_USER_B_ID!;
  const slug = opts.slug ?? `adhoc-${crypto.randomUUID()}`;
  const runId = process.env.E2E_RUN_ID ?? String(Date.now());
  const roomName = `e2e-live-${slug}-${runId}`;
  const duration = opts.durationSeconds ?? opts.duration_seconds ?? 900;
  const now = Date.now();
  const endsAt = new Date(now + (opts.endsInSeconds ?? duration) * 1000).toISOString();
  const status = opts.status ?? "live";

  // Clean slate for this slug: remove old rows and their child records.
  const { data: existing } = await admin
    .from("live_battles")
    .select("id")
    .like("room_name", `e2e-live-${slug}-%`);
  const oldIds = (existing ?? []).map((r) => r.id as string);
  if (oldIds.length) {
    await admin.from("live_battle_votes").delete().in("battle_id", oldIds);
    await admin.from("live_battle_gifts").delete().in("battle_id", oldIds);
    await admin.from("live_battle_viewers").delete().in("battle_id", oldIds);
    await admin.from("live_battle_participants").delete().in("battle_id", oldIds);
    await admin.from("live_battle_reports").delete().in("battle_id", oldIds);
    await admin.from("live_battles").delete().in("id", oldIds);
  }

  const { data, error } = await admin
    .from("live_battles")
    .insert({
      host_id: hostId,
      opponent_id: opponentId,
      room_name: roomName,
      status,
      started_at: new Date(now).toISOString(),
      ends_at: endsAt,
      duration_seconds: duration,
      host_votes: opts.host_votes ?? 0,
      opponent_votes: opts.opponent_votes ?? 0,
    })
    .select("id")
    .single();
  if (error || !data) throw error ?? new Error("live_battle_seed_failed");

  return {
    id: data.id as string,
    battleId: data.id as string,
    hostId,
    opponentId,
    roomName,
    viewer: requireSeedUser("C"),
  };
}

/** Wipes all votes + gifts for a battle so a spec can start clean mid-run. */
export async function resetLiveBattle(id: string): Promise<void> {
  const admin = adminClient();
  await admin.from("live_battle_votes").delete().eq("battle_id", id);
  await admin.from("live_battle_gifts").delete().eq("battle_id", id);
  await admin
    .from("live_battles")
    .update({ host_votes: 0, opponent_votes: 0 })
    .eq("id", id);
}

/** Fast-forwards `ends_at` and (optionally) status so window edges can be tested. */
export async function endLiveBattle(
  id: string,
  opts: { at?: Date; setEnded?: boolean } = {},
): Promise<void> {
  const admin = adminClient();
  const patch: Record<string, unknown> = {};
  if (opts.at) patch.ends_at = opts.at.toISOString();
  if (opts.setEnded) { patch.status = "ended"; patch.ended_reason = "e2e_force"; }
  if (Object.keys(patch).length) {
    await admin.from("live_battles").update(patch).eq("id", id);
  }
}

/** Delete a specific seeded battle and its children. Call from `finally`. */
export async function teardownLiveBattle(id: string): Promise<void> {
  const admin = adminClient();
  await admin.from("live_battle_votes").delete().eq("battle_id", id);
  await admin.from("live_battle_gifts").delete().eq("battle_id", id);
  await admin.from("live_battle_viewers").delete().eq("battle_id", id);
  await admin.from("live_battle_participants").delete().eq("battle_id", id);
  await admin.from("live_battle_reports").delete().eq("battle_id", id);
  await admin.from("live_battles").delete().eq("id", id);
}

/**
 * One-shot garbage collector for `e2e-live-*` rooms older than 1 hour.
 * Safe to call from globalSetup — it never touches non-e2e rows.
 */
export async function gcStaleLiveBattles(): Promise<number> {
  const admin = adminClient();
  const cutoff = new Date(Date.now() - 60 * 60 * 1000).toISOString();
  const { data } = await admin
    .from("live_battles")
    .select("id")
    .like("room_name", "e2e-live-%")
    .lt("created_at", cutoff);
  const ids = (data ?? []).map((r) => r.id as string);
  if (!ids.length) return 0;
  await admin.from("live_battle_votes").delete().in("battle_id", ids);
  await admin.from("live_battle_gifts").delete().in("battle_id", ids);
  await admin.from("live_battle_viewers").delete().in("battle_id", ids);
  await admin.from("live_battle_participants").delete().in("battle_id", ids);
  await admin.from("live_battle_reports").delete().in("battle_id", ids);
  await admin.from("live_battles").delete().in("id", ids);
  return ids.length;
}

export function hasServiceRoleForLive(): boolean {
  return !!(
    process.env.SUPABASE_SERVICE_ROLE_KEY &&
    (process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL) &&
    process.env.E2E_USER_A_ID &&
    process.env.E2E_USER_B_ID &&
    process.env.E2E_USER_C_EMAIL &&
    process.env.E2E_USER_C_PASSWORD
  );
}
