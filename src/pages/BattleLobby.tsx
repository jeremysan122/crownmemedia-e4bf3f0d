// Wave 2 — Pre-battle Lobby page.
// Route: /battles/:battleId/lobby
// - AV pre-check (camera / mic / network).
// - Ready-state panel (host + opponent).
// - Synchronized 3-2-1 countdown once the host starts.
// - Auto-navigates to /live/:battleId when status flips to 'live'.

import { useEffect, useState } from "react";
import { useNavigate, useParams, Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/context/AuthContext";
import { useServerTimeOffset } from "@/lib/serverTime";
import { LiveBattleRow, lobbyErrorMessage } from "@/lib/liveBattles";
import { mergeLiveBattleUpdate } from "@/lib/liveBattleRealtime";
import AVPreCheck from "@/components/battles/AVPreCheck";
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

  // Initial fetch + realtime subscription.
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
          .select("id, username, display_name")
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

  // Auto-navigate once the battle goes live.
  useEffect(() => {
    if (battle?.status === "live") {
      // Small delay so the "Live now!" announcement is spoken first.
      const t = setTimeout(() => nav(`/live/${battle.id}`, { replace: true }), 400);
      return () => clearTimeout(t);
    }
    if (battle?.status && ["ended", "cancelled", "declined"].includes(battle.status)) {
      nav(`/battles/${battle.id}`, { replace: true });
    }
  }, [battle?.status, battle?.id, nav]);

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

  const hostName = profiles[battle.host_id]?.display_name
    || profiles[battle.host_id]?.username || "Host";
  const opponentName = profiles[battle.opponent_id]?.display_name
    || profiles[battle.opponent_id]?.username || "Opponent";

  const isParticipant = user?.id === battle.host_id || user?.id === battle.opponent_id;

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
        <AVPreCheck />
      ) : (
        <div className="rounded-2xl border border-border bg-card p-4 text-sm text-muted-foreground text-center">
          You're watching the lobby. AV pre-check is only for the battlers.
        </div>
      )}

      <LobbyReadyPanel
        battle={battle}
        currentUserId={user?.id ?? ""}
        hostName={hostName}
        opponentName={opponentName}
      />

      <LobbyCountdown
        goLiveAt={battle.go_live_at ?? null}
        serverOffsetMs={serverOffsetMs}
        onLive={() => nav(`/live/${battle.id}`, { replace: true })}
      />
    </main>
  );
}
