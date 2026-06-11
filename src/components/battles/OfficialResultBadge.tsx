// Renders the authoritative ended-battle result fetched from the
// `get_battle_official_result` RPC. Shows winner / tie / no-winner /
// loading / error states. Used on the Crown Battles list cards (and
// reusable on the detail page) so every surface that displays an
// ended battle goes through the same server-truth path.
//
// Safety: the RPC excludes banned/suspended/deleted/moderated
// participants, so this component never has to do client-side
// participant safety checks itself — it just displays what the
// server returned. The component also DOES NOT render the winner's
// raw username/avatar: it accepts a small lookup so the caller can
// resolve the profile from the already-loaded battle row (which has
// itself passed isSafeBattleForList).

import { Loader2, Trophy, Equal, AlertCircle, RefreshCw } from "lucide-react";
import { useOfficialBattleResult } from "@/hooks/useOfficialBattleResult";

interface Props {
  battleId: string;
  enabled: boolean; // pass true only for ended battles
  resolveUsername?: (userId: string) => string | null | undefined;
}

export function OfficialResultBadge({ battleId, enabled, resolveUsername }: Props) {
  const { result, loading, error, refresh } = useOfficialBattleResult(battleId, enabled);

  if (!enabled) return null;

  if (loading && !result) {
    return (
      <span
        aria-live="polite"
        className="inline-flex items-center gap-1 text-[10px] uppercase font-bold text-muted-foreground"
      >
        <Loader2 size={10} className="animate-spin" /> Result…
      </span>
    );
  }

  if (error) {
    return (
      <button
        type="button"
        onClick={refresh}
        aria-label="Retry loading official result"
        className="inline-flex items-center gap-1 text-[10px] uppercase font-bold text-destructive hover:underline"
      >
        <AlertCircle size={10} /> Retry <RefreshCw size={9} />
      </button>
    );
  }

  if (!result || result.kind === "pending") return null;

  if (result.kind === "tie") {
    return (
      <span
        title={`Tie — ${result.votes} votes each`}
        className="inline-flex items-center gap-1 text-[10px] uppercase font-bold text-accent"
      >
        <Equal size={10} /> Tie
      </span>
    );
  }

  if (result.kind === "none") {
    const label =
      result.reason === "participants_unavailable"
        ? "Result unavailable"
        : result.reason === "no_votes"
        ? "No votes"
        : "No winner";
    return (
      <span
        className="inline-flex items-center gap-1 text-[10px] uppercase font-bold text-muted-foreground"
      >
        <AlertCircle size={10} /> {label}
      </span>
    );
  }

  // result.kind === "winner"
  const total = result.winner_votes + result.loser_votes || 1;
  const margin = Math.round((Math.abs(result.winner_votes - result.loser_votes) / total) * 100);
  const name = resolveUsername?.(result.winner_id);

  return (
    <span
      title={name ? `Winner: @${name}` : "Official winner"}
      className="inline-flex items-center gap-1 text-[10px] uppercase font-bold text-primary"
    >
      <Trophy size={10} /> {margin}% margin
    </span>
  );
}
