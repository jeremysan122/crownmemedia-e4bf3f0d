import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

/**
 * Source-level guards for the Crown Map launch polish:
 *
 *  1. `UnmappedCrownedPosts` section renders in the map view, uses the
 *     classifier (never fake fallback coords), and shows the mandated copy.
 *  2. `MapView` performs client-side clustering by projecting points to
 *     pixel buckets, hides overlapping markers, and adds a "+N" badge.
 *  3. Upload denied banner uses the mandated copy and offers the two
 *     recovery buttons ("Choose city manually" / "Keep location off").
 */
const CROWN = readFileSync(resolve(process.cwd(), "src/pages/CrownMap.tsx"), "utf8");
const UPLOAD = readFileSync(resolve(process.cwd(), "src/pages/Upload.tsx"), "utf8");

describe("Crown Map launch polish — source contracts", () => {
  it("CrownMap renders the UnmappedCrownedPosts section in map view", () => {
    expect(CROWN).toMatch(/<UnmappedCrownedPosts\s+rows=\{filtered\}/);
    expect(CROWN).toMatch(/data-testid="unmapped-crowned-posts"/);
    expect(CROWN).toContain("Unmapped crowned posts");
    expect(CROWN).toContain(
      "These crowned posts don't have a location attached yet",
    );
  });

  it("UnmappedCrownedPosts uses the classifier (no ad-hoc coordinate maths)", () => {
    expect(CROWN).toMatch(/classifyCrownRows\(rows\)/);
    // Never call fallbackCoord for visible rendering.
    expect(CROWN).not.toMatch(/fallbackCoord\s*\(/);
  });

  it("MapView clusters overlapping markers with a +N badge", () => {
    expect(CROWN).toMatch(/data-cluster-badge/);
    expect(CROWN).toMatch(/map\.project\(/);
    // Cluster pass re-runs on move + zoom.
    expect(CROWN).toMatch(/map\.on\("moveend", runCluster\)/);
    expect(CROWN).toMatch(/map\.on\("zoomend", runCluster\)/);
  });
});

describe("Upload denied-location banner — source contracts", () => {
  it("renders the branded denied banner instead of raw error text", () => {
    expect(UPLOAD).toMatch(/data-testid="location-denied-banner"/);
    expect(UPLOAD).toContain("Location permission was denied");
    expect(UPLOAD).toContain(
      "No problem — you can still add a city manually",
    );
  });

  it("offers 'Choose city manually' and 'Keep location off' recovery buttons", () => {
    expect(UPLOAD).toMatch(/Choose city manually/);
    expect(UPLOAD).toMatch(/Keep location off/);
  });

  it("focuses the city input when the user picks 'Choose city manually'", () => {
    expect(UPLOAD).toMatch(/cityInputRef\.current\?\.focus\(\)/);
  });

  it("still shows the per-post privacy reassurance", () => {
    expect(UPLOAD).toMatch(
      /Location is attached to this post only\. CrownMe does not use this[\s\S]{0,80}profile or home location/,
    );
  });
});
