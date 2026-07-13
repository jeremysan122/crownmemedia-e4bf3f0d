import { useMemo, useState } from "react";
import AppShell from "@/components/AppShell";
import { Crown, Lock, Sparkles, Check, EyeOff, Eye } from "lucide-react";
import { toast } from "sonner";
import { useMyOwnedFrames, equipAvatarFrame, type OwnedFrameRow } from "@/hooks/useMyAchievements";
import { useFramesHidden } from "@/hooks/useFramesHidden";
import CrownLoader from "@/components/CrownLoader";
import { useSeoMeta } from "@/hooks/useSeoMeta";
import { Switch } from "@/components/ui/switch";
import { Link } from "react-router-dom";

/**
 * Wave 4 frames gallery — surfaces every avatar frame the caller has earned
 * (permanent + 7-day previews) grouped by collection, with equip / unequip
 * and a global show/hide toggle.
 */
export default function AchievementFrames() {
  useSeoMeta({
    title: "Avatar Frames · CrownMe",
    description: "Manage the ornate frames you've unlocked. Equip, unequip, or hide your frames.",
  });
  const { rows, loading, refresh } = useMyOwnedFrames();
  const { hidden, setHidden, saving } = useFramesHidden();
  const [busy, setBusy] = useState<string | null>(null);

  const grouped = useMemo(() => {
    const g = new Map<string, OwnedFrameRow[]>();
    rows.forEach((r) => {
      const k = r.collection_slug || "other";
      if (!g.has(k)) g.set(k, []);
      g.get(k)!.push(r);
    });
    return Array.from(g.entries());
  }, [rows]);

  async function onEquip(frameId: string | null, name: string) {
    setBusy(frameId ?? "__clear__");
    try {
      await equipAvatarFrame(frameId);
      toast.success(frameId ? `${name} equipped` : "Frame cleared");
      await refresh();
    } catch (e) {
      toast.error((e as Error).message || "Couldn't equip frame");
    } finally { setBusy(null); }
  }

  return (
    <AppShell>
      <div className="max-w-4xl mx-auto px-4 py-6">
        <header className="mb-6 text-center">
          <div className="inline-flex items-center gap-2 mb-2">
            <Crown className="text-gold" size={20} />
            <span className="text-[10px] uppercase tracking-[0.24em] text-gold/80">Avatar Frames</span>
            <Crown className="text-gold" size={20} />
          </div>
          <h1 className="font-display text-3xl lg:text-4xl">Your Frames</h1>
          <p className="text-muted-foreground text-sm mt-2 max-w-lg mx-auto">
            Every frame you've unlocked lives here. Equip one to decorate your avatar, or hide them all if you prefer a clean look.
          </p>
          <div className="mt-3">
            <Link to="/achievements" className="text-xs text-gold hover:underline">
              Browse all achievements →
            </Link>
          </div>
        </header>

        {/* Global show/hide */}
        <section className="mb-5 rounded-xl border border-gold/20 bg-background/40 p-4 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <span className={`rounded-full p-2 ${hidden ? "bg-muted text-muted-foreground" : "bg-gold/15 text-gold"}`}>
              {hidden ? <EyeOff size={16} /> : <Eye size={16} />}
            </span>
            <div>
              <div className="text-sm font-bold">{hidden ? "Frames hidden" : "Frames visible"}</div>
              <div className="text-[11px] text-muted-foreground">
                When off, your equipped frame won't show anywhere in the app.
              </div>
            </div>
          </div>
          <Switch
            checked={!hidden}
            disabled={saving}
            onCheckedChange={(v) => setHidden(!v).then(() => toast.success(v ? "Frames visible" : "Frames hidden"))}
            aria-label="Toggle frame visibility"
          />
        </section>

        {loading ? (
          <CrownLoader fullscreen={false} label="Loading your frames…" />
        ) : rows.length === 0 ? (
          <div className="royal-card p-8 text-center">
            <Lock size={28} className="mx-auto mb-3 text-muted-foreground" />
            <h2 className="font-display text-lg mb-1">No frames yet</h2>
            <p className="text-sm text-muted-foreground mb-4">
              Complete achievements to earn ornate avatar frames.
            </p>
            <Link
              to="/achievements"
              className="inline-block text-xs font-bold px-4 py-2 rounded-md bg-gradient-gold text-black"
            >
              View achievements
            </Link>
          </div>
        ) : (
          <div className="space-y-6">
            {grouped.map(([collection, items]) => (
              <section key={collection}>
                <h2 className="text-[11px] uppercase tracking-[0.2em] text-gold/80 mb-2">
                  {collection.replace(/-/g, " ")}
                </h2>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
                  {items.map((f) => {
                    const expiring = f.expires_at && !f.is_permanent;
                    return (
                      <article
                        key={f.frame_id}
                        className={`royal-card p-3 flex flex-col items-center text-center relative overflow-hidden transition ${
                          f.equipped ? "ring-2 ring-gold shadow-[0_0_28px_hsl(var(--gold)/0.35)]" : ""
                        }`}
                      >
                        {f.equipped && (
                          <span className="absolute top-2 right-2 inline-flex items-center gap-1 rounded-full bg-gold/20 border border-gold/50 px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider text-gold">
                            <Check size={10} /> Equipped
                          </span>
                        )}
                        <div className="relative w-32 h-32 mb-2">
                          {f.asset_url ? (
                            <img
                              src={f.asset_url}
                              alt={f.name}
                              className="w-full h-full object-contain drop-shadow-[0_0_18px_hsl(var(--gold)/0.5)]"
                              loading="lazy"
                            />
                          ) : (
                            <div className="w-full h-full rounded-full bg-muted flex items-center justify-center">
                              <Crown className="text-gold/50" size={32} />
                            </div>
                          )}
                        </div>
                        <h3 className="font-display text-sm text-gold leading-tight">{f.name}</h3>
                        <p className="text-[10px] text-muted-foreground mt-0.5 mb-2 leading-snug">
                          {f.is_permanent ? "Permanent" : expiring ? `Preview until ${new Date(f.expires_at!).toLocaleDateString()}` : "Preview"}
                        </p>
                        <div className="w-full mt-auto">
                          {f.equipped ? (
                            <button
                              onClick={() => onEquip(null, f.name)}
                              disabled={busy !== null}
                              className="w-full text-[11px] font-bold py-1.5 rounded-md border border-gold/40 text-gold hover:bg-gold/10 disabled:opacity-50"
                            >
                              Unequip
                            </button>
                          ) : (
                            <button
                              onClick={() => onEquip(f.frame_id, f.name)}
                              disabled={busy !== null}
                              className="w-full text-[11px] font-bold py-1.5 rounded-md bg-gradient-gold text-black hover:opacity-90 disabled:opacity-50 inline-flex items-center justify-center gap-1"
                            >
                              <Sparkles size={11} /> Equip
                            </button>
                          )}
                        </div>
                      </article>
                    );
                  })}
                </div>
              </section>
            ))}
          </div>
        )}
      </div>
    </AppShell>
  );
}
