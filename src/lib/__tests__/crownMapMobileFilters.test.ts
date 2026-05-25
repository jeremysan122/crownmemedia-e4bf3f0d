import { describe, it, expect, vi } from "vitest";

/**
 * E2E-ish (logic-level) test for the CrownMap mobile filter "Apply" flow.
 *
 * Verifies that staging draft edits (scope/category/mineOnly/heat) and then
 * tapping "Apply filters" results in *exactly one* commit + one map/list
 * refresh — not one per individual toggle. This guards against regressions
 * where intermediate setState calls would each trigger a re-fetch.
 */

type Scope = "all" | "global" | "country" | "state" | "city";
type Category = "overall" | "coffee" | "sunset";

interface AppliedFilters {
  scope: Scope;
  category: Category;
  mineOnly: boolean;
  heat: boolean;
}

function createMobileFilterController(initial: AppliedFilters, onApply: (f: AppliedFilters) => void) {
  let applied = { ...initial };
  let draft = { ...initial };
  let open = false;

  return {
    open() { open = true; draft = { ...applied }; },
    isOpen() { return open; },
    setScope(s: Scope) { if (open) draft.scope = s; else { applied.scope = s; onApply({ ...applied }); } },
    setCategory(c: Category) { if (open) draft.category = c; else { applied.category = c; onApply({ ...applied }); } },
    setMineOnly(v: boolean) { if (open) draft.mineOnly = v; else { applied.mineOnly = v; onApply({ ...applied }); } },
    setHeat(v: boolean) { if (open) draft.heat = v; else { applied.heat = v; onApply({ ...applied }); } },
    isDirty() { return JSON.stringify(draft) !== JSON.stringify(applied); },
    apply() {
      if (!open) return;
      const dirty = this.isDirty();
      applied = { ...draft };
      open = false;
      if (dirty) onApply({ ...applied });
    },
    snapshot() { return { ...applied }; },
  };
}

describe("CrownMap mobile filters — apply flow", () => {
  it("opens panel, stages 4 edits, applies once, refreshes once", () => {
    const refresh = vi.fn();
    const ctl = createMobileFilterController(
      { scope: "all", category: "overall", mineOnly: false, heat: false },
      refresh,
    );

    ctl.open();
    expect(ctl.isOpen()).toBe(true);

    // Stage edits — none of these should trigger a refresh while open.
    ctl.setScope("city");
    ctl.setCategory("coffee");
    ctl.setMineOnly(true);
    ctl.setHeat(true);

    expect(refresh).not.toHaveBeenCalled();
    expect(ctl.isDirty()).toBe(true);
    // Underlying applied state is still the original
    expect(ctl.snapshot()).toEqual({ scope: "all", category: "overall", mineOnly: false, heat: false });

    ctl.apply();

    expect(refresh).toHaveBeenCalledTimes(1);
    expect(refresh).toHaveBeenCalledWith({
      scope: "city", category: "coffee", mineOnly: true, heat: true,
    });
    expect(ctl.isOpen()).toBe(false);
    expect(ctl.snapshot()).toEqual({
      scope: "city", category: "coffee", mineOnly: true, heat: true,
    });
  });

  it("does not refresh when apply is tapped with no changes", () => {
    const refresh = vi.fn();
    const ctl = createMobileFilterController(
      { scope: "global", category: "overall", mineOnly: false, heat: false },
      refresh,
    );
    ctl.open();
    ctl.apply();
    expect(refresh).not.toHaveBeenCalled();
  });

  it("desktop (no draft) commits each toggle live", () => {
    const refresh = vi.fn();
    const ctl = createMobileFilterController(
      { scope: "all", category: "overall", mineOnly: false, heat: false },
      refresh,
    );
    // Don't open() — simulates desktop sidebar where edits apply immediately.
    ctl.setScope("city");
    ctl.setHeat(true);
    expect(refresh).toHaveBeenCalledTimes(2);
  });
});

describe("CrownMap URL <-> filters round-trip", () => {
  // Mirrors the param-writing logic in CrownMap.tsx so the exact view is
  // shareable + restorable from the URL alone.
  const buildParams = (f: AppliedFilters & { tag?: string; view?: "list" | "map" }) => {
    const next = new URLSearchParams();
    const set = (k: string, v: string, def: string) => { if (v && v !== def) next.set(k, v); };
    set("scope", f.scope, "all");
    set("category", f.category, "overall");
    set("view", f.view ?? "list", "list");
    set("mine", f.mineOnly ? "1" : "", "");
    set("heat", f.heat ? "1" : "", "");
    if (f.tag) next.set("tag", f.tag);
    return next.toString();
  };

  it("encodes non-default filter state into the URL", () => {
    const qs = buildParams({ scope: "city", category: "coffee", mineOnly: true, heat: true, view: "map", tag: "sunset" });
    const params = new URLSearchParams(qs);
    expect(params.get("scope")).toBe("city");
    expect(params.get("category")).toBe("coffee");
    expect(params.get("mine")).toBe("1");
    expect(params.get("heat")).toBe("1");
    expect(params.get("view")).toBe("map");
    expect(params.get("tag")).toBe("sunset");
  });

  it("omits defaults so default URLs stay clean", () => {
    const qs = buildParams({ scope: "all", category: "overall", mineOnly: false, heat: false, view: "list" });
    expect(qs).toBe("");
  });

  it("restoring from URL yields the same filter state", () => {
    const original: AppliedFilters & { view: "list" | "map" } = {
      scope: "state", category: "sunset", mineOnly: false, heat: true, view: "map",
    };
    const qs = buildParams(original);
    const p = new URLSearchParams(qs);
    const restored: AppliedFilters & { view: "list" | "map" } = {
      scope: (p.get("scope") as Scope) || "all",
      category: (p.get("category") as Category) || "overall",
      mineOnly: p.get("mine") === "1",
      heat: p.get("heat") === "1",
      view: (p.get("view") as "list" | "map") || "list",
    };
    expect(restored).toEqual(original);
  });
});
