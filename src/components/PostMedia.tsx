import { useEffect, useRef, useState } from "react";
import { cssFor, FILTER_BY_ID, FilterId } from "@/lib/filters";
import FilterOverlay from "./FilterOverlay";
import { Skeleton } from "@/components/ui/skeleton";
import type { VoteType } from "@/lib/votes";

interface Props {
  src: string;
  alt: string;
  mediaType?: "image" | "video";
  filter?: FilterId | null;
  poster?: string | null;
  onClick?: () => void;
  className?: string;
  /**
   * When true, the video autoplays muted+looped (Reels-style). Required for
   * reliable inline playback on iOS Safari and Android Chrome where tap-to-play
   * in modals/dialogs is unreliable. Ignored for images.
   */
  autoPlay?: boolean;
  /**
   * When true, briefly intensifies the filter (saturation + contrast + brightness pop)
   * — used for the premium vote feedback animation.
   */
  boost?: boolean;
  /**
   * Which vote type triggered the boost. Each type intensifies the filter and the
   * burst overlay differently:
   *  - crown   → warm gold burst, balanced saturation + brightness
   *  - fire    → red/orange burst, strong contrast + warmth
   *  - diamond → cyan burst, cool brightness + saturation
   * Defaults to "crown" when omitted.
   */
  boostType?: VoteType;
}

/**
 * Per-vote-type intensify presets. Tuned so each vote feels distinct but never
 * blows out highlights or breaks the underlying filter.
 */
const BOOST_FILTER: Record<VoteType, string> = {
  crown:   "saturate(1.45) contrast(1.15) brightness(1.10)",
  fire:    "saturate(1.55) contrast(1.30) brightness(1.05) hue-rotate(-6deg)",
  diamond: "saturate(1.35) contrast(1.10) brightness(1.18) hue-rotate(8deg)",
  dislike: "none",
};

const BOOST_BURST: Record<VoteType, string> = {
  crown:   "radial-gradient(circle at 50% 50%, hsl(var(--primary) / 0.55), transparent 70%)",
  fire:    "radial-gradient(circle at 50% 50%, hsl(20 95% 60% / 0.65), hsl(0 90% 55% / 0.25) 45%, transparent 75%)",
  diamond: "radial-gradient(circle at 50% 50%, hsl(190 95% 65% / 0.55), hsl(220 90% 60% / 0.25) 45%, transparent 75%)",
  dislike: "none",
};

const BOOST_LABEL: Record<VoteType, string> = {
  crown:   "Crown vote — filter intensifying",
  fire:    "Fire vote — filter heating up",
  diamond: "Diamond vote — filter sparkling",
  dislike: "",
};

/**
 * Unified media renderer for posts. Applies the saved filter at display time.
 * Original file is unchanged on storage — filter is metadata-only.
 */
export default function PostMedia({
  src, alt, mediaType = "image", filter, poster, onClick, className, autoPlay, boost, boostType = "crown",
}: Props) {
  const baseCss = cssFor(filter);
  const intensify = BOOST_FILTER[boostType];
  // Layer an extra "intensify" pulse on top of the filter when boosting.
  const style: React.CSSProperties = {
    filter: boost
      ? `${baseCss === "none" ? "" : baseCss} ${intensify}`.trim()
      : baseCss,
    transition: "filter 220ms ease-out",
    opacity: 1,
  };

  // Lazy + skeleton: only render the heavy <img>/<video> once it's near the
  // viewport (IntersectionObserver), and show a Skeleton until the asset loads.
  const containerRef = useRef<HTMLDivElement>(null);
  const [inView, setInView] = useState(false);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    if (typeof IntersectionObserver === "undefined") { setInView(true); return; }
    const io = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            setInView(true);
            io.disconnect();
            break;
          }
        }
      },
      { rootMargin: "300px 0px", threshold: 0.01 },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  // Reset loaded state when source changes
  useEffect(() => { setLoaded(false); }, [src]);

  return (
    <div
      ref={containerRef}
      className={`relative w-full h-full flex items-center justify-center ${inView ? "is-visible" : ""} ${boost ? "animate-[filter-pop_650ms_ease-out]" : ""}`}
      onClick={onClick}
    >
      {!loaded && (
        <Skeleton className="absolute inset-0 w-full h-full rounded-none" aria-hidden />
      )}
      {inView && (mediaType === "video" ? (
        <video
          src={src}
          poster={poster ?? undefined}
          controls
          playsInline
          preload="metadata"
          className={className ?? "w-full h-full object-cover"}
          style={{ ...style, opacity: loaded ? 1 : 0, transition: "opacity 220ms ease-out, filter 220ms ease-out" }}
          aria-label={alt}
          onLoadedData={() => setLoaded(true)}
          onError={() => setLoaded(true)}
        />
      ) : (
        <img
          src={src}
          alt={alt}
          loading="lazy"
          decoding="async"
          draggable={false}
          className={className ?? "w-full h-full object-cover"}
          style={{ ...style, opacity: loaded ? 1 : 0, transition: "opacity 220ms ease-out, filter 220ms ease-out" }}
          onLoad={() => setLoaded(true)}
          onError={() => setLoaded(true)}
        />
      ))}
      <FilterOverlay filter={filter} />
      {/* Premium vote burst — color tuned per vote type. */}
      {boost && (
        <>
          <div
            aria-hidden
            className="pointer-events-none absolute inset-0 mix-blend-screen animate-[vote-flash_650ms_ease-out]"
            style={{ background: BOOST_BURST[boostType] }}
          />
          {/* Screen-reader announcement of the premium animation */}
          <span className="sr-only" role="status" aria-live="polite">
            {BOOST_LABEL[boostType]}
          </span>
        </>
      )}
    </div>
  );
}

export { FILTER_BY_ID };
