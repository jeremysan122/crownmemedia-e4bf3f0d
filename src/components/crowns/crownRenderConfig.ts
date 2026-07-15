import type { CrownRenderConfig } from "./CrownAvatar";

const DEFAULT_CONFIG: Partial<CrownRenderConfig> = {
  widthScale: 1.05,
  overlapScale: 0.1,
  translateX: 0,
  translateY: 0,
  rotation: 0,
  visualScale: 1,
};

export const CROWN_RENDER_CONFIG: Record<
  number,
  Partial<CrownRenderConfig>
> = {
  /*
   * Add only small crown-specific corrections after visual review.
   *
   * The crown shown in the latest screenshot should start with:
   */
  1: {
    widthScale: 1.08,
    overlapScale: 0.09,
    translateX: 0,
    translateY: 0,
    visualScale: 1,
  },
};

export function getCrownRenderConfig(
  crownNumber: number | null | undefined
): Partial<CrownRenderConfig> {
  return {
    ...DEFAULT_CONFIG,
    ...(crownNumber
      ? CROWN_RENDER_CONFIG[crownNumber] ?? {}
      : {}),
  };
}