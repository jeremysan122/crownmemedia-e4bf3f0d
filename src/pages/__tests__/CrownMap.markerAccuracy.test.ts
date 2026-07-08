import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

/**
 * Source-level guard for the Crown Map marker accuracy fix.
 *
 * The previous implementation fell back to `fallbackCoord(...)` — a
 * deterministic hash that drops pins in wildly wrong places (e.g. the
 * Pacific ocean or the wrong continent). We now require:
 *
 *   1. CrownMap.tsx does NOT import or call `fallbackCoord` for visible pins.
 *   2. `geoFor()` returns `{ coord: LatLng | null }` so unmapped regions
 *      can be filtered out of markers AND the heat overlay.
 *   3. The marker count UI says "N unmapped" (not "N approx.") when
 *      pins fail lookup — fake pins would be labeled "approx." and
 *      still be shown, which is what we're eliminating.
 */

const SRC = readFileSync(resolve(process.cwd(), "src/pages/CrownMap.tsx"), "utf8");

describe("CrownMap.tsx marker accuracy", () => {
  it("does not import fallbackCoord", () => {
    expect(SRC).not.toMatch(/import\s+\{[^}]*fallbackCoord/);
  });

  it("does not call fallbackCoord anywhere in the file", () => {
    expect(SRC).not.toMatch(/fallbackCoord\s*\(/);
  });

  it("geoFor returns a nullable coord", () => {
    // Now includes `precision` alongside `coord` so the UI can label pins,
    // but the coord itself must still be nullable so unmapped rows are hidden.
    expect(SRC).toMatch(/function geoFor\([^)]*\)\s*:\s*\{\s*coord:\s*LatLng\s*\|\s*null\s*;/);
  });


  it("filters out unmapped rows before rendering markers", () => {
    expect(SRC).toMatch(/\.filter\(\(p\)[^)]*=>\s*p\.coord\s*!==\s*null/);
  });

  it("labels missing coords as 'unmapped', not 'approx.'", () => {
    expect(SRC).toMatch(/unmappedCount/);
    expect(SRC).toMatch(/\$\{unmappedCount\}\s+unmapped/);
    expect(SRC).not.toMatch(/approx\./);
  });
});
