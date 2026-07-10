// Wave 2 — Ready-state panel for the pre-battle lobby.
// Host and opponent toggle their own ready flag. Host sees the "Go live"
// button gated on both flags being true. Uses server RPCs; realtime
// UPDATEs on live_battles are consumed by the parent lobby page.

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Check, Loader2 } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import {
  LiveBattleRow, setLobbyReady, startBattleFromLobby, lobbyErrorMessage,
} from "@/lib/liveBattles";

interface Props {
  battle: LiveBattleRow;
  currentUserId: string;
  hostName: string;
  opponentName: string;
  onStarted?: (row: LiveBattleRow) => void;
}

export default function LobbyReadyPanel({
  battle, currentUserId, hostName, opponentName, onStarted,
}: Props) {
  const isHost = currentUserId === battle.host_id;
  const isOpponent = currentUserId === battle.opponent_id;
  const myReady = isHost ? !!battle.host_ready : isOpponent ? !!battle.opponent_ready : false;
  const bothReady = !!battle.host_ready && !!battle.opponent_ready;

  const [toggling, setToggling] = useState(false);
  const [starting, setStarting] = useState(false);

  async function handleToggle() {
    if (!isHost && !isOpponent) return;
    setToggling(true);
    try {
      await setLobbyReady(battle.id, !myReady);
    } catch (e) {
      toast({ title: lobbyErrorMessage(e), variant: "destructive" });
    } finally {
      setToggling(false);
    }
  }

  async function handleStart() {
    if (!isHost || !bothReady) return;
    setStarting(true);
    try {
      const row = await startBattleFromLobby(battle.id);
      onStarted?.(row);
    } catch (e) {
      toast({ title: lobbyErrorMessage(e), variant: "destructive" });
    } finally {
      setStarting(false);
    }
  }

  return (
    <div className="rounded-2xl border border-border bg-card p-4 space-y-4">
      <h2 className="font-display text-lg">Ready check</h2>

      <ul className="space-y-2" aria-label="Battler ready state">
        <ReadyRow name={hostName} label="Host" ready={!!battle.host_ready} />
        <ReadyRow name={opponentName} label="Opponent" ready={!!battle.opponent_ready} />
      </ul>

      <div
        className="text-sm text-muted-foreground"
        role="status"
        aria-live="polite"
        aria-atomic="true"
      >
        {bothReady
          ? "Both battlers are ready. Host can start now."
          : "Waiting for both battlers to mark themselves ready."}
      </div>

      {(isHost || isOpponent) && (
        <div className="flex flex-col sm:flex-row gap-2">
          <Button
            variant={myReady ? "secondary" : "default"}
            onClick={handleToggle}
            disabled={toggling}
            aria-pressed={myReady}
            className="flex-1"
          >
            {toggling ? <Loader2 className="animate-spin" size={16} /> : <Check size={16} />}
            <span>{myReady ? "I'm ready ✓ (tap to undo)" : "I'm ready"}</span>
          </Button>

          {isHost && (
            <Button
              onClick={handleStart}
              disabled={!bothReady || starting}
              className="flex-1"
            >
              {starting ? <Loader2 className="animate-spin" size={16} /> : null}
              <span>Go live</span>
            </Button>
          )}
        </div>
      )}
    </div>
  );
}

function ReadyRow({ name, label, ready }: { name: string; label: string; ready: boolean }) {
  return (
    <li className="flex items-center justify-between rounded-lg bg-muted/40 px-3 py-2">
      <div>
        <div className="text-sm font-medium">{name}</div>
        <div className="text-xs text-muted-foreground">{label}</div>
      </div>
      <span
        className={
          "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs " +
          (ready
            ? "bg-emerald-500/15 text-emerald-500"
            : "bg-amber-500/15 text-amber-500")
        }
      >
        {ready ? "Ready" : "Not ready"}
      </span>
    </li>
  );
}
