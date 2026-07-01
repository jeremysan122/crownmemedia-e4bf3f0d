import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

/**
 * Source-level contract tests for CrownMap.
 *
 * These lock invariants that were fixed during the launch-hardening pass:
 *   1. Share URLs must use the canonical `/map` route (not `/crown-map`).
 *   2. The legacy `/crown-map` route must redirect to `/map` (preserving qs).
 *   3. Crown Map must NOT run `count: "exact"` on every fetch.
 *   4. Realtime updates must pass `rowMatchesFilters` before mutating state.
 *   5. Text/number filters must be debounced (no per-keystroke fetch).
 *   6. Fetch errors must set a friendly `loadError`, never leak raw text.
 *   7. Empty state must be gated behind `!loadError`.
 */
const CROWN_MAP_SRC = readFileSync(resolve(process.cwd(), "src/pages/CrownMap.tsx"), "utf8");
const APP_SRC = readFileSync(resolve(process.cwd(), "src/App.tsx"), "utf8");

describe("CrownMap source contracts", () => {
  it("share URL uses /map, never /crown-map", () => {
    // shareUrl block should produce `/map` and NOT `/crown-map`.
    const shareBlock = CROWN_MAP_SRC.slice(
      CROWN_MAP_SRC.indexOf("const shareUrl = useMemo"),
      CROWN_MAP_SRC.indexOf("const shareLabel = useMemo"),
    );
    expect(shareBlock).toContain("`/map${qs");
    expect(shareBlock).not.toMatch(/`\/crown-map\$\{qs/);
  });

  it("uses estimated count, not exact count", () => {
    expect(CROWN_MAP_SRC).not.toMatch(/count:\s*["']exact["']/);
    expect(CROWN_MAP_SRC).toMatch(/count:\s*["']estimated["']/);
  });

  it("realtime handler validates filters before applying updates", () => {
    // rowMatchesFilters must be defined AND invoked inside the realtime callback.
    expect(CROWN_MAP_SRC).toContain("const rowMatchesFilters");
    const rtBlock = CROWN_MAP_SRC.slice(
      CROWN_MAP_SRC.indexOf("useRealtimeChannel("),
      CROWN_MAP_SRC.indexOf("// Decay movers"),
    );
    expect(rtBlock).toContain("rowMatchesFilters(row)");
  });

  it("debounces text/number filters (no per-keystroke fetch)", () => {
    expect(CROWN_MAP_SRC).toContain("setDebouncedQuery");
    expect(CROWN_MAP_SRC).toContain("setDebouncedHolder");
    expect(CROWN_MAP_SRC).toContain("setDebouncedMinScore");
    // fetchPage's dependency array must use the debounced versions, not raw inputs.
    const depSig = CROWN_MAP_SRC.match(
      /\}, \[category, scope, debouncedQuery, exactName, mineOnly, user, debouncedMinScore, debouncedHolder\]\);/,
    );
    expect(depSig).toBeTruthy();
  });

  it("exposes loadError + Retry, and gates empty state behind !loadError", () => {
    expect(CROWN_MAP_SRC).toContain("Couldn't load Crown Map right now.");
    expect(CROWN_MAP_SRC).toContain("Try again");
    expect(CROWN_MAP_SRC).toContain("!loadError && filtered.length === 0");
  });

  it("never renders raw supabase error text to users", () => {
    // We log to console.error but the UI copy must be the friendly string.
    expect(CROWN_MAP_SRC).toContain('console.error("[CrownMap] fetch failed"');
    // Make sure we don't accidentally surface error.message in JSX for CrownMap.
    expect(CROWN_MAP_SRC).not.toMatch(/\{loadError\?\.message\}/);
  });
});

describe("App routing contracts for Crown Map", () => {
  it("has a canonical /map route", () => {
    expect(APP_SRC).toMatch(/path="\/map"\s+element=\{<ProtectedRoute><CrownMap/);
  });

  it("keeps legacy /crown-map as a redirect (query string preserved)", () => {
    expect(APP_SRC).toContain('path="/crown-map"');
    expect(APP_SRC).toContain("CrownMapLegacyRedirect");
    expect(APP_SRC).toMatch(/Navigate\s+to=\{`\/map\$\{search\}\$\{hash\}`\}/);
  });
});
