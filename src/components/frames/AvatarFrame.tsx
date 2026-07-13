import { getFrameRenderConfig, getFrameUrl } from "@/lib/frames";

interface Props {
  photoUrl?: string | null;
  founderFallbackUrl?: string | null;
  frameKey?: string | null;
  alt?: string;
  glow?: boolean;
  /**
   * Diameter of the normal avatar photo and layout footprint (px).
   * The frame and glow visually overflow outside this measurement.
   */
  size?: number;
  className?: string;
  positionY?: number | null;
}

/**
 * Framed avatar.
 *
 * Contract: `size` is ALWAYS the normal avatar photo diameter. A framed avatar
 * and an unframed avatar with the same `size` have the exact same photo width.
 * The decorative frame and glow are absolutely positioned overlays that scale
 * OUTWARD beyond the photo — they never shrink it.
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
    (frameKey ? getFrameUrl(frameKey) : null) || founderFallbackUrl || null;

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

  const { frameScale, glowScale, offsetX, offsetY } = getFrameRenderConfig(frameKey);
  const framePx = size * frameScale;
  const glowPx = size * glowScale;

  return (
    <div
      className={`avatar-frame-shell ${className}`}
      style={{ width: size, height: size }}
    >
      {glow && (
        <div
          aria-hidden="true"
          className="avatar-frame-glow-layer"
          style={{
            width: glowPx,
            height: glowPx,
            marginLeft: `${offsetX}%`,
            marginTop: `${offsetY}%`,
          }}
        />
      )}

      <div className="avatar-frame-photo">
        {photoUrl && (
          <img
            src={photoUrl}
            alt={alt}
            style={{ objectPosition: `center ${positionY ?? 50}%` }}
          />
        )}
      </div>

      <img
        src={frameUrl}
        alt=""
        aria-hidden="true"
        loading="lazy"
        className="avatar-frame-art"
        style={{
          width: framePx,
          height: framePx,
          left: `calc(50% + ${offsetX}%)`,
          top: `calc(50% + ${offsetY}%)`,
        }}
      />
    </div>
  );
}
