// URL-persisted filter chips for the Battle Arena hub.
// status = live | upcoming | ended | all
import { useSearchParams } from "react-router-dom";
import { Radio, Clock, Trophy, LayoutGrid } from "lucide-react";

const STATUS_OPTIONS = [
  { key: "all", label: "All", icon: LayoutGrid },
  { key: "live", label: "Live", icon: Radio },
  { key: "upcoming", label: "Upcoming", icon: Clock },
  { key: "ended", label: "Ended", icon: Trophy },
] as const;

export type BattleStatusFilter = (typeof STATUS_OPTIONS)[number]["key"];

export function useBattleFilters() {
  const [params, setParams] = useSearchParams();
  const status = (params.get("status") as BattleStatusFilter) || "all";
  const category = params.get("category") || "";
  const region = params.get("region") || "";
  const set = (patch: Partial<{ status: string; category: string; region: string }>) => {
    const next = new URLSearchParams(params);
    for (const [k, v] of Object.entries(patch)) {
      if (!v || v === "all" || v === "") next.delete(k);
      else next.set(k, v);
    }
    setParams(next, { replace: true });
  };
  return { status, category, region, set };
}

export default function BattleFilterBar() {
  const { status, set } = useBattleFilters();
  return (
    <div
      role="tablist"
      aria-label="Filter battles"
      className="mb-4 flex gap-1.5 overflow-x-auto scrollbar-none -mx-1 px-1 pb-1"
    >
      {STATUS_OPTIONS.map(({ key, label, icon: Icon }) => {
        const active = status === key;
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
  );
}
