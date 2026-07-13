import { getFrameUrl, getFrameRenderConfig } from "@/lib/frames";

interface Props {
  photoUrl?: string | null;
  /** Fallback frame artwork (legacy founder styling) when no key is equipped. */
  founderFallbackUrl?: string | null;
  frameKey?: string | null;
  alt?: string;
  glow?: boolean;
  /** Full framed-avatar diameter (outer wrapper) in px. */
  size?: number;
  className?: string;
  positionY?: number | null;
}

/**
 * Framed avatar renderer.
 *
 * Layout structure (all layers absolutely positioned inside a relative wrapper
 * with overflow visible):
 *   1. Glow      — behind everything, ~118% of wrapper, overflows outward.
 *   2. Avatar    — clipped circle, ~72% of wrapper, centered inside the frame's
 *                  inner opening. NOT the same clipped container as the frame.
 *   3. Frame art — 100% of wrapper, absolute overlay, pointer-events: none.
 *
 * `size` is the total framed avatar diameter, so the photo never appears
 * shrunken relative to a bare avatar of the same visual footprint.
 */
export default function AvatarFrame({
  photoUrl,
  founderFallbackUrl,
  frameKey,
  alt = "",
  glow = true,
  size = 96,
  className = "",
  positionY = 50,
}: Props) {
  const frameUrl =
    (frameKey ? getFrameUrl(frameKey) : null) ||
    founderFallbackUrl ||
    null;

  // Bare avatar — no frame, no glow.
  if (!frameUrl) {
    return (
      <div
        className={`rounded-full overflow-hidden bg-muted ring-2 ring-border ${className}`}
        style={{ width: size, height: size }}
      >
        {photoUrl && (
          <img
            src={photoUrl}
            alt={alt}
            className="w-full h-full object-cover"
            style={{ objectPosition: `center ${positionY ?? 50}%` }}
          />
        )}
      </div>
    );
  }

  const { avatarPct, glowPct } = getFrameRenderConfig(frameKey);
  const avatarInsetPct = (100 - avatarPct) / 2;
  const glowInsetPct = (100 - glowPct) / 2;

  return (
    <div
      className={`relative isolate ${className}`}
      style={{ width: size, height: size, overflow: "visible" }}
    >
      {/* Glow — largest layer, sits behind avatar + frame */}
      {glow && (
        <div
          aria-hidden="true"
          className="avatar-frame-glow-layer absolute rounded-full pointer-events-none"
          style={{
            top: `${glowInsetPct}%`,
            left: `${glowInsetPct}%`,
            width: `${glowPct}%`,
            height: `${glowPct}%`,
            zIndex: 0,
          }}
        />
      )}

      {/* Avatar photo — clipped circle inside the frame's inner opening */}
      <div
        className="absolute rounded-full overflow-hidden bg-muted"
        style={{
          top: `${avatarInsetPct}%`,
          left: `${avatarInsetPct}%`,
          width: `${avatarPct}%`,
          height: `${avatarPct}%`,
          zIndex: 1,
        }}
      >
        {photoUrl && (
          <img
            src={photoUrl}
            alt={alt}
            className="w-full h-full object-cover"
            style={{ objectPosition: `center ${positionY ?? 50}%` }}
          />
        )}
      </div>

      {/* Frame decoration — full wrapper size, overlaid on top */}
      <img
        src={frameUrl}
        alt=""
        loading="lazy"
        aria-hidden="true"
        className="absolute inset-0 w-full h-full object-contain pointer-events-none select-none"
        style={{ zIndex: 2 }}
      />
    </div>
  );
}
