import { useEffect, useRef, useState } from "react";
import { RefreshCw } from "lucide-react";

/**
 * Lightweight pull-to-refresh for mobile/tablet. Renders an indicator when
 * the user swipes down at the top of the page; triggers `location.reload()`
 * once the pull crosses the threshold. Desktop (hover-capable, no coarse
 * pointer) skips this entirely so mouse-wheel scrolling is unaffected.
 */
const THRESHOLD = 72;
const MAX_PULL = 120;

export default function PullToRefresh() {
  const startY = useRef<number | null>(null);
  const [pull, setPull] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const enabled = useRef(true);

  useEffect(() => {
    // Only enable on coarse pointers (touch phones/tablets).
    enabled.current =
      typeof window !== "undefined" &&
      window.matchMedia?.("(pointer: coarse)").matches;
  }, []);

  useEffect(() => {
    if (!enabled.current) return;

    const onStart = (e: TouchEvent) => {
      if (window.scrollY > 0 || refreshing) { startY.current = null; return; }
      startY.current = e.touches[0].clientY;
    };
    const onMove = (e: TouchEvent) => {
      if (startY.current == null || refreshing) return;
      const dy = e.touches[0].clientY - startY.current;
      if (dy <= 0) { setPull(0); return; }
      // Rubber-band the pull distance.
      const eased = Math.min(MAX_PULL, dy * 0.5);
      setPull(eased);
    };
    const onEnd = () => {
      if (startY.current == null) return;
      startY.current = null;
      if (pull >= THRESHOLD && !refreshing) {
        setRefreshing(true);
        setPull(THRESHOLD);
        // Small delay so the user sees the spinner engage before reload.
        setTimeout(() => window.location.reload(), 250);
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
  }, [pull, refreshing]);

  if (!enabled.current || pull <= 0) return null;

  const progress = Math.min(1, pull / THRESHOLD);
  const rotation = progress * 360;

  return (
    <div
      aria-hidden
      className="fixed left-1/2 -translate-x-1/2 z-[60] pointer-events-none top-0"
      style={{
        transform: `translate(-50%, ${pull - 40}px)`,
        transition: refreshing ? "transform 150ms ease-out" : "none",
      }}
    >
      <div className="h-10 w-10 rounded-full bg-background/95 border border-border shadow-lg flex items-center justify-center">
        <RefreshCw
          size={18}
          className={refreshing ? "animate-spin text-primary" : "text-primary"}
          style={refreshing ? undefined : { transform: `rotate(${rotation}deg)` }}
        />
      </div>
    </div>
  );
}
