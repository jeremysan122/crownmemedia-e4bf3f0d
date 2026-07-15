import { useEffect, useRef, useState } from "react";
import { RefreshCw, AlertTriangle } from "lucide-react";

/**
 * Pull-to-refresh for mobile/tablet with clear loading feedback and a
 * retry surface when the reload doesn't complete quickly. Desktop
 * (fine pointers, no touch) skips this so mouse-wheel scrolling stays
 * untouched.
 *
 * Loading feedback surfaces:
 *   - a spinner + "Pull to refresh" hint while the user is dragging
 *   - a "Refreshing…" chip while the reload is in-flight
 *   - a retry chip if the reload doesn't finish within a safety window
 *     (offline, slow network, etc.) so the user is never stuck.
 */
const THRESHOLD = 72;
const MAX_PULL = 120;
const RELOAD_TIMEOUT_MS = 8_000;

export default function PullToRefresh() {
  const startY = useRef<number | null>(null);
  const [pull, setPull] = useState(0);
  const [status, setStatus] = useState<"idle" | "refreshing" | "failed">("idle");
  const enabled = useRef(true);

  useEffect(() => {
    enabled.current =
      typeof window !== "undefined" &&
      window.matchMedia?.("(pointer: coarse)").matches;
  }, []);

  useEffect(() => {
    if (!enabled.current) return;

    const onStart = (e: TouchEvent) => {
      if (window.scrollY > 0 || status === "refreshing") { startY.current = null; return; }
      startY.current = e.touches[0].clientY;
    };
    const onMove = (e: TouchEvent) => {
      if (startY.current == null || status === "refreshing") return;
      const dy = e.touches[0].clientY - startY.current;
      if (dy <= 0) { setPull(0); return; }
      setPull(Math.min(MAX_PULL, dy * 0.5));
    };
    const onEnd = () => {
      if (startY.current == null) return;
      startY.current = null;
      if (pull >= THRESHOLD && status !== "refreshing") {
        triggerRefresh();
      } else {
        setPull(0);
      }
    };

    window.addEventListener("touchstart", onStart, { passive: true });
    window.addEventListener("touchmove", onMove, { passive: true });
    window.addEventListener("touchend", onEnd);
    window.addEventListener("touchcancel", onEnd);
    return () => {
      window.removeEventListener("touchstart", onStart);
      window.removeEventListener("touchmove", onMove);
      window.removeEventListener("touchend", onEnd);
      window.removeEventListener("touchcancel", onEnd);
    };
  }, [pull, status]);

  const triggerRefresh = () => {
    setStatus("refreshing");
    setPull(THRESHOLD);
    // Kick off the reload. If the browser hasn't navigated in a reasonable
    // window (offline, cold cache, service worker stalled), surface a retry
    // instead of leaving the spinner forever.
    const safety = window.setTimeout(() => setStatus("failed"), RELOAD_TIMEOUT_MS);
    try {
      window.location.reload();
    } catch {
      window.clearTimeout(safety);
      setStatus("failed");
    }
  };

  if (!enabled.current) return null;
  if (pull <= 0 && status === "idle") return null;

  const armed = pull >= THRESHOLD;
  const progress = Math.min(1, pull / THRESHOLD);
  const rotation = progress * 360;

  return (
    <div
      role="status"
      aria-live="polite"
      className="fixed left-1/2 -translate-x-1/2 z-[60] top-0"
      style={{
        transform: `translate(-50%, ${Math.max(pull, status === "refreshing" ? THRESHOLD : status === "failed" ? THRESHOLD : pull) - 40}px)`,
        transition: status === "idle" ? "none" : "transform 180ms ease-out",
        pointerEvents: status === "failed" ? "auto" : "none",
      }}
    >
      {status === "failed" ? (
        <button
          type="button"
          onClick={() => triggerRefresh()}
          className="h-10 px-4 rounded-full bg-background/95 border border-border shadow-lg flex items-center gap-2 text-xs font-medium"
        >
          <AlertTriangle size={14} className="text-destructive" />
          Refresh failed — retry
        </button>
      ) : (
        <div className="h-10 px-4 rounded-full bg-background/95 border border-border shadow-lg flex items-center gap-2 text-xs font-medium">
          <RefreshCw
            size={16}
            className={status === "refreshing" ? "animate-spin text-primary" : "text-primary"}
            style={status === "refreshing" ? undefined : { transform: `rotate(${rotation}deg)` }}
          />
          <span className="tabular-nums">
            {status === "refreshing"
              ? "Refreshing…"
              : armed
                ? "Release to refresh"
                : "Pull to refresh"}
          </span>
        </div>
      )}
    </div>
  );
}
