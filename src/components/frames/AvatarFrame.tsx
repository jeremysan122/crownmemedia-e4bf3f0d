import { getFrameUrl, getFrameInsetPct, DEFAULT_FRAME_INSET_PCT } from "@/lib/frames";

interface Props {
  photoUrl?: string | null;
  frameKey?: string | null;
  /** Fallback for legacy founder styling when no achievement frame is equipped. */
  founderFallbackUrl?: string | null;
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
    return (
      <div
        className={`relative ${className}`}
        style={{ width: size, height: size }}
      >
        <div
          className="absolute rounded-full overflow-hidden bg-muted"
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
          className="absolute inset-0 w-full h-full pointer-events-none select-none drop-shadow-[0_0_18px_hsl(var(--gold)/0.55)]"
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
