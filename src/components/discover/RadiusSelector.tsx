// Polished, accessible radius selector for "People Near You".
//
// - Royal-styled trigger button (not the default unstyled select).
// - Popover with large tap targets, keyboard navigation, ARIA roles.
// - Inline helper text explaining "Anywhere nearby".
// - Selection persists via discoverGeo.saveRadius (caller wires this in).
import { useState } from "react";
import { MapPin, Check, ChevronDown, Globe2 } from "lucide-react";
import { Popover, PopoverTrigger, PopoverContent } from "@/components/ui/popover";
import { RADIUS_OPTIONS, type RadiusMiles } from "@/lib/discoverGeo";

interface Props {
  value: RadiusMiles;
  onChange: (r: RadiusMiles) => void;
  geoSource: "gps" | "city" | "state" | "country" | "none";
}

export default function RadiusSelector({ value, onChange, geoSource }: Props) {
  const [open, setOpen] = useState(false);
  const active = RADIUS_OPTIONS.find((o) => o.value === value) ?? RADIUS_OPTIONS[3];

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-haspopup="listbox"
          aria-expanded={open}
          aria-label={`Distance radius, currently ${active.label}`}
          className="h-9 px-3 inline-flex items-center gap-1.5 rounded-full border border-primary/40 bg-gradient-to-br from-amber-500/15 to-yellow-600/10 text-xs font-bold text-foreground hover:border-primary/70 hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60 transition shadow-sm"
        >
          {value === 0 ? <Globe2 size={13} className="text-primary" /> : <MapPin size={13} className="text-primary" />}
          <span className="tabular-nums">{value === 0 ? "Anywhere" : active.label}</span>
          <ChevronDown size={12} className="text-muted-foreground" aria-hidden />
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="end"
        sideOffset={6}
        className="w-64 p-2 rounded-2xl border-primary/30 bg-card/95 backdrop-blur shadow-xl"
      >
        <div className="px-2 pt-1 pb-2">
          <p className="text-[10px] uppercase tracking-widest text-muted-foreground font-bold">Distance</p>
        </div>
        <ul role="listbox" aria-label="Distance radius options" className="flex flex-col gap-0.5">
          {RADIUS_OPTIONS.map((o) => {
            const selected = o.value === value;
            return (
              <li key={o.value}>
                <button
                  type="button"
                  role="option"
                  aria-selected={selected}
                  onClick={() => { onChange(o.value); setOpen(false); }}
                  className={`w-full min-h-[44px] flex items-center justify-between gap-2 px-3 rounded-xl text-sm transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60 ${
                    selected
                      ? "bg-primary/15 text-primary font-bold"
                      : "hover:bg-secondary/60 text-foreground"
                  }`}
                >
                  <span className="flex items-center gap-2">
                    {o.value === 0 ? <Globe2 size={14} /> : <MapPin size={14} />}
                    <span>{o.value === 0 ? "Anywhere nearby" : o.label}</span>
                  </span>
                  {selected && <Check size={14} aria-hidden />}
                </button>
              </li>
            );
          })}
        </ul>
        <p className="px-3 pt-2 pb-1 text-[11px] leading-snug text-muted-foreground">
          {value === 0 ? (
            <>
              <span className="font-bold text-foreground">Anywhere nearby</span> uses the best location signal
              available — your city, state, or country — when exact distance isn't possible.
            </>
          ) : geoSource === "none" ? (
            "We couldn't determine your location. Enable location or set your city in your profile."
          ) : geoSource === "gps" ? (
            "Using your precise location."
          ) : (
            <>Using your <span className="font-bold text-foreground">{geoSource}</span> as a fallback.</>
          )}
        </p>
      </PopoverContent>
    </Popover>
  );
}
