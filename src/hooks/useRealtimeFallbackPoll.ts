import { useEffect, useRef } from "react";

/**
 * Polling fallback that calls `refetch` on an interval when realtime is NOT live.
 * - When `live` becomes true → stops polling.
 * - When `live` flips false → starts polling at `intervalMs` (default 15s).
 * - Fires `onFallbackEngaged` once per fallback episode for safe diagnostics.
 *
 * Dedup of items (messages/notifications) MUST be handled by the caller via
 * stable IDs in its setState updater — this hook only triggers refetches.
 */
export function useRealtimeFallbackPoll(
  refetch: () => void | Promise<void>,
  live: boolean,
  intervalMs = 15_000,
  onFallbackEngaged?: () => void,
) {
  const refetchRef = useRef(refetch);
  refetchRef.current = refetch;
  const engagedRef = useRef(false);

  useEffect(() => {
    if (live) {
      engagedRef.current = false;
      return;
    }
    if (!engagedRef.current) {
      engagedRef.current = true;
      try { onFallbackEngaged?.(); } catch { /* never throw */ }
    }
    const id = window.setInterval(() => {
      if (document.visibilityState === "hidden") return;
      void refetchRef.current();
    }, intervalMs);
    return () => window.clearInterval(id);
  }, [live, intervalMs, onFallbackEngaged]);
}
