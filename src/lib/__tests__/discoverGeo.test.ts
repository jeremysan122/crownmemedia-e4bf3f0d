import { describe, it, expect, beforeEach } from "vitest";
import {
  haversineMiles, withinRadius, loadSavedRadius, saveRadius, DEFAULT_RADIUS,
} from "../discoverGeo";

describe("discoverGeo", () => {
  beforeEach(() => { localStorage.clear(); });

  it("computes haversine distance roughly correctly (NYC -> LA ~ 2450mi)", () => {
    const d = haversineMiles([40.7128, -74.006], [34.0522, -118.2437]);
    expect(d).toBeGreaterThan(2400);
    expect(d).toBeLessThan(2500);
  });

  it("withinRadius returns true for Anywhere", () => {
    expect(withinRadius([0, 0], [60, 60], 0)).toBe(true);
  });

  it("withinRadius respects miles bound", () => {
    expect(withinRadius([40.7128, -74.006], [40.72, -74.0], 5)).toBe(true);
    expect(withinRadius([40.7128, -74.006], [34.05, -118.24], 25)).toBe(false);
  });

  it("withinRadius returns true when distance unknown (no hiding)", () => {
    expect(withinRadius(null, [1, 1], 25)).toBe(true);
    expect(withinRadius([1, 1], null, 25)).toBe(true);
  });

  it("persists radius preference across loads", () => {
    expect(loadSavedRadius()).toBe(DEFAULT_RADIUS);
    saveRadius(50);
    expect(loadSavedRadius()).toBe(50);
  });

  it("ignores invalid stored values", () => {
    localStorage.setItem("crownme:discover:nearby_radius", "9999");
    expect(loadSavedRadius()).toBe(DEFAULT_RADIUS);
  });
});
