// Wave 3 — Picture-in-Picture button + fallback floating card.
// - Uses HTMLVideoElement.requestPictureInPicture() when supported.
// - Otherwise, opens a small floating card that stays fixed on top-right,
//   showing a live text badge and a "Return to battle" button. This is the
//   non-video fallback for Safari/PWAs where PiP isn't exposed.

import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { PictureInPicture2, X } from "lucide-react";

interface Props {
  /** Called by the fallback card's "Return" action, so parent can scroll/focus. */
  onReturn?: () => void;
  /** Label to show inside the fallback card (e.g. "LIVE · 320 watching"). */
  fallbackLabel: string;
}

function findLiveKitVideo(): HTMLVideoElement | null {
  // LiveKit React renders remote/local video tags inside .lk-participant-tile.
  const candidates = document.querySelectorAll<HTMLVideoElement>(
    ".lk-participant-tile video, video[data-lk-source]",
  );
  for (const v of candidates) {
    if (v.readyState >= 2 && v.videoWidth > 0) return v;
  }
  return candidates[0] ?? null;
}

export default function LiveBattlePiPButton({ onReturn, fallbackLabel }: Props) {
  const [supported, setSupported] = useState(false);
  const [fallbackOpen, setFallbackOpen] = useState(false);
  const [pipActive, setPipActive] = useState(false);
  const activeVideoRef = useRef<HTMLVideoElement | null>(null);

  useEffect(() => {
    const s =
      typeof document !== "undefined" &&
      "pictureInPictureEnabled" in document &&
      (document as Document & { pictureInPictureEnabled?: boolean }).pictureInPictureEnabled === true;
    setSupported(!!s);
  }, []);

  useEffect(() => {
    const onLeave = () => setPipActive(false);
    document.addEventListener("leavepictureinpicture", onLeave);
    return () => document.removeEventListener("leavepictureinpicture", onLeave);
  }, []);

  const openNative = async () => {
    const v = findLiveKitVideo();
    if (!v) return;
    try {
      activeVideoRef.current = v;
      await v.requestPictureInPicture();
      setPipActive(true);
    } catch {
      // Browser refused — fall back to floating card.
      setFallbackOpen(true);
    }
  };

  const closeNative = async () => {
    try {
      if (document.pictureInPictureElement) await document.exitPictureInPicture();
    } catch { /* ignore */ }
    setPipActive(false);
  };

  const handleClick = () => {
    if (supported) {
      if (pipActive) void closeNative();
      else void openNative();
    } else {
      setFallbackOpen((v) => !v);
    }
  };

  return (
    <>
      <Button
        size="sm"
        variant="ghost"
        onClick={handleClick}
        aria-label={pipActive || fallbackOpen ? "Close Picture-in-Picture" : "Open Picture-in-Picture"}
        aria-pressed={pipActive || fallbackOpen}
        title={supported ? "Picture-in-Picture" : "Floating mini view"}
        data-testid="pip-toggle"
      >
        <PictureInPicture2 className="w-4 h-4" />
      </Button>

      {!supported && fallbackOpen && (
        <div
          className="fixed z-50 top-3 right-3 w-56 rounded-xl border border-border bg-card/95 backdrop-blur shadow-xl p-3"
          role="dialog"
          aria-label="Battle mini view"
          data-testid="pip-fallback-card"
        >
          <div className="flex items-start justify-between gap-2">
            <div className="text-xs font-semibold flex items-center gap-1.5">
              <span className="inline-block w-2 h-2 rounded-full bg-red-500 animate-pulse" />
              {fallbackLabel}
            </div>
            <button
              type="button"
              onClick={() => setFallbackOpen(false)}
              aria-label="Close mini view"
              className="text-muted-foreground hover:text-foreground"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
          <p className="mt-1.5 text-[11px] text-muted-foreground">
            Your browser doesn't support in-app Picture-in-Picture yet.
          </p>
          <Button
            size="sm"
            className="mt-2 w-full"
            onClick={() => { setFallbackOpen(false); onReturn?.(); }}
          >
            Return to battle
          </Button>
        </div>
      )}
    </>
  );
}
