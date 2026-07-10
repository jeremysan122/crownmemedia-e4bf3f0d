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
  if (!battle || allowed === null) return <Loading label="Loading battle…" />;

  const total = battle.host_votes + battle.opponent_votes;
  const hostPct = total ? Math.round((battle.host_votes / total) * 100) : 50;
  const oppPct = 100 - hostPct;
  const leader: "host" | "opponent" | "tie" =
    battle.host_votes === battle.opponent_votes ? "tie"
    : battle.host_votes > battle.opponent_votes ? "host" : "opponent";

  // Results screen after end.
  if (battle.status === "ended") {
    return (
      <ResultsScreen
        battle={battle}
        onBack={() => nav("/battles/live")}
      />
    );
  }

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
        ) : (
          <Loading label={isParticipant ? "Joining stage…" : "Joining as viewer…"} />
        )}
      </div>

      {/* Vote bar */}
      <div className="p-3 border-t border-border">
        <div className="flex items-center justify-between text-xs mb-1.5">
          <span className={`flex items-center gap-1 font-semibold ${leader === "host" ? "text-primary" : "text-muted-foreground"}`}>
            {leader === "host" && <Crown className="w-3 h-3" />} Host · {battle.host_votes}
          </span>
          <span className="text-[10px] uppercase tracking-wider text-muted-foreground">
            {total === 0 ? "No votes yet" : leader === "tie" ? "Tied" : `${leader === "host" ? hostPct : oppPct}% leading`}
          </span>
          <span className={`flex items-center gap-1 font-semibold ${leader === "opponent" ? "text-accent-foreground" : "text-muted-foreground"}`}>
            Opponent · {battle.opponent_votes} {leader === "opponent" && <Crown className="w-3 h-3" />}
          </span>
        </div>
        <div className="h-2.5 rounded-full overflow-hidden bg-muted flex">
          <div
            className="bg-primary transition-all duration-500 ease-out"
            style={{ width: `${hostPct}%` }}
          />
          <div
            className="bg-accent transition-all duration-500 ease-out"
            style={{ width: `${oppPct}%` }}
          />
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
      </div>
    </div>
  );
}

function ResultsScreen({ battle, onBack }: { battle: LiveBattleRow; onBack: () => void }) {
  const total = battle.host_votes + battle.opponent_votes;
  const hostPct = total ? Math.round((battle.host_votes / total) * 100) : 50;
  const oppPct = 100 - hostPct;
  const winner: "host" | "opponent" | "tie" =
    !battle.winner_id
      ? "tie"
      : battle.winner_id === battle.host_id ? "host" : "opponent";

  const handleShare = async () => {
    const url = `${window.location.origin}/live/${battle.id}`;
    const text = winner === "tie"
      ? `A live battle just ended in a tie on CrownMe!`
      : `The ${winner} won a live battle on CrownMe with ${winner === "host" ? battle.host_votes : battle.opponent_votes} votes!`;
    try {
      if (navigator.share) {
        await navigator.share({ title: "CrownMe Live Battle", text, url });
      } else {
        await navigator.clipboard.writeText(url);
        toast({ title: "Link copied to clipboard" });
      }
    } catch { /* user cancelled */ }
  };

  return (
    <div className="min-h-[100dvh] bg-background text-foreground flex flex-col items-center justify-center p-6">
      <div className="w-full max-w-sm rounded-2xl border border-border/60 bg-card p-6 text-center">
        <div className="mx-auto w-14 h-14 rounded-full bg-primary/15 flex items-center justify-center">
          <Trophy className="text-primary" size={28} />
        </div>
        <h1 className="mt-4 text-2xl font-black">
          {winner === "tie" ? "It's a tie!" : `${winner === "host" ? "Host" : "Opponent"} wins`}
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {total === 0 ? "No votes were cast." : `${total} total votes`}
        </p>

        {/* Breakdown */}
        <div className="mt-6 text-left">
          <div className="flex items-center justify-between text-xs font-semibold mb-1.5">
            <span className={winner === "host" ? "text-primary" : "text-muted-foreground"}>
              {winner === "host" && "👑 "}Host · {battle.host_votes} ({hostPct}%)
            </span>
            <span className={winner === "opponent" ? "text-accent-foreground" : "text-muted-foreground"}>
              {winner === "opponent" && "👑 "}Opponent · {battle.opponent_votes} ({oppPct}%)
            </span>
          </div>
          <div className="h-3 rounded-full overflow-hidden bg-muted flex">
            <div className="bg-primary transition-all duration-700 ease-out" style={{ width: `${hostPct}%` }} />
            <div className="bg-accent transition-all duration-700 ease-out" style={{ width: `${oppPct}%` }} />
          </div>
        </div>

        {battle.ended_reason && (
          <p className="mt-4 text-xs text-muted-foreground italic">
            Ended: {battle.ended_reason}
          </p>
        )}

        <div className="mt-6 grid gap-2">
          <Button onClick={handleShare} className="w-full">
            <Share2 className="w-4 h-4 mr-1" /> Share result
          </Button>
          <Button variant="outline" onClick={onBack} className="w-full">
            Back to live battles
          </Button>
        </div>
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
