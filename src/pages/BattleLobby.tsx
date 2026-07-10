// Wave 2 — Pre-battle Lobby page.
// Route: /battles/:battleId/lobby
// - Participants join a real LiveKit `${room_name}__lobby` for AV pre-check.
// - Ready-state panel (host + opponent).
// - Synchronized 5-4-3-2-1 countdown once the host presses "Go live".
// - Auto-navigates to /live/:battleId ONLY when the countdown reaches zero.

import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate, useParams, Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/context/AuthContext";
import { useServerTimeOffset } from "@/lib/serverTime";
import { LiveBattleRow, lobbyErrorMessage } from "@/lib/liveBattles";
import { mergeLiveBattleUpdate } from "@/lib/liveBattleRealtime";
import LobbyRoom from "@/components/battles/LobbyRoom";
import LobbyReadyPanel from "@/components/battles/LobbyReadyPanel";
import LobbyCountdown from "@/components/battles/LobbyCountdown";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Loader2 } from "lucide-react";

interface ProfileLite { id: string; username: string | null; }

export default function BattleLobbyPage() {
  const { battleId = "" } = useParams<{ battleId: string }>();
  const nav = useNavigate();
  const { user } = useAuth();
  const serverOffsetMs = useServerTimeOffset();

  const [battle, setBattle] = useState<LiveBattleRow | null>(null);
  const [profiles, setProfiles] = useState<Record<string, ProfileLite>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const navigatedRef = useRef(false);

  useEffect(() => {
    if (!battleId) return;
    let cancelled = false;

    (async () => {
      try {
        const { data, error: dbErr } = await supabase
          .from("live_battles")
          .select("*")
          .eq("id", battleId)
          .maybeSingle();
        if (dbErr) throw dbErr;
        if (!data) { setError("This battle isn't available."); return; }
        if (cancelled) return;
        setBattle(data as unknown as LiveBattleRow);

        const { data: pRows } = await supabase
          .from("profiles")
          .select("id, username")
          .in("id", [(data as any).host_id, (data as any).opponent_id]);
        if (!cancelled && pRows) {
          const map: Record<string, ProfileLite> = {};
          for (const p of pRows as ProfileLite[]) map[p.id] = p;
          setProfiles(map);
        }
      } catch (e) {
        setError(lobbyErrorMessage(e));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    const channel = supabase
      .channel(`battle_lobby:${battleId}`)
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "live_battles", filter: `id=eq.${battleId}` },
        (payload) => {
          setBattle((prev) => (prev ? mergeLiveBattleUpdate(prev, payload.new as any) : (payload.new as any)));
        },
      )
      .subscribe();

    return () => {
      cancelled = true;
      supabase.removeChannel(channel);
    };
  }, [battleId]);

  const goLive = useCallback(() => {
    if (navigatedRef.current || !battle) return;
    navigatedRef.current = true;
    nav(`/live/${battle.id}`, { replace: true });
  }, [battle, nav]);

  // Terminal states — bounce to summary.
  useEffect(() => {
    if (battle?.status && ["ended", "cancelled", "declined"].includes(battle.status)) {
      nav(`/battles/${battle.id}`, { replace: true });
    }
  }, [battle?.status, battle?.id, nav]);

  // Fallback: if the battle is already live AND go_live_at has already passed
  // (host started before we mounted, or go_live_at is null), navigate now.
  useEffect(() => {
    if (!battle || battle.status !== "live") return;
    const target = battle.go_live_at ? new Date(battle.go_live_at).getTime() : 0;
    const now = Date.now() + serverOffsetMs;
    if (!battle.go_live_at || target <= now) goLive();
  }, [battle, serverOffsetMs, goLive]);

  if (loading) {
    return (
      <div className="min-h-dvh flex items-center justify-center">
        <Loader2 className="animate-spin" aria-label="Loading lobby" />
      </div>
    );
  }
  if (error || !battle) {
    return (
      <div className="min-h-dvh flex flex-col items-center justify-center gap-4 p-6">
        <p className="text-destructive text-center">{error ?? "Battle unavailable."}</p>
        <Button asChild variant="secondary">
          <Link to="/battles"><ArrowLeft size={16} /> Back to battles</Link>
        </Button>
      </div>
    );
  }

  const hostName = profiles[battle.host_id]?.username || "Host";
  const opponentName = profiles[battle.opponent_id]?.username || "Opponent";
  const isParticipant = user?.id === battle.host_id || user?.id === battle.opponent_id;
  const countingDown =
    battle.status === "live" &&
    !!battle.go_live_at &&
    new Date(battle.go_live_at).getTime() > Date.now() + serverOffsetMs;

  return (
    <main className="min-h-dvh px-4 py-6 max-w-3xl mx-auto space-y-6">
      <header className="flex items-center justify-between">
        <Button asChild variant="ghost" size="sm">
          <Link to="/battles" aria-label="Back to battles"><ArrowLeft size={16} /> Back</Link>
        </Button>
        <h1 className="font-display text-lg">Pre-battle lobby</h1>
        <div className="w-16" />
      </header>

      <p className="text-center text-sm text-muted-foreground">
        {hostName} <span aria-hidden>vs</span> {opponentName}
      </p>

      {isParticipant ? (
        <LobbyRoom battleId={battle.id} />
      ) : (
        <div className="rounded-2xl border border-border bg-card p-4 text-sm text-muted-foreground text-center">
          The lobby is participants-only. You'll join when the battle goes live.
        </div>
      )}

      {countingDown ? (
        <div className="rounded-2xl border border-primary/40 bg-primary/5 p-4 space-y-2 text-center">
          <p className="font-display text-base">Battle is starting…</p>
          <LobbyCountdown
            goLiveAt={battle.go_live_at ?? null}
            serverOffsetMs={serverOffsetMs}
            onLive={goLive}
          />
          <p className="text-xs text-muted-foreground">Voting opens when the countdown ends.</p>
        </div>
      ) : (
        <LobbyReadyPanel
          battle={battle}
          currentUserId={user?.id ?? ""}
          hostName={hostName}
          opponentName={opponentName}
        />
      )}
    </main>
  );
}
