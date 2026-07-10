// Wave 5 — Tournaments client helpers.
// Single-elim brackets (4/8/16). All privileged writes round-trip through
// SECURITY DEFINER RPCs; direct table writes are blocked by RLS.

import { supabase } from "@/integrations/supabase/client";
import type { LiveBattleRow } from "@/lib/liveBattles";

export type TournamentSize = 4 | 8 | 16;
export type TournamentStatus = "active" | "completed" | "cancelled";
export type TournamentMatchStatus = "pending" | "ready" | "live" | "completed";

export interface TournamentRow {
  id: string;
  title: string;
  size: TournamentSize;
  status: TournamentStatus;
  created_by: string;
  winner_id: string | null;
  category_slug: string | null;
  region: string | null;
  duration_seconds: number;
  current_round: number;
  created_at: string;
  completed_at: string | null;
}

export interface TournamentMatchRow {
  id: string;
  tournament_id: string;
  round: number;
  slot: number;
  host_id: string | null;
  opponent_id: string | null;
  battle_id: string | null;
  winner_id: string | null;
  next_match_id: string | null;
  next_slot: 0 | 1 | null;
  status: TournamentMatchStatus;
  created_at: string;
}

export function totalRoundsForSize(size: TournamentSize): number {
  return size === 4 ? 2 : size === 8 ? 3 : 4;
}

/** Pure helper: group matches by round for bracket rendering. */
export function groupMatchesByRound(
  matches: TournamentMatchRow[],
): TournamentMatchRow[][] {
  const byRound = new Map<number, TournamentMatchRow[]>();
  for (const m of matches) {
    if (!byRound.has(m.round)) byRound.set(m.round, []);
    byRound.get(m.round)!.push(m);
  }
  return [...byRound.keys()]
    .sort((a, b) => a - b)
    .map((r) => byRound.get(r)!.sort((a, b) => a.slot - b.slot));
}

/** Round labels — "Round 1", "Quarterfinals", "Semifinals", "Final". */
export function roundLabel(round: number, totalRounds: number): string {
  const fromEnd = totalRounds - round;
  if (fromEnd === 0) return "Final";
  if (fromEnd === 1) return "Semifinals";
  if (fromEnd === 2) return "Quarterfinals";
  return `Round ${round}`;
}

export function tournamentErrorMessage(err: unknown): string {
  const raw = String((err as { message?: string })?.message ?? "").toLowerCase();
  if (raw.includes("invalid_size")) return "Tournament size must be 4, 8, or 16.";
  if (raw.includes("invalid_participants")) return "Participant count must match the bracket size.";
  if (raw.includes("duplicate_participants")) return "Each participant can only appear once.";
  if (raw.includes("invalid_title")) return "Give your tournament a real title (at least 3 characters).";
  if (raw.includes("invalid_category")) return "That category isn't available.";
  if (raw.includes("match_not_found")) return "That match no longer exists.";
  if (raw.includes("match_not_ready")) return "That match isn't ready yet — waiting on the previous round.";
  if (raw.includes("match_already_started")) return "That match already started.";
  if (raw.includes("match_missing_participants")) return "Both participants must be set before the match can start.";
  if (raw.includes("not_authorized")) return "You can't do that.";
  if (raw.includes("not_authenticated")) return "Please sign in to continue.";
  if (raw.includes("feature_disabled")) return "Tournaments aren't available right now.";
  if (raw.includes("rate")) return "You're creating tournaments too fast. Try again in a bit.";
  return "Something went wrong. Please try again.";
}

export async function createTournament(input: {
  title: string;
  size: TournamentSize;
  participants: string[];
  categorySlug?: string | null;
  region?: string | null;
  durationSeconds?: number;
}): Promise<TournamentRow> {
  const { data, error } = await supabase.rpc("create_tournament" as never, {
    _title: input.title,
    _size: input.size,
    _participants: input.participants,
    _category_slug: input.categorySlug ?? null,
    _region: input.region ?? null,
    _duration_seconds: input.durationSeconds ?? 300,
  } as never);
  if (error) throw error;
  return data as unknown as TournamentRow;
}

export async function startTournamentMatch(matchId: string): Promise<LiveBattleRow> {
  const { data, error } = await supabase.rpc("start_tournament_match" as never, {
    _match_id: matchId,
  } as never);
  if (error) throw error;
  return data as unknown as LiveBattleRow;
}

export async function fetchTournament(id: string): Promise<{
  tournament: TournamentRow;
  matches: TournamentMatchRow[];
}> {
  const [t, m] = await Promise.all([
    supabase.from("tournaments" as never).select("*").eq("id", id).maybeSingle(),
    supabase.from("tournament_matches" as never).select("*").eq("tournament_id", id)
      .order("round", { ascending: true }).order("slot", { ascending: true }),
  ]);
  if (t.error) throw t.error;
  if (m.error) throw m.error;
  if (!t.data) throw new Error("tournament_not_found");
  return {
    tournament: t.data as unknown as TournamentRow,
    matches: (m.data ?? []) as unknown as TournamentMatchRow[],
  };
}

export async function listActiveTournaments(limit = 30): Promise<TournamentRow[]> {
  const { data, error } = await supabase
    .from("tournaments" as never)
    .select("*")
    .eq("status", "active")
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw error;
  return (data ?? []) as unknown as TournamentRow[];
}
