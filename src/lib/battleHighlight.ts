// Wave 6 — client helpers for post-battle highlight + battler analytics.
// Thin wrappers around SECURITY DEFINER RPCs; UI never touches the tables.

import { supabase } from "@/integrations/supabase/client";

export interface BattleParticipantProfile {
  id: string;
  username: string | null;
  display_name: string | null;
  avatar_url: string | null;
}

export interface BattleTopGifter {
  sender_id: string;
  username: string | null;
  display_name: string | null;
  avatar_url: string | null;
  shekels: number;
}

export interface LiveBattleHighlight {
  battle_id: string;
  host: BattleParticipantProfile | null;
  opponent: BattleParticipantProfile | null;
  host_votes: number;
  opponent_votes: number;
  winner_id: string | null;
  status: string;
  category: string | null;
  region: string | null;
  peak_viewers: number;
  ended_at: string | null;
  host_gift_shekels: number;
  opponent_gift_shekels: number;
  top_gifters: BattleTopGifter[];
}

export interface BattlerAnalyticsBattle {
  battle_id: string;
  ended_at: string | null;
  category_slug: string | null;
  region: string | null;
  peak_viewers: number;
  was_host: boolean;
  my_votes: number;
  their_votes: number;
  won: boolean;
  gift_shekels: number;
  top_supporter: BattleTopGifter | null;
}

export interface BattlerAnalyticsSummary {
  battles: number;
  wins: number;
  total_votes: number;
  total_gift_shekels: number;
  peak_viewers_max: number;
}

export interface BattlerAnalytics {
  summary: BattlerAnalyticsSummary;
  battles: BattlerAnalyticsBattle[];
}

/** Best-name-first display label for a participant. */
export function participantLabel(p: BattleParticipantProfile | null | undefined, fallback: string): string {
  if (!p) return fallback;
  return p.display_name?.trim() || p.username?.trim() || fallback;
}

/** Map RPC errors to friendly copy. */
export function highlightErrorMessage(e: unknown, fallback = "Couldn't load results."): string {
  const msg = (e as { message?: string } | null)?.message ?? "";
  if (msg.includes("not_authenticated")) return "Please sign in to view results.";
  if (msg.includes("battle_not_found")) return "This battle no longer exists.";
  if (msg.includes("not_authorized")) return "You can only view your own analytics.";
  return fallback;
}

export async function fetchLiveBattleHighlight(battleId: string): Promise<LiveBattleHighlight> {
  const { data, error } = await supabase.rpc("get_live_battle_highlight" as never, {
    _battle_id: battleId,
  } as never);
  if (error) throw error;
  return data as unknown as LiveBattleHighlight;
}

export async function fetchBattlerAnalytics(userId: string, limit = 25): Promise<BattlerAnalytics> {
  const { data, error } = await supabase.rpc("get_battler_battle_analytics" as never, {
    _user_id: userId, _limit: limit,
  } as never);
  if (error) throw error;
  return data as unknown as BattlerAnalytics;
}
