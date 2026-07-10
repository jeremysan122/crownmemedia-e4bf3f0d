// Small presentational component for the optimistic vote feedback strip.
// Extracted from LiveBattle so it can be unit-tested in isolation and to
// keep the pending/confirmed/failed rendering rules in one place.

import { useEffect, useState } from "react";

export type VoteChipState = "idle" | "pending" | "confirmed" | "failed";

interface Props {
  /** Which side (if any) has an unreconciled optimistic bump on the wire. */
  pendingChoice: "host" | "opponent" | null;
  /** Epoch ms when the last realtime UPDATE confirmed a vote. */
  voteConfirmedAt: number | null;
  /** Epoch ms when the last vote RPC rejected. */
  voteFailedAt: number | null;
  /** How long the confirmed chip stays visible after the realtime UPDATE. */
  confirmedWindowMs?: number;
  /** How long the failed chip stays visible after the RPC rejects. */
  failedWindowMs?: number;
}

export function computeChipState(
  now: number,
  props: Pick<Props, "pendingChoice" | "voteConfirmedAt" | "voteFailedAt"> & {
    confirmedWindowMs: number; failedWindowMs: number;
  },
): VoteChipState {
  if (props.pendingChoice) return "pending";
  if (props.voteConfirmedAt && now - props.voteConfirmedAt < props.confirmedWindowMs) return "confirmed";
  if (props.voteFailedAt && now - props.voteFailedAt < props.failedWindowMs) return "failed";
  return "idle";
}

export default function LiveBattleVoteChip({
  pendingChoice,
  voteConfirmedAt,
  voteFailedAt,
  confirmedWindowMs = 1400,
  failedWindowMs = 4000,
}: Props) {
  // Force re-render when a timed window elapses so `idle` returns cleanly.
  const [, setTick] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setTick((n) => n + 1), 500);
    return () => clearInterval(t);
  }, []);

  const state = computeChipState(Date.now(), {
    pendingChoice, voteConfirmedAt, voteFailedAt, confirmedWindowMs, failedWindowMs,
  });

  // Persistent SR-only announcement region so pending→confirmed/failed
  // transitions are announced even when the visible chip swaps or unmounts.
  const announcement =
    state === "pending" ? "Counting your vote"
    : state === "confirmed" ? "Vote confirmed"
    : state === "failed" ? "Vote failed. Try again."
    : "";

  const announcer = (
    <span
      data-testid="vote-chip-announcer"
      className="sr-only"
      role="status"
      aria-live={state === "failed" ? "assertive" : "polite"}
      aria-atomic="true"
    >
      {announcement}
    </span>
  );

  if (state === "pending") {
    return (
      <span
        data-testid="vote-pending"
        aria-live="polite"
        aria-busy="true"
        className="inline-flex items-center gap-1.5 rounded-full bg-amber-500/15 text-amber-500 px-2 py-0.5 animate-pulse"
      >
        <span className="inline-block w-1.5 h-1.5 rounded-full bg-amber-500" />
        Counting your vote…
      </span>
    );
  }
  if (state === "confirmed") {
    return (
      <span
        data-testid="vote-confirmed"
        aria-live="polite"
        aria-busy="false"
        className="inline-flex items-center gap-1.5 rounded-full bg-emerald-500/15 text-emerald-500 px-2 py-0.5"
      >
        ✓ Vote confirmed
      </span>
    );
  }
  if (state === "failed") {
    return (
      <span
        data-testid="vote-failed"
        aria-live="assertive"
        aria-busy="false"
        role="alert"
        className="inline-flex items-center gap-1.5 rounded-full bg-red-500/15 text-red-500 px-2 py-0.5"
      >
        Vote didn't stick — try again
      </span>
    );
  }
  return null;
}
