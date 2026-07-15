import { memo, useEffect, useState } from "react";

export interface CrownRenderConfig {
  widthScale: number;
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
  widthScale: 1.05,
  overlapScale: 0.1,
  translateX: 0,
  translateY: 0,
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

  useEffect(() => {
    setCrownFailed(false);
  }, [crownAssetUrl]);

  const config: CrownRenderConfig = {
    ...DEFAULT_RENDER_CONFIG,
    ...renderConfig,
  };

  const crownWidth = Math.round(size * config.widthScale);
  const crownOverlap = Math.round(size * config.overlapScale);

  /*
   * The outer wrapper remains exactly the same size as the avatar.
   *
   * The crown is anchored by its bottom edge to the avatar's top edge.
   * It overflows upward instead of pushing the avatar downward.
   */
  const crownBottom = size - crownOverlap;

  return (
    <div
      data-testid="crown-avatar"
      className="relative isolate shrink-0 overflow-visible"
      style={{
        width: size,
        height: size,
        overflow: "visible",
      }}
    >
      {/* Avatar circle stays fixed at its normal size and position. */}
      <div
        data-testid="crown-avatar-circle"
        className={[
          "absolute inset-0 overflow-hidden rounded-full bg-muted",
          "ring-2 ring-border",
          glow
            ? "ring-gold/60 shadow-[0_0_28px_hsl(var(--gold)/0.5)]"
            : "",
        ].join(" ")}
        style={{
          width: size,
          height: size,
          zIndex: 10,
        }}
      >
        {photoUrl ? (
          <img
            src={photoUrl}
            alt={alt}
            draggable={false}
            className="block h-full w-full object-cover"
            style={{
              objectPosition: `center ${positionY}%`,
            }}
          />
        ) : (
          <div
            className="flex h-full w-full items-center justify-center bg-muted"
            aria-label={alt || "User avatar"}
          />
        )}
      </div>

      {/* Exactly one equipped wearable crown. */}
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
            height: "auto",
            maxHeight: Math.round(size * 0.65),
            left: "50%",
            bottom: crownBottom,
            transform: [
              "translateX(-50%)",
              `translateX(${config.translateX ?? 0}px)`,
              `translateY(${config.translateY ?? 0}px)`,
              `rotate(${config.rotation ?? 0}deg)`,
              `scale(${config.visualScale ?? 1})`,
            ].join(" "),
            transformOrigin: "center bottom",
            objectFit: "contain",
            objectPosition: "center bottom",
            zIndex: 30,
            filter:
              "drop-shadow(0 4px 8px rgba(0,0,0,0.55)) drop-shadow(0 0 6px rgba(255,190,55,0.28))",
          }}
        />
      )}
    </div>
  );
}

export default memo(CrownAvatarImpl);