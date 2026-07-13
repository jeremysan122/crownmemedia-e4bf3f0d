import { getFrameUrl } from "@/lib/frames";

interface Props {
  photoUrl?: string | null;
  frameKey?: string | null;
  /** Fallback for legacy founder styling when no achievement frame is equipped. */
  founderFallbackUrl?: string | null;
  /** Calibrated circular aura behind the frame. */
  glow?: boolean;
  /**
   * Diameter (px) of the avatar photo circle. This is the layout footprint.
   * The decorative frame and glow overflow outside this size so the framed
   * avatar visually renders larger without shrinking the photo.
   */
  size?: number;
  className?: string;
  positionY?: number | null;
  alt?: string;
}

/**
 * Renders a circular avatar with the decorative frame and glow overflowing
 * outside the avatar photo's bounds. `size` sizes the avatar photo (the
 * layout footprint); the frame extends ~35% beyond it and the glow ~50%.
 */
export default function AvatarFrame({
  photoUrl,
  frameKey,
  founderFallbackUrl,
  glow = false,
  size = 112,
  className = "",
  positionY = 50,
  alt = "",
}: Props) {
  const frameUrl = getFrameUrl(frameKey) || founderFallbackUrl || null;

  if (frameUrl) {
    return (
      <div
        className={`avatar-frame-shell ${className}`}
        style={{ width: size, height: size }}
      >
        {glow && <div className="avatar-frame-glow" aria-hidden="true" />}
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
          loading="lazy"
          className={`avatar-frame-art${glow ? " avatar-frame-art--glow" : ""}`}
        />
      </div>
    );
  }

  return (
    <div
      className={`rounded-full overflow-hidden bg-muted ring-2 ring-border ${className}`}
      style={{ width: size, height: size }}
    >
      {photoUrl && (
        <img
          src={photoUrl}
          className="w-full h-full object-cover"
          alt={alt}
          style={{ objectPosition: `center ${positionY ?? 50}%` }}
        />
      )}
    </div>
  );
}
