import { useState } from "react";
import { getFrameRenderConfig, getFrameUrl } from "@/lib/frames";

interface Props {
  photoUrl?: string | null;
  founderFallbackUrl?: string | null;
  frameKey?: string | null;
  alt?: string;
  glow?: boolean;
  /**
   * Diameter of the normal avatar photo (px). A framed and unframed avatar
   * with the same `size` have the exact same photo width. The decorative
   * frame and glow are absolute overlays that scale OUTWARD beyond the photo.
   */
  size?: number;
  className?: string;
  positionY?: number | null;
}

/**
 * Framed avatar.
 *
 * Layout contract:
 *  - Outer `.avatar-frame-layout` reserves the full visible frame diameter
 *    (size * frameScale) in the page flow so surrounding content is not
 *    overlapped by the decorative frame.
 *  - Inner `.avatar-frame-shell` is exactly `size` × `size` — the photo's
 *    normal footprint — centered inside the layout wrapper.
 *  - Photo is always 1:1 with `size`. Frame/glow scale outward.
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
  const [imgLoaded, setImgLoaded] = useState(false);
  const frameUrl =
    (frameKey ? getFrameUrl(frameKey) : null) || founderFallbackUrl || null;

  const config = getFrameRenderConfig(frameKey);
  const visualSize = frameUrl ? Math.ceil(size * config.frameScale) : size;

  return (
    <div
      className={`avatar-frame-layout ${className}`}
      style={{
        width: visualSize,
        height: visualSize,
        flex: `0 0 ${visualSize}px`,
      }}
    >
      <div
        className="avatar-frame-shell"
        style={{ width: size, height: size }}
      >
        {frameUrl && glow && (
          <div
            aria-hidden="true"
            className="avatar-frame-glow-layer"
            style={{
              width: size * config.glowScale,
              height: size * config.glowScale,
            }}
          />
        )}

        <div
          className={`avatar-frame-photo ${
            !frameUrl ? "ring-2 ring-border" : ""
          }`}
        >
          {photoUrl && (
            <img
              src={photoUrl}
              alt={alt}
              onLoad={() => setImgLoaded(true)}
              style={{
                objectPosition: `center ${positionY ?? 50}%`,
                opacity: imgLoaded ? 1 : 0,
                transition: "opacity 220ms ease-out",
              }}
            />
          )}
          {photoUrl && !imgLoaded && (
            <div
              aria-hidden="true"
              className="absolute inset-0 animate-pulse bg-muted"
            />
          )}
        </div>

        {frameUrl && (
          <img
            src={frameUrl}
            alt=""
            aria-hidden="true"
            loading="lazy"
            className="avatar-frame-art"
            style={{
              width: size * config.frameScale,
              height: size * config.frameScale,
              left: `calc(50% + ${config.offsetX}%)`,
              top: `calc(50% + ${config.offsetY}%)`,
            }}
          />
        )}
      </div>
    </div>
  );
}
