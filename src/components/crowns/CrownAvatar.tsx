// Renders an avatar with an equipped Achievement Crown "worn" above it.
// Size contract: `size` = avatar photo diameter (px). The crown overflows
// upward AND horizontally around the avatar circle. Outer wrapper equals the
// avatar diameter and stays overflow-visible so the crown can breach it.
import { memo, useState } from "react";

export interface CrownRenderConfig {
  widthScale: number;
  heightScale: number;
  overlapScale: number;
  translateX?: number;
  translateY?: number;
  rotation?: number;
  visualScale?: number;
}

interface CrownAvatarProps {
  photoUrl: string | null | undefined;
  crownAssetUrl: string | null | undefined;
  size: number;
  glow?: boolean;
  positionY?: number;
  alt?: string;
  renderConfig?: Partial<CrownRenderConfig>;
}

const DEFAULT_RENDER_CONFIG: CrownRenderConfig = {
  widthScale: 1.16,
  heightScale: 0.72,
  overlapScale: 0.33,
  translateX: 0,
  translateY: 6,
  rotation: 0,
  visualScale: 1,
};

function CrownAvatarImpl({
  photoUrl,
  crownAssetUrl,
  size,
  glow = false,
  positionY = 50,
  alt = "",
  renderConfig,
}: CrownAvatarProps) {
  const [crownFailed, setCrownFailed] = useState(false);
  const config: CrownRenderConfig = { ...DEFAULT_RENDER_CONFIG, ...renderConfig };

  const crownWidth = Math.round(size * config.widthScale);
  const crownHeight = Math.round(size * config.heightScale);
  const crownOverlap = Math.round(size * config.overlapScale);
  // Avatar begins after the non-overlapping upper portion of the crown.
  const avatarTop = Math.max(0, crownHeight - crownOverlap);

  return (
    <div
      data-testid="crown-avatar"
      className="relative isolate shrink-0"
      style={{
        width: size,
        height: avatarTop + size,
        overflow: "visible",
      }}
    >
      {/* Avatar circle — the only element that clips. */}
      <div
        data-testid="crown-avatar-circle"
        className={[
          "absolute overflow-hidden rounded-full bg-muted ring-2 ring-border",
          glow ? "ring-gold/60 shadow-[0_0_28px_hsl(var(--gold)/0.5)]" : "",
        ].join(" ")}
        style={{
          width: size,
          height: size,
          top: avatarTop,
          left: "50%",
          transform: "translateX(-50%)",
          zIndex: 10,
        }}
      >
        {photoUrl ? (
          <img
            src={photoUrl}
            alt={alt}
            draggable={false}
            className="block h-full w-full object-cover"
            style={{ objectPosition: `center ${positionY}%` }}
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center bg-muted" aria-label={alt || "User avatar"} />
        )}
      </div>

      {/* Equipped crown — sibling of avatar, always on top, centered on wrapper. */}
      {crownAssetUrl && !crownFailed && (
        <img
          key={crownAssetUrl}
          data-testid="equipped-achievement-crown"
          src={crownAssetUrl}
          alt=""
          aria-hidden="true"
          draggable={false}
          loading="eager"
          decoding="async"
          onError={() => setCrownFailed(true)}
          className="pointer-events-none absolute select-none"
          style={{
            width: crownWidth,
            height: crownHeight,
            top: config.translateY ?? 0,
            left: "50%",
            transform: [
              "translateX(-50%)",
              `translateX(${config.translateX ?? 0}px)`,
              `rotate(${config.rotation ?? 0}deg)`,
              `scale(${config.visualScale ?? 1})`,
            ].join(" "),
            transformOrigin: "center bottom",
            objectFit: "contain",
            objectPosition: "center bottom",
            zIndex: 30,
            filter:
              "drop-shadow(0 4px 8px rgba(0,0,0,0.55)) drop-shadow(0 0 7px rgba(255,190,55,0.3))",
          }}
        />
      )}
    </div>
  );
}

export default memo(CrownAvatarImpl);
