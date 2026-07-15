// Renders an avatar with an equipped Achievement Crown "worn" above it.
// Size contract: `size` = avatar photo diameter (px). The crown overflows
// upward and is horizontally centered. The outer wrapper is overflow-visible.
import { memo } from "react";

export interface CrownRenderConfig {
  widthScale: number;
  heightScale: number;
  overlapScale: number;
  translateX?: number;
  translateY?: number;
  rotation?: number;
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
  widthScale: 0.9,
  heightScale: 0.56,
  overlapScale: 0.21,
  translateX: 0,
  translateY: 0,
  rotation: 0,
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
  const cfg: CrownRenderConfig = { ...DEFAULT_RENDER_CONFIG, ...renderConfig };
  const crownWidth = Math.round(size * cfg.widthScale);
  const crownHeight = Math.round(size * cfg.heightScale);
  const overlap = Math.round(size * cfg.overlapScale);
  const avatarTop = Math.max(0, crownHeight - overlap);
  const wrapperHeight = avatarTop + size;

  return (
    <div
      className="relative isolate"
      style={{ width: size, height: wrapperHeight, overflow: "visible" }}
    >
      {/* Avatar circle — clips only the photo. */}
      <div
        className={`absolute left-0 rounded-full overflow-hidden bg-muted ring-2 ring-border ${glow ? "shadow-[0_0_28px_hsl(var(--gold)/0.5)] ring-gold/60" : ""}`}
        style={{ width: size, height: size, top: avatarTop, zIndex: 10 }}
      >
        {photoUrl ? (
          <img
            src={photoUrl}
            alt={alt}
            className="w-full h-full object-cover"
            style={{ objectPosition: `center ${positionY}%` }}
          />
        ) : null}
      </div>

      {/* Equipped crown — sibling of avatar, always on top. */}
      {crownAssetUrl ? (
        <img
          data-testid="equipped-achievement-crown"
          src={crownAssetUrl}
          alt=""
          aria-hidden="true"
          loading="eager"
          onError={(e) => { e.currentTarget.style.display = "none"; }}
          className="absolute pointer-events-none select-none drop-shadow-[0_2px_8px_rgba(0,0,0,0.45)]"
          style={{
            width: crownWidth,
            height: crownHeight,
            top: 0,
            left: "50%",
            transform: `translateX(-50%) translate(${cfg.translateX ?? 0}px, ${cfg.translateY ?? 0}px) rotate(${cfg.rotation ?? 0}deg)`,
            objectFit: "contain",
            zIndex: 30,
          }}
        />
      ) : null}
    </div>
  );
}

export default memo(CrownAvatarImpl);
