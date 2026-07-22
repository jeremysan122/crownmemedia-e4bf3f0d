// Client helpers for Live Battles v1. All privileged actions round-trip to
// edge functions or SECURITY DEFINER RPCs. Never surface raw error messages.

import { supabase } from "@/integrations/supabase/client";

export interface LiveBattleRow {
  id: string;
  host_id: string;
  opponent_id: string;
  room_name: string;
  status: "pending" | "scheduled" | "live" | "ended" | "declined" | "cancelled";
  duration_seconds: number;
  started_at: string | null;
  ends_at: string | null;
  host_votes: number;
  opponent_votes: number;
  winner_id: string | null;
  ended_reason: string | null;
  is_hidden: boolean;
  created_at: string;
  category_slug?: string | null;
  region?: string | null;
  scheduled_start_at?: string | null;
  host_ready?: boolean;
  opponent_ready?: boolean;
  lobby_opened_at?: string | null;
  go_live_at?: string | null;
  /** Set when the opponent accepted the invite. The battle stays 'pending'
   * until both players ready up in the lobby and the host starts it. */
  accepted_at?: string | null;
}

/** Extract cooldown seconds from `duplicate_report:NN` / `rate_limited:NN`. */
export function reportCooldownSeconds(err: unknown): { kind: "duplicate" | "rate_limited"; seconds: number } | null {
  const raw = String((err as { message?: string })?.message ?? "");
  const dup = raw.match(/duplicate_report:(\d+)/i);
  if (dup) return { kind: "duplicate", seconds: parseInt(dup[1], 10) };
  const rl = raw.match(/rate_limited:(\d+)/i);
  if (rl) return { kind: "rate_limited", seconds: parseInt(rl[1], 10) };
  return null;
}

export function formatCooldown(seconds: number): string {
  const s = Math.max(1, Math.ceil(seconds));
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  const r = s % 60;
  return r === 0 ? `${m}m` : `${m}m ${r}s`;
}

export function liveBattleErrorMessage(err: unknown, fallback: string): string {
  const raw = (err as { message?: string; error?: string })?.message ?? (err as { error?: string })?.error ?? "";
  const msg = String(raw).toLowerCase();
  const cd = reportCooldownSeconds(err);
  if (cd?.kind === "duplicate") {
    return `You already reported this battle. Try again in ${formatCooldown(cd.seconds)}.`;
  }
  if (cd?.kind === "rate_limited") {
    return `You've hit the report limit. Try again in ${formatCooldown(cd.seconds)}.`;
  }
  if (msg.includes("battle_not_found")) return "This battle is no longer available.";
  if (msg.includes("battle_not_live")) return "This battle isn't live.";
  if (msg.includes("battle_not_pending")) return "This battle already started or ended.";
  if (msg.includes("battle_ended") || msg.includes("already ended")) return "This battle has already ended.";
  if (msg.includes("already_voted")) return "You've already voted in this battle.";
  if (msg.includes("participants_cannot_vote")) return "Participants can't vote in their own battle.";
  if (msg.includes("not_participant")) return "Only participants can do that.";
  if (msg.includes("not_authorized") || msg.includes("only the host") || msg.includes("can't do that")) return "You can't do that.";
  if (msg.includes("not_authenticated") || msg.includes("please sign in")) return "Please sign in to continue.";
  if (msg.includes("feature_disabled") || msg.includes("aren't available right now")) return "Live battles aren't available right now.";
  if (msg.includes("invalid_opponent")) return "That opponent can't be challenged.";
  if (msg.includes("invalid_choice")) return "Pick host or opponent to vote.";
  if (msg.includes("invalid_reason")) return "Please add a short reason (at least a few words).";
  if (msg.includes("duplicate_report")) return "You already reported this battle recently. Our team is on it.";
  if (msg.includes("blocked")) return "You can't start a battle with that user.";
  if (msg.includes("token_mint_failed") || msg.includes("token")) return "Couldn't get a room pass. Please try again in a moment.";
  if (msg.includes("network") || msg.includes("failed to fetch") || msg.includes("timeout")) return "Network hiccup. Check your connection and try again.";
  if (msg.includes("rate")) return "You're doing that too fast. Try again in a moment.";
  return fallback;
}


export async function createLiveBattle(
  opponentId: string,
  durationSeconds = 300,
  categorySlug?: string | null,
  region?: string | null,
): Promise<LiveBattleRow> {
  // Server-side RPC: mints room_name, clamps duration, checks feature flag,
  // rate limit, blocks, self. Direct INSERT on live_battles is revoked.
  const { data, error } = await supabase.rpc("create_live_battle", {
    _opponent_id: opponentId,
    _duration_seconds: durationSeconds,
    _category_slug: categorySlug ?? null,
    _region: region ?? null,
  } as any);
  if (error) throw error;
  return data as unknown as LiveBattleRow;
}

export async function mintLiveBattleToken(battleId: string): Promise<{ token: string; url: string; room: string }> {
  const { data, error } = await supabase.functions.invoke("livekit-token", { body: { battle_id: battleId } });
  if (error || !data?.token) throw error ?? new Error(data?.error ?? "token_mint_failed");
  return data;
}

export async function voteInLiveBattle(battleId: string, choice: "host" | "opponent") {
  const { error } = await supabase.rpc("live_battle_vote", { _battle_id: battleId, _choice: choice });
  if (error) throw error;
}

export interface LiveBattleReportRow {
  id: string;
  battle_id: string;
  reporter_id: string;
  reason: string;
  status: "queued" | "processing" | "handled" | "rejected";
  created_at: string;
  handled_at: string | null;
  handled_by: string | null;
}

export async function reportLiveBattle(battleId: string, reason: string): Promise<LiveBattleReportRow> {
  // Server-side RPC enforces rate limit + duplicate window + validation.
  const { data, error } = await supabase.rpc("live_battle_report", {
    _battle_id: battleId, _reason: reason.slice(0, 500),
  });
  if (error) throw error;
  return data as unknown as LiveBattleReportRow;
}

// ---- Invitation lifecycle (opponent accept/decline, host cancel) ----

export async function acceptLiveBattle(battleId: string): Promise<LiveBattleRow> {
  const { data, error } = await supabase.rpc("live_battle_accept" as never, { _battle_id: battleId } as never);
  if (error) throw error;
  return data as unknown as LiveBattleRow;
}
export async function declineLiveBattle(battleId: string): Promise<LiveBattleRow> {
  const { data, error } = await supabase.rpc("live_battle_decline" as never, { _battle_id: battleId } as never);
  if (error) throw error;
  return data as unknown as LiveBattleRow;
}
export async function cancelLiveBattle(battleId: string): Promise<LiveBattleRow> {
  const { data, error } = await supabase.rpc("live_battle_cancel" as never, { _battle_id: battleId } as never);
  if (error) throw error;
  return data as unknown as LiveBattleRow;
}

// ---- Viewer presence ----

export async function heartbeatLiveBattleViewer(battleId: string): Promise<void> {
  const { error } = await supabase.rpc("live_battle_viewer_heartbeat" as never, { _battle_id: battleId } as never);
  if (error) throw error;
}
export async function fetchLiveBattleViewerCount(battleId: string): Promise<number> {
  const { data, error } = await supabase.rpc("live_battle_viewer_count" as never, { _battle_id: battleId } as never);
  if (error) throw error;
  return Number(data ?? 0);
}

export async function roomControl(
  battleId: string,
  action: "mute" | "unmute" | "kick" | "end" | "force_end",
  targetUserId?: string,
) {
  const { data, error } = await supabase.functions.invoke("livekit-room-control", {
    body: { battle_id: battleId, action, target_user_id: targetUserId },
  });
  if (error || (data && data.error)) throw error ?? new Error(data.error);
  return data;
}

// ---- Admin review queue ----

export interface AdminLiveBattleReportRow extends LiveBattleReportRow {
  reporter_username: string | null;
  reporter_photo: string | null;
  battle_room: string | null;
  battle_status: string | null;
  battle_host_id: string | null;
  battle_opponent_id: string | null;
  battle_category: string | null;
  battle_region: string | null;
  total_open: number;
}

export async function adminListLiveBattleReports(
  status: "queued" | "processing" | "handled" | "rejected" | null,
  limit = 50,
  offset = 0,
): Promise<AdminLiveBattleReportRow[]> {
  const { data, error } = await supabase.rpc("admin_list_live_battle_reports", {
    _status: status, _limit: limit, _offset: offset,
  } as never);
  if (error) throw error;
  return (data ?? []) as unknown as AdminLiveBattleReportRow[];
}

export async function adminUpdateLiveBattleReportStatus(
  reportId: string,
  status: "queued" | "processing" | "handled" | "rejected",
): Promise<LiveBattleReportRow> {
  const { data, error } = await supabase.rpc("admin_update_live_battle_report_status", {
    _report_id: reportId, _status: status,
  } as never);
  if (error) throw error;
  return data as unknown as LiveBattleReportRow;
}

// ---- Moderation activity log ----

export interface LiveBattleModAction {
  id: string;
  battle_id: string;
  target_user_id: string;
  action: "mute" | "unmute" | "kick";
  actor_id: string;
  created_at: string;
}

export async function fetchLiveBattleModActions(battleId: string): Promise<LiveBattleModAction[]> {
  const { data, error } = await supabase
    .from("live_battle_participants")
    .select("id,battle_id,target_user_id,action,actor_id,created_at")
    .eq("battle_id", battleId)
    .order("created_at", { ascending: false })
    .limit(50);
  if (error) throw error;
  return (data ?? []) as unknown as LiveBattleModAction[];
}

// ---- Scheduling ----

/**
 * Create a scheduled live battle. Server RPC enforces start time window,
 * blocks, feature flag, category validity, and rate limit. Battle is
 * inserted with status='scheduled'; LiveKit tokens will NOT be minted
 * until the battle transitions out of that state.
 */
export async function scheduleLiveBattle(
  opponentId: string,
  scheduledStartAt: Date,
  durationSeconds = 300,
  categorySlug?: string | null,
  region?: string | null,
): Promise<LiveBattleRow> {
  const { data, error } = await supabase.rpc("schedule_live_battle" as never, {
    _opponent_id: opponentId,
    _scheduled_start_at: scheduledStartAt.toISOString(),
    _duration_seconds: durationSeconds,
    _category_slug: categorySlug ?? null,
    _region: region ?? null,
  } as never);
  if (error) throw error;
  return data as unknown as LiveBattleRow;
}

export function scheduleErrorMessage(err: unknown): string {
  const msg = String((err as { message?: string })?.message ?? "").toLowerCase();
  if (msg.includes("invalid_scheduled_time")) return "Pick a time at least 5 minutes from now, within the next 30 days.";
  if (msg.includes("invalid_category")) return "That category isn't available.";
  if (msg.includes("invalid_opponent")) return "That opponent can't be challenged.";
  if (msg.includes("blocked")) return "You can't start a battle with that user.";
  if (msg.includes("feature_disabled")) return "Live battles aren't available right now.";
  if (msg.includes("not_authenticated")) return "Please sign in to schedule a battle.";
  if (msg.includes("rate")) return "You're scheduling too fast. Try again in a moment.";
  return "Couldn't schedule the battle. Try again.";
}

// ---- Wave 2: Pre-battle Lobby ----

/**
 * Toggle the caller's ready flag inside the lobby. Server RPC enforces
 * host/opponent membership and pre-live status.
 */
export async function setLobbyReady(battleId: string, ready: boolean): Promise<LiveBattleRow> {
  const { data, error } = await supabase.rpc("set_lobby_ready" as never, {
    _battle_id: battleId, _ready: ready,
  } as never);
  if (error) throw error;
  return data as unknown as LiveBattleRow;
}

/**
 * Host-only: flip a fully-ready battle from pending/scheduled → live.
 */
export async function startBattleFromLobby(battleId: string): Promise<LiveBattleRow> {
  const { data, error } = await supabase.rpc("start_battle_from_lobby" as never, {
    _battle_id: battleId,
  } as never);
  if (error) throw error;
  return data as unknown as LiveBattleRow;
}

export function lobbyErrorMessage(err: unknown): string {
  const msg = String((err as { message?: string })?.message ?? "").toLowerCase();
  if (msg.includes("not_authenticated")) return "Please sign in to enter the lobby.";
  if (msg.includes("battle_not_found")) return "This battle is no longer available.";
  if (msg.includes("battle_not_in_lobby")) return "This battle isn't in a pre-live state anymore.";
  if (msg.includes("not_participant")) return "Only the host or opponent can use the lobby.";
  if (msg.includes("only_host")) return "Only the host can start the battle.";
  if (msg.includes("battle_not_accepted")) return "Your opponent hasn't accepted the challenge yet.";
  if (msg.includes("both_must_be_ready")) return "Both battlers need to be ready first.";
  return "Something went wrong in the lobby. Try again.";
}

/**
 * Mint a LiveKit token scoped to the *lobby* room for AV pre-check.
 * Only host and opponent may pull this token.
 */
export async function mintLobbyToken(battleId: string): Promise<{ token: string; url: string; room: string }> {
  const { data, error } = await supabase.functions.invoke("livekit-token", {
    body: { battle_id: battleId, mode: "lobby" },
  });
  if (error || !data?.token) throw error ?? new Error(data?.error ?? "token_mint_failed");
  return data;
}

// ---- Wave 3: Spectator emote bursts ----

export type BattleEmoteKind = "heart" | "crown" | "fire" | "clap" | "laugh";

/**
 * Server-side gate for sending an emote. Enforces feature-live status,
 * blocks, and a 30-per-10s per-user rate limit. Actual broadcast to
 * other viewers happens on the shared realtime channel client-side.
 */
export async function sendLiveBattleEmote(battleId: string, kind: BattleEmoteKind): Promise<void> {
  const { error } = await supabase.rpc("live_battle_send_emote" as never, {
    _battle_id: battleId, _kind: kind,
  } as never);
  if (error) throw error;
}

export function emoteErrorMessage(err: unknown): string | null {
  const msg = String((err as { message?: string })?.message ?? "").toLowerCase();
  if (msg.includes("not_authenticated")) return "Sign in to react.";
  if (msg.includes("battle_not_live") || msg.includes("battle_not_found")) return null;
  if (msg.includes("feature_disabled")) return null;
  if (msg.includes("blocked")) return "You can't react in this battle.";
  if (msg.includes("rate") || msg.includes("limit")) return "Slow down a little!";
  return null;
}

