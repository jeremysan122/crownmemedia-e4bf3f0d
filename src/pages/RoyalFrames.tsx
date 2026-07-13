import { useState } from "react";
import AppShell from "@/components/AppShell";
import { Crown, Lock, Sparkles, Check } from "lucide-react";
import { toast } from "sonner";
import { FRAME_MAP, FRAMES } from "@/lib/frames";
import { useFrameProgress, equipFrame } from "@/hooks/useFrameProgress";
import CrownLoader from "@/components/CrownLoader";
import { useSeoMeta } from "@/hooks/useSeoMeta";

export default function RoyalFrames() {
  useSeoMeta({
    title: "Royal Avatar Frames · CrownMe",
    description: "Unlock 9 exclusive avatar frames by earning crowns, winning battles, and reaching royal milestones.",
  });
  const { rows, loading, refresh } = useFrameProgress();
  const [busy, setBusy] = useState<string | null>(null);

  async function onEquip(key: string | null, label: string) {
    setBusy(key ?? "__clear__");
    try {
      await equipFrame(key);
      toast.success(key ? `${label} equipped` : "Frame cleared");
      await refresh();
    } catch (e) {
      toast.error((e as Error).message || "Couldn't equip frame");
    } finally {
      setBusy(null);
    }
  }

  const unlockedCount = rows.filter((r) => r.unlocked).length;
  const hasEquipped = rows.some((r) => r.equipped);

  return (
    <AppShell>
      <div className="max-w-4xl mx-auto px-4 py-6">
        <header className="mb-6 text-center">
          <div className="inline-flex items-center gap-2 mb-2">
            <Crown className="text-gold" size={20} />
            <span className="text-[10px] uppercase tracking-[0.24em] text-gold/80">Achievement Rewards</span>
            <Crown className="text-gold" size={20} />
          </div>
          <h1 className="font-display text-3xl lg:text-4xl">Royal Avatar Frames</h1>
          <p className="text-muted-foreground text-sm mt-2 max-w-lg mx-auto">
            Earn crowns, win battles, and hit royal milestones to unlock ornate frames that decorate your profile avatar.
          </p>
          <div className="mt-3 inline-flex items-center gap-3 rounded-full border border-gold/30 bg-gold/5 px-4 py-1.5 text-xs">
            <span className="text-gold font-bold tabular-nums">{unlockedCount}</span>
            <span className="text-muted-foreground">/ {FRAMES.length} unlocked</span>
            {hasEquipped && (
              <button
                onClick={() => onEquip(null, "")}
                disabled={busy === "__clear__"}
                className="text-[11px] text-muted-foreground hover:text-foreground underline underline-offset-2"
              >
                Clear equipped
              </button>
            )}
          </div>
        </header>

        {loading ? (
          <CrownLoader fullscreen={false} label="Loading your royal frames…" />
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
            {rows.map((row) => {
              const def = FRAME_MAP[row.key as keyof typeof FRAME_MAP];
              if (!def) return null;
              const pct = Math.min(100, Math.round((row.progress / Math.max(1, row.target)) * 100));
              const locked = !row.unlocked;
              return (
                <article
                  key={row.key}
                  className={`royal-card p-3 flex flex-col items-center text-center relative overflow-hidden transition ${
                    row.equipped ? "ring-2 ring-gold shadow-[0_0_28px_hsl(var(--gold)/0.35)]" : ""
                  }`}
                >
                  {row.equipped && (
                    <span className="absolute top-2 right-2 inline-flex items-center gap-1 rounded-full bg-gold/20 border border-gold/50 px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider text-gold">
                      <Check size={10} /> Equipped
                    </span>
                  )}
                  <div className={`relative w-32 h-32 mb-2 ${locked ? "grayscale opacity-50" : ""}`}>
                    <img
                      src={def.url}
                      alt={def.label}
                      className="w-full h-full object-contain drop-shadow-[0_0_18px_hsl(var(--gold)/0.5)]"
                      loading="lazy"
                    />
                    {locked && (
                      <div className="absolute inset-0 flex items-center justify-center">
                        <div className="rounded-full bg-background/70 p-2 backdrop-blur-sm">
                          <Lock size={18} className="text-muted-foreground" />
                        </div>
                      </div>
                    )}
                  </div>
                  <h3 className="font-display text-sm text-gold leading-tight">{def.label}</h3>
                  <p className="text-[10px] text-muted-foreground mt-0.5 mb-2 leading-snug">{def.tagline}</p>

                  <div className="w-full mt-auto">
                    <div className="flex items-center justify-between text-[10px] mb-1">
                      <span className="text-muted-foreground truncate mr-1">{def.requirement}</span>
                      {!def.binary && (
                        <span className="tabular-nums text-foreground/80 shrink-0">
                          {Math.min(row.progress, row.target)}/{row.target}
                        </span>
                      )}
                    </div>
                    {!def.binary && (
                      <div className="h-1 rounded-full bg-secondary overflow-hidden">
                        <div className="h-full bg-gradient-gold" style={{ width: `${pct}%` }} />
                      </div>
                    )}
                    <div className="mt-2">
                      {row.unlocked ? (
                        row.equipped ? (
                          <button
                            onClick={() => onEquip(null, def.label)}
                            disabled={busy !== null}
                            className="w-full text-[11px] font-bold py-1.5 rounded-md border border-gold/40 text-gold hover:bg-gold/10 disabled:opacity-50"
                          >
                            Unequip
                          </button>
                        ) : (
                          <button
                            onClick={() => onEquip(row.key, def.label)}
                            disabled={busy !== null}
                            className="w-full text-[11px] font-bold py-1.5 rounded-md bg-gradient-gold text-black hover:opacity-90 disabled:opacity-50 inline-flex items-center justify-center gap-1"
                          >
                            <Sparkles size={11} /> Equip
                          </button>
                        )
                      ) : (
                        <div className="w-full text-[11px] py-1.5 rounded-md border border-border text-muted-foreground text-center">
                          Locked
                        </div>
                      )}
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </div>
    </AppShell>
  );
}
