import { describe, it, expect } from "vitest";
import { getFrameRenderConfig, FRAMES } from "../frames";

/**
 * Locked sizing contract for AvatarFrame:
 *  - `size` = normal avatar photo diameter.
 *  - Frame overlays scale OUTWARD (frameScale > 1) and never shrink the photo.
 *  - Glow always extends beyond the frame (glowScale > frameScale).
 *  - Framed and unframed avatars share the same photo diameter.
 */
describe("Avatar frame sizing contract (locked)", () => {
  it("frame overlay always scales outward, never inward", () => {
    for (const f of FRAMES) {
      const cfg = getFrameRenderConfig(f.key);
      expect(cfg.frameScale, `frame ${f.key}`).toBeGreaterThan(1);
    }
  });

  it("glow extends beyond frame for every catalog entry", () => {
    for (const f of FRAMES) {
      const cfg = getFrameRenderConfig(f.key);
      expect(cfg.glowScale, `glow ${f.key}`).toBeGreaterThan(cfg.frameScale);
    }
  });

  it("default (unknown key) still returns a valid outward-scaling config", () => {
    const cfg = getFrameRenderConfig(null);
    expect(cfg.frameScale).toBeGreaterThan(1);
    expect(cfg.glowScale).toBeGreaterThan(cfg.frameScale);
  });

  it("photo diameter is invariant: size prop always equals photo px", () => {
    // Sanity check: the render config never scales the photo. Only frame/glow
    // multipliers are surfaced — the photo layer is always 1.0 * size.
    const cfg = getFrameRenderConfig("imperial-glow");
    expect(cfg).not.toHaveProperty("avatarPct");
    expect(cfg).not.toHaveProperty("photoScale");
  });
});
