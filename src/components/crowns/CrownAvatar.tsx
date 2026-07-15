// Renders a user avatar with an equipped Achievement Crown floating above.
// Size contract mirrors AvatarFrame: `size` = photo diameter in px.
import { memo } from "react";

interface CrownAvatarProps {
  photoUrl: string | null | undefined;
  crownAssetUrl: string | null | undefined;
  size: number;
  glow?: boolean;
  positionY?: number;
  alt?: string;
}

function CrownAvatarImpl({ photoUrl, crownAssetUrl, size, glow, positionY = 50, alt = "" }: CrownAvatarProps) {
  const crownW = Math.round(size * 0.72);
  const crownH = Math.round(size * 0.5);
  return (
    <div
      className="relative"
      style={{ width: size, height: size + Math.round(crownH * 0.55) }}
    >
      <div
        className={`absolute left-0 rounded-full overflow-hidden bg-muted ring-2 ring-border ${glow ? "shadow-[0_0_28px_hsl(var(--gold)/0.5)] ring-gold/60" : ""}`}
        style={{ width: size, height: size, top: Math.round(crownH * 0.55), zIndex: 1 }}
      >
        {photoUrl && (
          <img
            src={photoUrl}
            alt={alt}
            className="w-full h-full object-cover"
            style={{ objectPosition: `center ${positionY}%` }}
          />
        )}
      </div>
      {crownAssetUrl && (
        <img
          src={crownAssetUrl}
          alt=""
          aria-hidden
          loading="lazy"
          className="absolute left-1/2 -translate-x-1/2 pointer-events-none select-none drop-shadow-[0_2px_8px_rgba(0,0,0,0.45)]"
          style={{ width: crownW, height: crownH, top: 0, objectFit: "contain", zIndex: 2 }}
        />
      )}
    </div>
  );
}

export default memo(CrownAvatarImpl);
