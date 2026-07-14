import { Info } from "lucide-react";
import { useState } from "react";

const ROWS: { key: string; label: string; range: string; cls: string }[] = [
  { key: "common",    label: "Common",    range: ">30% own it",   cls: "text-muted-foreground" },
  { key: "rare",      label: "Rare",      range: "10–30%",         cls: "text-blue-400" },
  { key: "epic",      label: "Epic",      range: "3–10%",          cls: "text-purple-400" },
  { key: "legendary", label: "Legendary", range: "1–3%",           cls: "text-gold" },
  { key: "mythic",    label: "Mythic",    range: "<1%",            cls: "text-fuchsia-400" },
];

export default function RarityLegend() {
  const [open, setOpen] = useState(false);
  return (
    <div className="relative inline-block">
      <button
        onClick={() => setOpen((v) => !v)}
        className="inline-flex items-center gap-1 text-[11px] px-2 py-1 rounded-full border border-border text-muted-foreground hover:text-foreground"
        aria-expanded={open}
      >
        <Info size={12} /> Rarity
      </button>
      {open && (
        <div className="absolute right-0 mt-2 z-20 w-56 royal-card p-3 text-[11px] space-y-1.5 shadow-lg">
          {ROWS.map((r) => (
            <div key={r.key} className="flex items-center justify-between">
              <span className={`font-bold uppercase tracking-wider ${r.cls}`}>{r.label}</span>
              <span className="text-muted-foreground">{r.range}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
