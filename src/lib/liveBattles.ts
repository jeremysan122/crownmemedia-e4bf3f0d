// Client helpers for Live Battles v1. All privileged actions round-trip to
// edge functions or SECURITY DEFINER RPCs. Never surface raw error messages.

import { supabase } from "@/integrations/supabase/client";

export interface LiveBattleRow {
  id: string;
  host_id: string;
  opponent_id: string;
  room_name: string;
  status: "pending" | "live" | "ended" | "declined" | "cancelled";
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
}

export function liveBattleErrorMessage(err: unknown, fallback: string): string {
  const msg = String((err as any)?.message ?? "").toLowerCase();
  if (msg.includes("battle_not_found")) return "This battle is no longer available.";
  if (msg.includes("battle_not_live")) return "This battle isn't live.";
  if (msg.includes("battle_not_pending")) return "This battle already started or ended.";
  if (msg.includes("already_voted")) return "You've already voted in this battle.";
  if (msg.includes("participants_cannot_vote")) return "Participants can't vote in their own battle.";
  if (msg.includes("not_participant")) return "Only participants can do that.";
  if (msg.includes("not_authorized")) return "You can't do that.";
  if (msg.includes("not_authenticated")) return "Please sign in.";
  if (msg.includes("feature_disabled")) return "Live battles aren't available right now.";
  if (msg.includes("invalid_opponent")) return "That opponent can't be challenged.";
  if (msg.includes("invalid_choice")) return "Pick host or opponent to vote.";
  if (msg.includes("invalid_reason")) return "Please add a short reason.";
  if (msg.includes("blocked")) return "You can't start a battle with that user.";
  if (msg.includes("rate")) return "You're doing that too fast. Try again soon.";
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

export async function reportLiveBattle(battleId: string, reason: string) {
  // Server-side RPC enforces rate limit + validation. Direct INSERT revoked.
  const { error } = await supabase.rpc("live_battle_report", {
    _battle_id: battleId, _reason: reason.slice(0, 500),
  });
  if (error) throw error;
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
