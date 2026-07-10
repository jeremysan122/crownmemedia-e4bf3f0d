// Wave 2 — Synchronized go-live countdown.
// Given `goLiveAt` (server timestamp) and a client/server offset, ticks
// down 3-2-1 and announces each step through a polite aria-live region.
// Announces "Live!" once when the target passes.

import { useEffect, useState } from "react";

interface Props {
  /** ISO string of the server-anchored go-live moment. */
  goLiveAt: string | null;
  /** ms to add to Date.now() to get server time (from useServerTimeOffset). */
  serverOffsetMs?: number;
  /** Fired once when the countdown reaches zero. */
  onLive?: () => void;
}

export default function LobbyCountdown({ goLiveAt, serverOffsetMs = 0, onLive }: Props) {
  const [secondsLeft, setSecondsLeft] = useState<number | null>(null);
  const [announced, setAnnounced] = useState(false);

  useEffect(() => {
    if (!goLiveAt) { setSecondsLeft(null); return; }
    const target = new Date(goLiveAt).getTime();
    let done = false;
    const tick = () => {
      const now = Date.now() + serverOffsetMs;
      const diff = Math.ceil((target - now) / 1000);
      setSecondsLeft(diff);
      if (diff <= 0 && !done) {
        done = true;
        setAnnounced(true);
        onLive?.();
      }
    };
    tick();
    const id = setInterval(tick, 250);
    return () => clearInterval(id);
  }, [goLiveAt, serverOffsetMs, onLive]);

  if (secondsLeft === null) return null;

  const clamped = Math.max(0, secondsLeft);
  const label = clamped > 0 ? `Going live in ${clamped}…` : "Live!";
  const showBig = clamped > 0 && clamped <= 3;

  return (
    <div className="flex flex-col items-center justify-center gap-2">
      {showBig && (
        <div
          aria-hidden
          className="font-display text-6xl font-bold tabular-nums text-primary animate-pulse"
        >
          {clamped}
        </div>
      )}
      <div
        role="status"
        aria-live="polite"
        aria-atomic="true"
        data-testid="lobby-countdown"
        className={showBig ? "sr-only" : "text-sm text-muted-foreground"}
      >
        {announced && clamped === 0 ? "Live now!" : label}
      </div>
    </div>
  );
}
