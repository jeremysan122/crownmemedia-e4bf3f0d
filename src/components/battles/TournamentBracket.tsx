// Wave 5 — Static single-elim bracket renderer.
// Uses grouped matches from `groupMatchesByRound`. Each round is a column;
// each match card shows the two participants + status. Winner and
// "current" (ready-to-start) matches are highlighted.

import { Link } from "react-router-dom";
import { Play, Crown, Loader2 } from "lucide-react";
import {
  type TournamentMatchRow, type TournamentRow,
  groupMatchesByRound, roundLabel, totalRoundsForSize,
  startTournamentMatch, tournamentErrorMessage,
} from "@/lib/tournaments";
import { Button } from "@/components/ui/button";
import { toast } from "@/hooks/use-toast";
import { useState } from "react";
import { useNavigate } from "react-router-dom";

interface Props {
  tournament: TournamentRow;
  matches: TournamentMatchRow[];
  profilesByUserId: Record<string, { username: string | null; display_name: string | null }>;
  canStartMatch: (m: TournamentMatchRow) => boolean;
}

function displayFor(
  userId: string | null,
  profiles: Props["profilesByUserId"],
): string {
  if (!userId) return "TBD";
  const p = profiles[userId];
  return p?.display_name || p?.username || "Battler";
}

export default function TournamentBracket({ tournament, matches, profilesByUserId, canStartMatch }: Props) {
  const rounds = groupMatchesByRound(matches);
  const total = totalRoundsForSize(tournament.size);
  const nav = useNavigate();
  const [starting, setStarting] = useState<string | null>(null);

  const onStart = async (matchId: string) => {
    setStarting(matchId);
    try {
      const battle = await startTournamentMatch(matchId);
      toast({ title: "Match starting", description: "Opening the lobby…" });
      nav(`/battles/${battle.id}/lobby`);
    } catch (e) {
      toast({ title: tournamentErrorMessage(e), variant: "destructive" });
    } finally {
      setStarting(null);
    }
  };

  return (
    <div
      className="flex gap-4 overflow-x-auto pb-2"
      data-testid="tournament-bracket"
      aria-label={`Bracket for ${tournament.title}`}
    >
      {rounds.map((roundMatches, i) => (
        <div key={i} className="min-w-[220px] flex-1 space-y-3">
          <div className="text-xs uppercase tracking-wider font-semibold text-muted-foreground">
            {roundLabel(i + 1, total)}
          </div>
          <div className="space-y-3">
            {roundMatches.map((m) => {
              const winnerHost = m.winner_id && m.winner_id === m.host_id;
              const winnerOpp = m.winner_id && m.winner_id === m.opponent_id;
              const canStart = canStartMatch(m);
              return (
                <div
                  key={m.id}
                  className={`rounded-lg border bg-card p-2.5 text-sm space-y-1 ${
                    m.status === "ready" ? "border-primary/60 shadow-sm" : "border-border/60"
                  }`}
                  data-testid={`tournament-match-${m.id}`}
                >
                  <ParticipantRow
                    label={displayFor(m.host_id, profilesByUserId)}
                    isWinner={!!winnerHost}
                  />
                  <div className="text-[10px] text-muted-foreground text-center">vs</div>
                  <ParticipantRow
                    label={displayFor(m.opponent_id, profilesByUserId)}
                    isWinner={!!winnerOpp}
                  />
                  <div className="pt-1.5 flex items-center justify-between gap-2">
                    <StatusPill status={m.status} />
                    {m.status === "live" && m.battle_id && (
                      <Link
                        to={`/live/${m.battle_id}`}
                        className="text-[11px] text-primary underline"
                      >
                        Watch
                      </Link>
                    )}
                    {m.status === "ready" && canStart && (
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        className="h-6 px-2 text-[11px]"
                        disabled={starting === m.id}
                        onClick={() => onStart(m.id)}
                        aria-label={`Start match ${m.slot + 1}`}
                      >
                        {starting === m.id
                          ? <Loader2 className="w-3 h-3 mr-1 animate-spin" />
                          : <Play className="w-3 h-3 mr-1" />}
                        Start
                      </Button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}

function ParticipantRow({ label, isWinner }: { label: string; isWinner: boolean }) {
  return (
    <div className={`flex items-center gap-1.5 rounded px-1.5 py-1 truncate ${
      isWinner ? "bg-primary/10 text-primary font-semibold" : ""
    }`}>
      {isWinner && <Crown className="w-3 h-3 shrink-0" />}
      <span className="truncate">{label}</span>
    </div>
  );
}

function StatusPill({ status }: { status: TournamentMatchRow["status"] }) {
  const map: Record<TournamentMatchRow["status"], { label: string; cls: string }> = {
    pending: { label: "Waiting", cls: "bg-muted text-muted-foreground" },
    ready: { label: "Ready", cls: "bg-primary/15 text-primary" },
    live: { label: "Live", cls: "bg-red-500/15 text-red-500" },
    completed: { label: "Done", cls: "bg-emerald-500/15 text-emerald-500" },
  };
  const { label, cls } = map[status];
  return (
    <span className={`inline-flex items-center px-1.5 py-0.5 rounded-full text-[10px] font-semibold ${cls}`}>
      {label}
    </span>
  );
}
