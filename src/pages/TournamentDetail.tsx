// Wave 5 — Tournament detail: bracket + realtime auto-advance.

import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { ArrowLeft, Trophy, Crown } from "lucide-react";
import AppShell from "@/components/AppShell";
import { useSeoMeta } from "@/hooks/useSeoMeta";
import { useAuth } from "@/context/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import {
  fetchTournament, type TournamentRow, type TournamentMatchRow,
} from "@/lib/tournaments";
import TournamentBracket from "@/components/battles/TournamentBracket";

interface ProfileLite { id: string; username: string | null; display_name: string | null }

export default function TournamentDetail() {
  const { id } = useParams<{ id: string }>();
  const { user } = useAuth();
  const [tournament, setTournament] = useState<TournamentRow | null>(null);
  const [matches, setMatches] = useState<TournamentMatchRow[]>([]);
  const [profiles, setProfiles] = useState<Record<string, ProfileLite>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useSeoMeta({
    title: tournament ? `${tournament.title} — CrownMe Tournament` : "Tournament — CrownMe",
    description: "Live tournament bracket on CrownMe.",
  });

  const load = useCallback(async () => {
    if (!id) return;
    try {
      const { tournament: t, matches: m } = await fetchTournament(id);
      setTournament(t);
      setMatches(m);
      const ids = Array.from(new Set(m.flatMap((x) => [x.host_id, x.opponent_id, x.winner_id]).filter(Boolean))) as string[];
      if (ids.length) {
        const { data } = await supabase.from("profiles").select("id,username,display_name").in("id", ids);
        const map: Record<string, ProfileLite> = {};
        (data ?? []).forEach((p: ProfileLite) => { map[p.id] = p; });
        setProfiles(map);
      }
    } catch (e) {
      setError((e as Error).message ?? "Failed to load tournament");
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => { load(); }, [load]);

  // Realtime: refresh whenever any match in this tournament changes (advance trigger,
  // start of new battle, etc). Keeps the bracket in sync without polling.
  useEffect(() => {
    if (!id) return;
    const ch = supabase.channel(`tournament:${id}`)
      .on("postgres_changes", {
        event: "*", schema: "public", table: "tournament_matches",
        filter: `tournament_id=eq.${id}`,
      }, () => { load(); })
      .on("postgres_changes", {
        event: "UPDATE", schema: "public", table: "tournaments",
        filter: `id=eq.${id}`,
      }, () => { load(); })
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [id, load]);

  const canStartMatch = useCallback((m: TournamentMatchRow) => {
    if (!user || !tournament) return false;
    return user.id === tournament.created_by
      || user.id === m.host_id
      || user.id === m.opponent_id;
  }, [user, tournament]);

  const profilesMap = useMemo(() => {
    const out: Record<string, { username: string | null; display_name: string | null }> = {};
    Object.values(profiles).forEach((p) => { out[p.id] = { username: p.username, display_name: p.display_name }; });
    return out;
  }, [profiles]);

  return (
    <AppShell>
      <div className="mx-auto w-full max-w-6xl px-4 sm:px-6 pt-5 pb-24">
        <Link to="/tournaments" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground mb-4">
          <ArrowLeft className="w-4 h-4" /> All tournaments
        </Link>

        {loading ? (
          <div className="text-sm text-muted-foreground">Loading bracket…</div>
        ) : error || !tournament ? (
          <div className="rounded-lg border border-destructive/40 bg-destructive/5 p-4 text-sm text-destructive">
            {error ?? "Tournament not found."}
          </div>
        ) : (
          <>
            <header className="mb-5">
              <div className="flex items-center gap-2 text-xs text-muted-foreground uppercase tracking-wider">
                <Trophy className="w-3.5 h-3.5" />
                {tournament.size}-battler · {tournament.status}
              </div>
              <h1 className="text-2xl font-black mt-1">{tournament.title}</h1>
              {tournament.winner_id && profiles[tournament.winner_id] && (
                <div className="mt-2 inline-flex items-center gap-1.5 text-sm font-semibold text-primary">
                  <Crown className="w-4 h-4" />
                  Champion: {profiles[tournament.winner_id].display_name ?? profiles[tournament.winner_id].username}
                </div>
              )}
            </header>
            <TournamentBracket
              tournament={tournament}
              matches={matches}
              profilesByUserId={profilesMap}
              canStartMatch={canStartMatch}
            />
          </>
        )}
      </div>
    </AppShell>
  );
}
