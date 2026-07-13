// Deterministic frame artwork renderer with a static → animated → thumbnail
// fallback chain. Each broken source is skipped exactly once via onError so
// there are no infinite reload loops. When every source fails we render the
// "Artwork unavailable" state (data-testid="frame-artwork-unavailable").
import { useMemo, useState } from "react";

export interface FrameArtworkSources {
  static_asset_url?: string | null;
  animated_asset_url?: string | null;
  thumbnail_asset_url?: string | null;
}

interface Props {
  frame: FrameArtworkSources;
  name: string;
  /** Grayscale when locked. */
  locked?: boolean;
  className?: string;
  /** Optional extra classes applied to the <img> element. */
  imgClassName?: string;
  /** Fill container using object-contain so the artwork is NEVER cropped. */
  contain?: boolean;
}

export function buildFrameSources(frame: FrameArtworkSources): string[] {
  // Static → animated → thumbnail. Static PNG is authoritative artwork; the
  // animated variant is a bonus; thumbnail is a last-resort low-res fallback.
  return [frame.static_asset_url, frame.animated_asset_url, frame.thumbnail_asset_url].filter(
    (s): s is string => typeof s === "string" && s.length > 0,
  );
}

export default function FrameArtwork({
  frame,
  name,
  locked = false,
  className = "",
  imgClassName = "",
  contain = true,
}: Props) {
  const sources = useMemo(() => buildFrameSources(frame), [frame]);
  const [srcIdx, setSrcIdx] = useState(0);
  const [broken, setBroken] = useState(false);
  const artwork = sources[srcIdx];

  if (!artwork || broken) {
    return (
      <div
        data-testid="frame-artwork-unavailable"
        className={`w-full h-full rounded-full bg-muted/40 flex items-center justify-center text-muted-foreground text-[10px] uppercase tracking-wider ${className}`}
      >
        Artwork unavailable
      </div>
    );
  }

  return (
    <img
      src={artwork}
      alt={name}
      loading="lazy"
      data-testid="frame-artwork-img"
      data-source-index={srcIdx}
      onError={() => {
        if (srcIdx + 1 < sources.length) setSrcIdx(srcIdx + 1);
        else setBroken(true);
      }}
      className={`w-full h-full ${contain ? "object-contain" : "object-cover"} drop-shadow-[0_0_18px_hsl(var(--gold)/0.45)] ${
        locked ? "grayscale opacity-60" : ""
      } ${imgClassName}`}
      style={{ objectPosition: "center" }}
    />
  );
}
