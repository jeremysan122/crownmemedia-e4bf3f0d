// Per-crown render tuning. Keyed by the crown's `sort_order` (1-based crown
// number in the achievement_crowns catalog). Callers use
// `getCrownRenderConfig(sortOrder)` and pass the result to <CrownAvatar />.
import type { CrownRenderConfig } from "./CrownAvatar";

const DEFAULT_CONFIG: Partial<CrownRenderConfig> = {
  widthScale: 1.16,
  heightScale: 0.72,
  overlapScale: 0.33,
  translateX: 0,
  translateY: 6,
  rotation: 0,
  visualScale: 1,
};

export const CROWN_RENDER_CONFIG: Record<number, Partial<CrownRenderConfig>> = {
  // Crown #1 has extra transparent padding around its artwork — boost scale
  // and overlap to compensate until the wearable asset is recropped.
  1: {
    widthScale: 1.22,
    heightScale: 0.76,
    overlapScale: 0.35,
    translateX: 0,
    translateY: 8,
    visualScale: 1.04,
  },
};

export function getCrownRenderConfig(
  crownNumber: number | null | undefined,
): Partial<CrownRenderConfig> {
  if (!crownNumber) return DEFAULT_CONFIG;
  return { ...DEFAULT_CONFIG, ...(CROWN_RENDER_CONFIG[crownNumber] ?? {}) };
}
