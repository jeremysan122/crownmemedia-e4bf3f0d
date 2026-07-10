// Live Battle v1 — 1v1 head-to-head live room with voting, countdown,
// host controls, admin force-end, and viewer reporting. All privileged
// actions call server RPCs / edge functions. Feature-flag gated.

import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import {
  LiveKitRoom, GridLayout, ParticipantTile, RoomAudioRenderer,
  ControlBar, useTracks, useParticipants,
} from "@livekit/components-react";
import "@livekit/components-styles";
import { Track } from "livekit-client";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/context/AuthContext";
import { isFeatureEnabled } from "@/lib/featureFlags";
import {
  LiveBattleRow, LiveBattleReportRow, liveBattleErrorMessage, mintLiveBattleToken,
  reportCooldownSeconds, formatCooldown,
  reportLiveBattle, roomControl, voteInLiveBattle,
} from "@/lib/liveBattles";
import LiveBattleActivityLog from "@/components/battles/LiveBattleActivityLog";
import LiveBattleShareCard from "@/components/battles/LiveBattleShareCard";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import { toast } from "@/hooks/use-toast";
import {
  Loader2, ShieldAlert, Flag, Crown, Trophy, Share2,
  MicOff, Mic, UserX, Users, Gavel,
} from "lucide-react";

type JoinStep = "idle" | "verifying" | "minting" | "connecting" | "connected" | "error";

export default function LiveBattlePage() {
  const { battleId = "" } = useParams<{ battleId: string }>();
  const nav = useNavigate();
  const { user, isAdmin, isModerator } = useAuth();
  const [allowed, setAllowed] = useState<boolean | null>(null);
  const [battle, setBattle] = useState<LiveBattleRow | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [lkUrl, setLkUrl] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [voting, setVoting] = useState(false);
  const [voted, setVoted] = useState<"host" | "opponent" | null>(null);
  const [joinStep, setJoinStep] = useState<JoinStep>("idle");
  const [reportOpen, setReportOpen] = useState(false);
  const [reportReason, setReportReason] = useState("");
  const [reportBusy, setReportBusy] = useState(false);
  const [reportError, setReportError] = useState<string | null>(null);
  const [reportCooldown, setReportCooldown] = useState<{ kind: "duplicate" | "rate_limited"; until: number } | null>(null);
  const [myReport, setMyReport] = useState<LiveBattleReportRow | null>(null);
  const [modBusy, setModBusy] = useState(false);
  const [showModPanel, setShowModPanel] = useState(false);

  // Feature-flag gate.
  useEffect(() => {
    setJoinStep("verifying");
    isFeatureEnabled("live_battles_enabled").then((ok) => {
      setAllowed(ok);
      if (!ok) setJoinStep("error");
    }).catch(() => {
      setAllowed(false);
      setErr("We couldn't verify live battles right now. Please try again.");
      setJoinStep("error");
    });
  }, []);

  // Load battle row + subscribe to realtime updates.
  useEffect(() => {
    if (!battleId) return;
    let mounted = true;
    (async () => {
      const { data, error } = await supabase.from("live_battles").select("*").eq("id", battleId).maybeSingle();
      if (!mounted) return;
      if (error || !data) { setErr("This battle isn't available."); setJoinStep("error"); return; }
      setBattle(data as LiveBattleRow);
    })();
    const ch = supabase
      .channel(`live_battle:${battleId}`)
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "live_battles", filter: `id=eq.${battleId}` },
        (payload) => {
          const next = payload.new as LiveBattleRow;
          setBattle((prev) => {
            // Announce transition to ended so viewers see immediate confirmation
            // before the results screen replaces the room.
            if (prev && prev.status !== "ended" && next.status === "ended") {
              const reason = next.ended_reason ?? "host_end";
              const description =
                reason === "admin_force_end" ? "A moderator ended this battle. Results are final."
                : reason === "host_end" ? "The host ended the battle. Showing results now."
                : "The battle ended. Showing results now.";
              toast({ title: "Battle ended", description });
              // Force teardown of the LiveKit room by clearing the token.
              setToken(null);
            }
            return next;
          });
        })
      .subscribe();
    return () => { mounted = false; supabase.removeChannel(ch); };
  }, [battleId]);

  // Real-time confirmations for mute/kick actions (target + host see it).
  useEffect(() => {
    if (!battleId || !user?.id) return;
    const ch = supabase
      .channel(`live_battle_mod:${battleId}`)
      .on("postgres_changes", {
        event: "INSERT", schema: "public", table: "live_battle_participants",
        filter: `battle_id=eq.${battleId}`,
      }, (payload) => {
        const row = payload.new as { action: string; target_user_id: string; actor_id: string };
        const isMe = row.target_user_id === user.id;
        const isActor = row.actor_id === user.id;
        if (isMe) {
          if (row.action === "kick") {
            toast({ title: "You were removed from the battle", description: "A host or moderator removed you. You can still watch from the results screen when it ends.", variant: "destructive" });
            nav("/battles/live");
          } else if (row.action === "mute") {
            toast({ title: "You've been muted", description: "A host or moderator muted your microphone." });
          } else if (row.action === "unmute") {
            toast({ title: "You've been unmuted", description: "You can speak again." });
          }
        } else if (isActor) {
          // Host/mod already sees a toast from the button handler; skip duplicate.
        }
      })
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [battleId, user?.id, nav]);

  // Track this viewer's own report + live status updates.
  useEffect(() => {
    if (!battleId || !user?.id) return;
    let mounted = true;
    (async () => {
      const { data } = await supabase
        .from("live_battle_reports")
        .select("*")
        .eq("battle_id", battleId)
        .eq("reporter_id", user.id)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (mounted && data) setMyReport(data as LiveBattleReportRow);
    })();
    const ch = supabase
      .channel(`live_battle_report_self:${battleId}:${user.id}`)
      .on("postgres_changes", {
        event: "*", schema: "public", table: "live_battle_reports",
        filter: `battle_id=eq.${battleId}`,
      }, (payload) => {
        const row = (payload.new ?? payload.old) as LiveBattleReportRow | undefined;
        if (!row || row.reporter_id !== user.id) return;
        if (payload.eventType === "DELETE") { setMyReport(null); return; }
        setMyReport((prev) => {
          const next = payload.new as LiveBattleReportRow;
          if (prev && prev.status !== next.status && next.status === "handled") {
            toast({ title: "Your report was handled", description: "Thanks — our team reviewed it." });
          } else if (prev && prev.status !== next.status && next.status === "rejected") {
            toast({ title: "Report reviewed", description: "Our team looked at your report and closed it without action." });
          }
          return next;
        });
      })
      .subscribe();
    return () => { mounted = false; supabase.removeChannel(ch); };
  }, [battleId, user?.id]);

  // Mint token once the battle is loaded.
  useEffect(() => {
    if (!battle || !user) return;
    if (battle.status === "ended") return;
    setJoinStep("minting");
    (async () => {
      try {
        const t = await mintLiveBattleToken(battle.id);
        setToken(t.token);
        setLkUrl(t.url);
        setJoinStep("connecting");
      } catch (e) {
        setErr(liveBattleErrorMessage(e, "Couldn't join the battle. Please try again."));
        setJoinStep("error");
      }
    })();
  }, [battle?.id, battle?.status, user?.id]);

  const isHost = user?.id === battle?.host_id;
  const isOpponent = user?.id === battle?.opponent_id;
  const isParticipant = isHost || isOpponent;
  const canModerate = isAdmin || isModerator;
  const canForceEnd = canModerate && battle?.status !== "ended";

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
    setModBusy(true);
    try { await roomControl(battle.id, "end"); toast({ title: "Battle ended" }); }
    catch (e) { toast({ title: liveBattleErrorMessage(e, "Couldn't end battle."), variant: "destructive" }); }
    finally { setModBusy(false); }
  };

  const handleForceEnd = async () => {
    if (!battle) return;
    if (!window.confirm("Force-end this battle now? This finalizes the winner and can't be undone.")) return;
    setModBusy(true);
    try {
      await roomControl(battle.id, "force_end");
      toast({ title: "Battle force-ended", description: "Results finalized." });
    } catch (e) {
      toast({ title: liveBattleErrorMessage(e, "Couldn't force-end battle."), variant: "destructive" });
    } finally { setModBusy(false); }
  };

  const handleReportSubmit = async () => {
    if (!battle) return;
    const reason = reportReason.trim();
    setReportError(null);
    if (reason.length < 5) {
      setReportError("Please add a short reason (at least a few words).");
      return;
    }
    setReportBusy(true);
    try {
      const row = await reportLiveBattle(battle.id, reason);
      setMyReport(row);
      setReportCooldown(null);
      toast({
        title: "Report submitted",
        description: "Queued for review. You'll see status updates here.",
      });
      setReportOpen(false);
      setReportReason("");
    } catch (e) {
      const cd = reportCooldownSeconds(e);
      if (cd) {
        setReportCooldown({ kind: cd.kind, until: Date.now() + cd.seconds * 1000 });
      }
      const msg = liveBattleErrorMessage(e, "Couldn't submit report. Please try again in a moment.");
      setReportError(msg);
      if (cd?.kind === "duplicate") toast({ title: "Already reported", description: msg });
      if (cd?.kind === "rate_limited") toast({ title: "Report limit reached", description: msg });
    } finally { setReportBusy(false); }
  };

  // Ticking countdown for the cooldown banner. Clears itself when it hits 0.
  const cooldownRemaining = useCooldownRemaining(reportCooldown?.until ?? null);
  useEffect(() => {
    if (reportCooldown && cooldownRemaining === 0) setReportCooldown(null);
  }, [cooldownRemaining, reportCooldown]);

  const reportStatusLabel = (s: LiveBattleReportRow["status"]): string =>
    s === "queued" ? "Queued for review"
    : s === "processing" ? "Being reviewed"
    : s === "handled" ? "Handled by our team"
    : "Closed — no action taken";

  if (allowed === false && !err) return <Gate msg="Live battles aren't available yet." onBack={() => nav("/battles")} />;
  if (err) return <Gate msg={err} onBack={() => nav("/battles")} />;
  if (!battle || allowed === null) return <FullScreenLoading step="verifying" />;

  const total = battle.host_votes + battle.opponent_votes;
  const hostPct = total ? Math.round((battle.host_votes / total) * 100) : 50;
  const oppPct = 100 - hostPct;
  const leader: "host" | "opponent" | "tie" =
    battle.host_votes === battle.opponent_votes ? "tie"
    : battle.host_votes > battle.opponent_votes ? "host" : "opponent";

  // Results screen after end.
  if (battle.status === "ended") {
    return <ResultsScreen battle={battle} onBack={() => nav("/battles/live")} />;
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
            onConnected={() => setJoinStep("connected")}
            onDisconnected={() => { setToken(null); setJoinStep("idle"); }}
            onError={(e) => {
              setErr(liveBattleErrorMessage(e, "Lost connection to the stage. Please try again."));
              setJoinStep("error");
            }}
          >
            <StageGrid />
            <RoomAudioRenderer />
            {isParticipant && <ControlBar variation="minimal" controls={{ microphone: true, camera: true, screenShare: false, leave: false }} />}
            {(isHost || canModerate) && showModPanel && (
              <ModeratorPanel
                battle={battle}
                canModerate={canModerate}
                selfId={user?.id ?? ""}
                busy={modBusy}
                onClose={() => setShowModPanel(false)}
                onAction={async (action, targetUserId) => {
                  setModBusy(true);
                  try {
                    await roomControl(battle.id, action, targetUserId);
                    toast({
                      title:
                        action === "mute" ? "Participant muted" :
                        action === "unmute" ? "Participant unmuted" :
                        action === "kick" ? "Participant removed" : "Done",
                    });
                  } catch (e) {
                    toast({ title: liveBattleErrorMessage(e, "Couldn't complete that action."), variant: "destructive" });
                  } finally { setModBusy(false); }
                }}
              />
            )}
          </LiveKitRoom>
        ) : (
          <FullScreenLoading step={joinStep === "idle" ? "verifying" : joinStep} />
        )}
      </div>

      {/* Moderation activity log — visible to host + admins/mods and to the currently viewing user (self events). */}
      <LiveBattleActivityLog battleId={battle.id} selfId={user?.id ?? null} />

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
          <div className="bg-primary transition-all duration-500 ease-out" style={{ width: `${hostPct}%` }} />
          <div className="bg-accent transition-all duration-500 ease-out" style={{ width: `${oppPct}%` }} />
        </div>

        {battle.status === "live" && !isParticipant && (
          <div className="mt-3 grid grid-cols-2 gap-2">
            <Button disabled={voting || voted !== null} onClick={() => handleVote("host")} variant={voted === "host" ? "default" : "outline"}>Vote Host</Button>
            <Button disabled={voting || voted !== null} onClick={() => handleVote("opponent")} variant={voted === "opponent" ? "default" : "outline"}>Vote Opponent</Button>
          </div>
        )}

        <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap gap-2">
            {isHost && battle.status === "live" && (
              <Button size="sm" variant="destructive" disabled={modBusy} onClick={handleEnd}>
                <ShieldAlert className="w-4 h-4 mr-1" />End battle
              </Button>
            )}
            {(isHost || canModerate) && (
              <Button size="sm" variant="outline" onClick={() => setShowModPanel((v) => !v)}>
                <Users className="w-4 h-4 mr-1" />{showModPanel ? "Hide" : "Manage"} viewers
              </Button>
            )}
            {canForceEnd && (
              <Button size="sm" variant="secondary" disabled={modBusy} onClick={handleForceEnd}>
                <Gavel className="w-4 h-4 mr-1" />Admin force-end
              </Button>
            )}
          </div>
          {!isParticipant && (
            <div className="flex flex-col items-end gap-1">
              <Button
                size="sm"
                variant="ghost"
                onClick={() => { setReportError(null); setReportOpen(true); }}
                disabled={!!myReport && myReport.status !== "rejected"}
                title={myReport ? "You already reported this battle" : "Report this battle"}
              >
                <Flag className="w-4 h-4 mr-1" />
                {myReport && myReport.status !== "rejected" ? "Reported" : "Report"}
              </Button>
              {myReport && (
                <span className="text-[10px] text-muted-foreground">
                  {reportStatusLabel(myReport.status)}
                </span>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Report dialog */}
      <Dialog open={reportOpen} onOpenChange={(v) => { if (!reportBusy) { setReportOpen(v); if (!v) setReportError(null); } }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Report this live battle</DialogTitle>
            <DialogDescription>
              Tell us what's wrong. Reports are reviewed by our moderation team.
              You can only submit one report per battle every 10 minutes.
            </DialogDescription>
          </DialogHeader>
          <Textarea
            value={reportReason}
            onChange={(e) => { setReportReason(e.target.value.slice(0, 500)); if (reportError) setReportError(null); }}
            placeholder="Describe the issue (harassment, nudity, hate speech, etc.)"
            rows={4}
            disabled={reportBusy}
          />
          <div className="flex items-center justify-between text-[11px] text-muted-foreground">
            <span>{reportError && <span className="text-destructive" role="alert">{reportError}</span>}</span>
            <span>{reportReason.length}/500</span>
          </div>
          {reportCooldown && cooldownRemaining > 0 && (
            <div className="rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs" role="status" aria-live="polite">
              <div className="font-semibold text-amber-400 mb-0.5">
                {reportCooldown.kind === "duplicate" ? "Cooldown active" : "Report limit reached"}
              </div>
              <div className="text-muted-foreground">
                You can send another report in{" "}
                <span className="tabular-nums font-mono text-foreground">{formatCooldown(cooldownRemaining)}</span>.
              </div>
            </div>
          )}
          {myReport && (
            <div className="rounded-md border border-border/60 bg-muted/40 px-3 py-2 text-xs">
              <div className="font-semibold mb-0.5">Your last report</div>
              <div className="text-muted-foreground">
                Status: {reportStatusLabel(myReport.status)}
                {myReport.handled_at && myReport.status === "handled" && (
                  <> · handled {new Date(myReport.handled_at).toLocaleString()}</>
                )}
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setReportOpen(false)} disabled={reportBusy}>Cancel</Button>
            <Button
              onClick={handleReportSubmit}
              disabled={reportBusy || (reportCooldown !== null && cooldownRemaining > 0)}
            >
              {reportBusy && <Loader2 className="w-4 h-4 mr-1 animate-spin" />}
              {reportCooldown && cooldownRemaining > 0
                ? `Try again in ${formatCooldown(cooldownRemaining)}`
                : reportError ? "Try again" : "Submit report"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ------------------------- Moderator panel (in-room) -------------------------

function ModeratorPanel({
  battle, canModerate, selfId, busy, onClose, onAction,
}: {
  battle: LiveBattleRow;
  canModerate: boolean;
  selfId: string;
  busy: boolean;
  onClose: () => void;
  onAction: (action: "mute" | "unmute" | "kick", targetUserId: string) => Promise<void>;
}) {
  const participants = useParticipants();
  // Exclude self and the two battle participants from mute/kick targets when
  // the actor is only the host (admins can moderate anyone; hosts should not
  // kick their opponent). Direct signaling in the label if it's a participant.
  const visible = participants.filter((p) => p.identity && p.identity !== selfId);

  return (
    <div className="absolute top-2 right-2 z-10 w-72 max-h-[70%] overflow-y-auto rounded-xl border border-border/60 bg-card/95 backdrop-blur p-3 shadow-lg">
      <div className="flex items-center justify-between mb-2">
        <div className="text-sm font-semibold flex items-center gap-1">
          <Users className="w-4 h-4" /> Viewers ({visible.length})
        </div>
        <button onClick={onClose} className="text-xs text-muted-foreground hover:text-foreground">Close</button>
      </div>
      {visible.length === 0 ? (
        <div className="text-xs text-muted-foreground py-3 text-center">No other participants yet.</div>
      ) : (
        <ul className="space-y-1.5">
          {visible.map((p) => {
            const isParticipantOfBattle = p.identity === battle.host_id || p.identity === battle.opponent_id;
            const canKick = canModerate || !isParticipantOfBattle;
            return (
              <li key={p.sid} className="flex items-center justify-between gap-2 rounded-md border border-border/40 px-2 py-1.5">
                <div className="min-w-0">
                  <div className="text-xs font-medium truncate">
                    {p.name || p.identity.slice(0, 8)}
                    {isParticipantOfBattle && <span className="ml-1 text-[10px] text-primary">(on stage)</span>}
                  </div>
                </div>
                <div className="flex items-center gap-1">
                  <Button size="icon" variant="ghost" disabled={busy} onClick={() => onAction("mute", p.identity)} title="Mute">
                    <MicOff className="w-3.5 h-3.5" />
                  </Button>
                  <Button size="icon" variant="ghost" disabled={busy} onClick={() => onAction("unmute", p.identity)} title="Unmute">
                    <Mic className="w-3.5 h-3.5" />
                  </Button>
                  <Button size="icon" variant="ghost" disabled={busy || !canKick} onClick={() => onAction("kick", p.identity)} title="Remove">
                    <UserX className="w-3.5 h-3.5 text-destructive" />
                  </Button>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

// ------------------------- Results screen -------------------------

function ResultsScreen({ battle, onBack }: { battle: LiveBattleRow; onBack: () => void }) {
  const total = battle.host_votes + battle.opponent_votes;
  const hostPct = total ? Math.round((battle.host_votes / total) * 100) : 50;
  const oppPct = 100 - hostPct;
  const winner: "host" | "opponent" | "tie" =
    !battle.winner_id ? "tie" : battle.winner_id === battle.host_id ? "host" : "opponent";

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
            Ended: {battle.ended_reason.replace(/_/g, " ")}
          </p>
        )}
        <div className="mt-6 grid gap-2">
          {/* Branded share card handles both native-share and download-as-PNG. */}
          <LiveBattleShareCard battle={battle} winner={winner} />
          <Button variant="outline" onClick={onBack} className="w-full">Back to live battles</Button>
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
    return Math.max(0, Math.floor((Date.parse(endsAt) - Date.now()) / 1000));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [endsAt, tick]);
}

function useCooldownRemaining(untilTs: number | null): number {
  const [tick, setTick] = useState(0);
  useEffect(() => {
    if (untilTs === null) return;
    const t = setInterval(() => setTick((n) => n + 1), 1000);
    return () => clearInterval(t);
  }, [untilTs]);
  return useMemo(() => {
    if (untilTs === null) return 0;
    return Math.max(0, Math.ceil((untilTs - Date.now()) / 1000));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [untilTs, tick]);
}

function formatSec(s: number) {
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m}:${r.toString().padStart(2, "0")}`;
}

const JOIN_LABELS: Record<JoinStep, string> = {
  idle: "Preparing…",
  verifying: "Checking availability…",
  minting: "Getting a room pass…",
  connecting: "Connecting to the stage…",
  connected: "Connected",
  error: "Couldn't connect",
};

function FullScreenLoading({ step }: { step: JoinStep }) {
  return (
    <div className="flex-1 min-h-[60vh] flex flex-col items-center justify-center gap-3 text-muted-foreground">
      <Loader2 className="animate-spin w-7 h-7" />
      <div className="text-sm">{JOIN_LABELS[step]}</div>
    </div>
  );
}

function Gate({ msg, onBack }: { msg: string; onBack: () => void }) {
  return (
    <div className="min-h-[100dvh] flex flex-col items-center justify-center gap-4 p-6 text-center">
      <div className="text-lg">{msg}</div>
      <Button onClick={onBack} variant="outline">Back</Button>
    </div>
  );
}
