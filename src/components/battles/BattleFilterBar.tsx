// URL-persisted filter bar for the Battle Arena hub.
// Filters: status, category, region, stakes. All persist in URL search params
// so a filtered view is shareable; clearing a filter removes it from the URL.

import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Radio, Clock, Trophy, LayoutGrid, ChevronDown } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

const STATUS_OPTIONS = [
  { key: "all", label: "All", icon: LayoutGrid },
  { key: "live", label: "Live", icon: Radio },
  { key: "upcoming", label: "Upcoming", icon: Clock },
  { key: "ended", label: "Ended", icon: Trophy },
] as const;

const REGION_OPTIONS = ["Global", "North America", "Europe", "Asia", "Africa", "Latin America", "Oceania"];
const STAKES_OPTIONS = [
  { key: "any", label: "Any stakes" },
  { key: "low", label: "Low stakes" },
  { key: "mid", label: "Mid stakes" },
  { key: "high", label: "High stakes" },
];

export type BattleStatusFilter = "all" | "live" | "upcoming" | "ended";
export type BattleStakesFilter = "any" | "low" | "mid" | "high";

export interface BattleFilters {
  status: BattleStatusFilter;
  category: string;
  region: string;
  stakes: BattleStakesFilter;
}

export function useBattleFilters() {
  const [params, setParams] = useSearchParams();
  const filters: BattleFilters = {
    status: (params.get("status") as BattleStatusFilter) || "all",
    category: params.get("category") || "",
    region: params.get("region") || "",
    stakes: (params.get("stakes") as BattleStakesFilter) || "any",
  };
  const set = (patch: Partial<Record<keyof BattleFilters, string>>) => {
    const next = new URLSearchParams(params);
    for (const [k, v] of Object.entries(patch)) {
      const isDefault =
        (k === "status" && (v === "all" || !v)) ||
        (k === "stakes" && (v === "any" || !v)) ||
        (!v);
      if (isDefault) next.delete(k);
      else next.set(k, v as string);
    }
    setParams(next, { replace: true });
  };
  const clear = () => setParams(new URLSearchParams(), { replace: true });
  return { filters, set, clear };
}

export default function BattleFilterBar() {
  const { filters, set, clear } = useBattleFilters();
  const [cats, setCats] = useState<{ slug: string; label: string }[]>([]);

  useEffect(() => {
    let alive = true;
    (async () => {
      const { data } = await supabase
        .from("main_categories")
        .select("slug,label")
        .eq("is_active", true)
        .order("sort_order", { ascending: true });
      if (alive && data) setCats(data as any);
    })();
    return () => { alive = false; };
  }, []);

  const anyActive =
    filters.status !== "all" ||
    !!filters.category ||
    !!filters.region ||
    filters.stakes !== "any";

  return (
    <div className="mb-4 space-y-2" aria-label="Battle filters">
      {/* Status tabs */}
      <div role="tablist" aria-label="Filter by status" className="flex gap-1.5 overflow-x-auto scrollbar-none -mx-1 px-1">
        {STATUS_OPTIONS.map(({ key, label, icon: Icon }) => {
          const active = filters.status === key;
          return (
            <button
              key={key}
              role="tab"
              aria-selected={active}
              onClick={() => set({ status: key })}
              className={
                "shrink-0 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold border transition " +
                (active
                  ? "bg-primary text-primary-foreground border-primary shadow-sm"
                  : "bg-card text-muted-foreground border-border/60 hover:border-primary/50 hover:text-foreground")
              }
            >
              <Icon size={12} />
              {label}
            </button>
          );
        })}
      </div>

      {/* Category / region / stakes dropdowns */}
      <div className="flex flex-wrap gap-1.5 items-center">
        <FilterSelect
          value={filters.category}
          onChange={(v) => set({ category: v })}
          placeholder="All categories"
          options={[{ value: "", label: "All categories" }, ...cats.map((c) => ({ value: c.slug, label: c.label }))]}
          ariaLabel="Filter by category"
        />
        <FilterSelect
          value={filters.region}
          onChange={(v) => set({ region: v })}
          placeholder="All regions"
          options={[{ value: "", label: "All regions" }, ...REGION_OPTIONS.map((r) => ({ value: r, label: r }))]}
          ariaLabel="Filter by region"
        />
        <FilterSelect
          value={filters.stakes}
          onChange={(v) => set({ stakes: v as BattleStakesFilter })}
          placeholder="Any stakes"
          options={STAKES_OPTIONS.map((s) => ({ value: s.key, label: s.label }))}
          ariaLabel="Filter by stakes"
        />
        {anyActive && (
          <button
            onClick={clear}
            className="ml-auto text-[11px] font-bold text-muted-foreground hover:text-foreground underline underline-offset-2"
          >
            Clear filters
          </button>
        )}
      </div>
    </div>
  );
}

function FilterSelect({
  value, onChange, options, placeholder, ariaLabel,
}: {
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
  placeholder: string;
  ariaLabel: string;
}) {
  return (
    <div className="relative">
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        aria-label={ariaLabel}
        className="appearance-none pl-3 pr-7 py-1.5 rounded-full text-xs font-bold border bg-card text-foreground border-border/60 hover:border-primary/50 focus:outline-none focus:border-primary transition"
      >
        {options.map((o) => (
          <option key={o.value || "__none"} value={o.value}>{o.label || placeholder}</option>
        ))}
      </select>
      <ChevronDown size={12} className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground" />
    </div>
  );
}
