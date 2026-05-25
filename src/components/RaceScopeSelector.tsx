import type { RegionScope } from "./RaceProgressBar";

interface Props {
  value: RegionScope;
  onChange: (s: RegionScope) => void;
  available: { city: boolean; state: boolean; country: boolean };
  className?: string;
}

const ORDER: RegionScope[] = ["city", "state", "country", "global"];
const LABEL: Record<RegionScope, string> = { city: "City", state: "State", country: "Country", global: "Global" };

/**
 * Compact 4-segment scope switcher for the race progress bar.
 * Disables tiers the post has no location data for.
 */
export default function RaceScopeSelector({ value, onChange, available, className }: Props) {
  const isEnabled = (s: RegionScope) =>
    s === "global" ||
    (s === "country" && available.country) ||
    (s === "state" && available.state) ||
    (s === "city" && available.city);

  return (
    <div
      role="tablist"
      aria-label="Race region scope"
      className={`inline-flex items-center gap-0.5 p-0.5 rounded-full bg-muted/40 border border-border/50 ${className ?? ""}`}
    >
      {ORDER.map((s) => {
        const enabled = isEnabled(s);
        const active = value === s;
        return (
          <button
            key={s}
            role="tab"
            aria-selected={active}
            disabled={!enabled}
            onClick={() => enabled && onChange(s)}
            className={[
              "text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full transition-all",
              active
                ? "bg-primary text-primary-foreground shadow-sm"
                : enabled
                  ? "text-muted-foreground hover:text-foreground"
                  : "text-muted-foreground/40 cursor-not-allowed",
            ].join(" ")}
            title={enabled ? `${LABEL[s]} race` : `No ${LABEL[s].toLowerCase()} set on this post`}
          >
            {LABEL[s]}
          </button>
        );
      })}
    </div>
  );
}
