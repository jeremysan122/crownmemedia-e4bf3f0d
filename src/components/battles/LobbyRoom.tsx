// Wave 2 — Real participants-only LiveKit lobby room.
// - Mints a lobby-scoped token via mintLobbyToken (server rejects non-participants).
// - Connects to `${room_name}__lobby` — separate from the live room so no
//   auto-start side effect fires.
// - Publishes camera + mic for AV pre-check; disconnects on unmount.

import { useEffect, useState } from "react";
import {
  LiveKitRoom, GridLayout, ParticipantTile, RoomAudioRenderer, ControlBar,
  useTracks,
} from "@livekit/components-react";
import { Track } from "livekit-client";
import "@livekit/components-styles";
import { mintLobbyToken, lobbyErrorMessage } from "@/lib/liveBattles";
import { Loader2 } from "lucide-react";

interface Props { battleId: string }

export default function LobbyRoom({ battleId }: Props) {
  const [conn, setConn] = useState<{ token: string; url: string; room: string } | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const c = await mintLobbyToken(battleId);
        if (!cancelled) setConn(c);
      } catch (e) {
        if (!cancelled) setError(lobbyErrorMessage(e));
      }
    })();
    return () => { cancelled = true; };
  }, [battleId]);

  if (error) {
    return (
      <div role="alert" className="rounded-2xl border border-destructive/40 bg-destructive/5 p-4 text-sm text-destructive">
        {error}
      </div>
    );
  }
  if (!conn) {
    return (
      <div className="rounded-2xl border border-border bg-card p-6 flex items-center justify-center">
        <Loader2 className="animate-spin" aria-label="Joining lobby room" />
      </div>
    );
  }

  return (
    <div className="rounded-2xl overflow-hidden border border-border bg-card" data-testid="lobby-room">
      <LiveKitRoom
        token={conn.token}
        serverUrl={conn.url}
        connect
        video
        audio
        data-lk-theme="default"
        className="min-h-[280px]"
      >
        <LobbyTiles />
        <RoomAudioRenderer />
        <ControlBar variation="minimal" controls={{ microphone: true, camera: true, screenShare: false, leave: false }} />
      </LiveKitRoom>
    </div>
  );
}

function LobbyTiles() {
  const tracks = useTracks(
    [
      { source: Track.Source.Camera, withPlaceholder: true },
    ],
    { onlySubscribed: false },
  );
  return (
    <GridLayout tracks={tracks} className="min-h-[240px]">
      <ParticipantTile />
    </GridLayout>
  );
}
