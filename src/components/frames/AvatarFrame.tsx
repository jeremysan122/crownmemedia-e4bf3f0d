import { getFrameUrl, getFrameInsetPct, DEFAULT_FRAME_INSET_PCT } from "@/lib/frames";

interface Props {
  photoUrl?: string | null;
  frameKey?: string | null;
  /** Fallback for legacy founder styling when no achievement frame is equipped. */
  founderFallbackUrl?: string | null;
  /** Calibrated circular aura behind the frame. */
  glow?: boolean;
  size?: number;
  className?: string;
  positionY?: number | null;
  alt?: string;
}

/**
 * Renders a circular avatar wrapped in the given achievement frame. When no
 * frame key is provided (or the key is unknown) the avatar renders bare with
 * an optional legacy founder frame fallback.
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
  // Legacy founder fallback shares the Imperial Glow artwork — reuse its inset
  // so the avatar aligns to the inner circle even when no frame is equipped.
  const insetPct = frameKey
    ? getFrameInsetPct(frameKey)
    : founderFallbackUrl
      ? getFrameInsetPct("imperial-glow")
      : DEFAULT_FRAME_INSET_PCT;

  if (frameUrl) {
    const frameInset = "0px";

    return (
      <div
        className={`avatar-frame-shell ${className}`}
        style={{ width: size, height: size }}
      >
        {glow && <span aria-hidden="true" className="avatar-frame-halo" />}
        <div className="avatar-frame-inner" style={{ inset: frameInset }}>
          <div
            className="avatar-frame-photo"
            style={{ inset: `${insetPct}%` }}
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
          <img
            src={frameUrl}
            alt=""
            loading="lazy"
            className="avatar-frame-art"
          />
        </div>
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
