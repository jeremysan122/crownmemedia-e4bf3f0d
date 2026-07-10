// Live Battle v1 — 1v1 head-to-head live room with voting, countdown,
// host controls, and viewer report. All privileged actions call server
// RPCs / edge functions. Feature-flag gated.

import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import {
  LiveKitRoom, GridLayout, ParticipantTile, RoomAudioRenderer,
  ControlBar, useTracks,
} from "@livekit/components-react";
import "@livekit/components-styles";
import { Track } from "livekit-client";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/context/AuthContext";
import { isFeatureEnabled } from "@/lib/featureFlags";
import {
  LiveBattleRow, liveBattleErrorMessage, mintLiveBattleToken,
  reportLiveBattle, roomControl, voteInLiveBattle,
} from "@/lib/liveBattles";
import { Button } from "@/components/ui/button";
import { toast } from "@/hooks/use-toast";
import { Loader2, ShieldAlert, Flag, Crown, Trophy, Share2 } from "lucide-react";

export default function LiveBattlePage() {
  const { battleId = "" } = useParams<{ battleId: string }>();
  const nav = useNavigate();
  const { user } = useAuth();
  const [allowed, setAllowed] = useState<boolean | null>(null);
  const [battle, setBattle] = useState<LiveBattleRow | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [lkUrl, setLkUrl] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [voting, setVoting] = useState(false);
  const [voted, setVoted] = useState<"host" | "opponent" | null>(null);

  // Feature-flag gate.
  useEffect(() => {
    isFeatureEnabled("live_battles_enabled").then(setAllowed);
  }, []);

  // Load battle row + subscribe to realtime updates.
  useEffect(() => {
    if (!battleId) return;
    let mounted = true;
    (async () => {
      const { data, error } = await supabase.from("live_battles").select("*").eq("id", battleId).maybeSingle();
      if (!mounted) return;
      if (error || !data) { setErr("This battle isn't available."); return; }
      setBattle(data as LiveBattleRow);
    })();
    const ch = supabase
      .channel(`live_battle:${battleId}`)
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "live_battles", filter: `id=eq.${battleId}` },
        (payload) => setBattle(payload.new as LiveBattleRow))
      .subscribe();
    return () => { mounted = false; supabase.removeChannel(ch); };
  }, [battleId]);

  // Mint token once the battle is loaded.
  useEffect(() => {
    if (!battle || !user) return;
    if (battle.status === "ended") return;
    (async () => {
      try {
        const t = await mintLiveBattleToken(battle.id);
        setToken(t.token);
        setLkUrl(t.url);
      } catch (e) {
        setErr(liveBattleErrorMessage(e, "Couldn't join the battle."));
      }
    })();
  }, [battle?.id, battle?.status, user?.id]);

  const isHost = user?.id === battle?.host_id;
  const isOpponent = user?.id === battle?.opponent_id;
  const isParticipant = isHost || isOpponent;

  const remainingSec = useCountdown(battle?.ends_at);

  const handleVote = async (choice: "host" | "opponent") => {
    if (!battle) return;
    setVoting(true);
    try {
      await voteInLiveBattle(battle.id, choice);
      setVoted(choice);
      toast({ title: "Vote counted" });
    } catch (e) {
      toast({ title: liveBattleErrorMessage(e, "Couldn't record your vote."), variant: "destructive" });
    } finally { setVoting(false); }
  };

  const handleEnd = async () => {
    if (!battle) return;
    try { await roomControl(battle.id, "end"); toast({ title: "Battle ended" }); }
    catch (e) { toast({ title: liveBattleErrorMessage(e, "Couldn't end battle."), variant: "destructive" }); }
  };

  const handleReport = async () => {
    if (!battle) return;
    const reason = window.prompt("Report reason (max 500 chars):", "")?.trim();
    if (!reason) return;
    try { await reportLiveBattle(battle.id, reason); toast({ title: "Report submitted" }); }
    catch (e) { toast({ title: liveBattleErrorMessage(e, "Couldn't submit report."), variant: "destructive" }); }
  };

  if (allowed === false) return <Gate msg="Live battles aren't available yet." onBack={() => nav("/battles")} />;
  if (err) return <Gate msg={err} onBack={() => nav("/battles")} />;
  if (!battle || allowed === null) return <Loading />;

  const total = battle.host_votes + battle.opponent_votes;
  const hostPct = total ? Math.round((battle.host_votes / total) * 100) : 50;
  const oppPct = 100 - hostPct;

  return (
    <div className="min-h-[100dvh] bg-background text-foreground flex flex-col">
      {/* Header */}
      <div className="p-3 flex items-center justify-between border-b border-border">
        <div className="text-sm font-semibold flex items-center gap-2">
          <span className="inline-block w-2 h-2 rounded-full bg-red-500 animate-pulse" />
          {battle.status === "live" ? "LIVE" : battle.status.toUpperCase()}
        </div>
        <div className="text-sm tabular-nums font-mono">
          {battle.status === "live" && remainingSec !== null ? formatSec(remainingSec) : "—"}
        </div>
        <button onClick={() => nav(-1)} className="text-sm text-muted-foreground hover:text-foreground">Leave</button>
      </div>

      {/* Video area */}
      <div className="flex-1 relative bg-black">
        {token && lkUrl ? (
          <LiveKitRoom
            token={token}
            serverUrl={lkUrl}
            connect
            video={isParticipant}
            audio={isParticipant}
            className="h-full"
            onDisconnected={() => setToken(null)}
          >
            <StageGrid />
            <RoomAudioRenderer />
            {isParticipant && <ControlBar variation="minimal" controls={{ microphone: true, camera: true, screenShare: false, leave: false }} />}
          </LiveKitRoom>
        ) : battle.status === "ended" ? (
          <div className="h-full flex items-center justify-center text-muted-foreground">This battle has ended.</div>
        ) : (
          <Loading />
        )}
      </div>

      {/* Score bar */}
      <div className="p-3 border-t border-border">
        <div className="flex items-center justify-between text-xs mb-1">
          <span className="flex items-center gap-1"><Crown className="w-3 h-3" />Host {battle.host_votes}</span>
          <span>Opponent {battle.opponent_votes}</span>
        </div>
        <div className="h-2 rounded-full overflow-hidden bg-muted flex">
          <div className="bg-primary" style={{ width: `${hostPct}%` }} />
          <div className="bg-accent" style={{ width: `${oppPct}%` }} />
        </div>

        {battle.status === "live" && !isParticipant && (
          <div className="mt-3 grid grid-cols-2 gap-2">
            <Button disabled={voting || voted !== null} onClick={() => handleVote("host")} variant={voted === "host" ? "default" : "outline"}>Vote Host</Button>
            <Button disabled={voting || voted !== null} onClick={() => handleVote("opponent")} variant={voted === "opponent" ? "default" : "outline"}>Vote Opponent</Button>
          </div>
        )}

        <div className="mt-3 flex items-center justify-between gap-2">
          {isHost && battle.status === "live" && (
            <Button size="sm" variant="destructive" onClick={handleEnd}><ShieldAlert className="w-4 h-4 mr-1" />End battle</Button>
          )}
          {!isParticipant && (
            <Button size="sm" variant="ghost" onClick={handleReport}><Flag className="w-4 h-4 mr-1" />Report</Button>
          )}
        </div>

        {battle.status === "ended" && (
          <div className="mt-3 text-sm text-center">
            {battle.winner_id
              ? <>Winner: <span className="font-semibold">{battle.winner_id === battle.host_id ? "Host" : "Opponent"}</span></>
              : <>Result: tie / no votes</>}
          </div>
        )}
      </div>
    </div>
  );
}

function StageGrid() {
  const tracks = useTracks(
    [{ source: Track.Source.Camera, withPlaceholder: true }],
    { onlySubscribed: false },
  );
  return (
    <GridLayout tracks={tracks} className="h-full">
      <ParticipantTile />
    </GridLayout>
  );
}

function useCountdown(endsAt: string | null | undefined): number | null {
  const [tick, setTick] = useState(0);
  useEffect(() => { const t = setInterval(() => setTick((n) => n + 1), 1000); return () => clearInterval(t); }, []);
  return useMemo(() => {
    if (!endsAt) return null;
    const s = Math.max(0, Math.floor((Date.parse(endsAt) - Date.now()) / 1000));
    return s;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [endsAt, tick]);
}

function formatSec(s: number) {
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m}:${r.toString().padStart(2, "0")}`;
}

function Loading() {
  return <div className="flex-1 flex items-center justify-center text-muted-foreground"><Loader2 className="animate-spin w-6 h-6" /></div>;
}

function Gate({ msg, onBack }: { msg: string; onBack: () => void }) {
  return (
    <div className="min-h-[100dvh] flex flex-col items-center justify-center gap-4 p-6 text-center">
      <div className="text-lg">{msg}</div>
      <Button onClick={onBack} variant="outline">Back</Button>
    </div>
  );
}
