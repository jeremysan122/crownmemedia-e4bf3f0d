import { useEffect, useMemo, useState } from "react";
import AppShell from "@/components/AppShell";
import { Crown, Lock, Sparkles, Check } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import CrownLoader from "@/components/CrownLoader";
import { useSeoMeta } from "@/hooks/useSeoMeta";
import { useMyOwnedFrames, equipAvatarFrame } from "@/hooks/useMyAchievements";

interface CatalogRow {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  static_asset_url: string | null;
  thumbnail_asset_url: string | null;
  display_order: number;
  rarity: string | null;
  is_founder_only: boolean;
  collection_id: string | null;
  ach_name: string | null;
  ach_description: string | null;
}

interface CollectionRow {
  id: string;
  slug: string;
  name: string;
  display_order: number;
}

export default function RoyalFrames() {
  useSeoMeta({
    title: "Royal Avatar Frames · CrownMe",
    description:
      "Browse all 81 ornate avatar frames — see the achievement required for each and equip the ones you've earned.",
  });

  const { rows: owned, refresh: refreshOwned } = useMyOwnedFrames();
  const [frames, setFrames] = useState<CatalogRow[]>([]);
  const [collections, setCollections] = useState<CollectionRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);

  useEffect(() => {
    let cancel = false;
    (async () => {
      const [{ data: fData }, { data: cData }, { data: aData }] = await Promise.all([
        (supabase as any)
          .from("avatar_frames")
          .select("id,slug,name,description,static_asset_url,thumbnail_asset_url,display_order,rarity,is_founder_only,collection_id")
          .order("display_order", { ascending: true }),
        (supabase as any)
          .from("avatar_frame_collections")
          .select("id,slug,name,display_order")
          .order("display_order", { ascending: true }),
        (supabase as any)
          .from("achievement_definitions")
          .select("name,description,avatar_frame_id")
          .not("avatar_frame_id", "is", null),
      ]);
      if (cancel) return;
      const achMap = new Map<string, { name: string; description: string }>();
      ((aData ?? []) as any[]).forEach((a) => achMap.set(a.avatar_frame_id, { name: a.name, description: a.description }));
      const merged: CatalogRow[] = ((fData ?? []) as any[]).map((f) => ({
        ...f,
        ach_name: achMap.get(f.id)?.name ?? null,
        ach_description: achMap.get(f.id)?.description ?? null,
      }));
      setFrames(merged);
      setCollections((cData ?? []) as CollectionRow[]);
      setLoading(false);
    })();
    return () => { cancel = true; };
  }, []);

  const ownedMap = useMemo(() => {
    const m = new Map<string, { equipped: boolean; is_permanent: boolean; expires_at: string | null }>();
    owned.forEach((o) => m.set(o.frame_id, { equipped: o.equipped, is_permanent: o.is_permanent, expires_at: o.expires_at }));
    return m;
  }, [owned]);

  const grouped = useMemo(() => {
    const byCol = new Map<string, CatalogRow[]>();
    frames.forEach((f) => {
      const k = f.collection_id ?? "other";
      if (!byCol.has(k)) byCol.set(k, []);
      byCol.get(k)!.push(f);
    });
    return collections
      .map((c) => ({ collection: c, items: byCol.get(c.id) ?? [] }))
      .filter((g) => g.items.length > 0);
  }, [frames, collections]);

  const unlockedCount = owned.length;

  async function onEquip(frameId: string | null, name: string) {
    setBusy(frameId ?? "__clear__");
    try {
      await equipAvatarFrame(frameId);
      toast.success(frameId ? `${name} equipped` : "Frame cleared");
      await refreshOwned();
    } catch (e) {
      toast.error((e as Error).message || "Couldn't equip frame");
    } finally {
      setBusy(null);
    }
  }

  return (
    <AppShell>
      <div className="max-w-5xl mx-auto px-4 py-6">
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
            <span className="text-muted-foreground">/ {frames.length || 81} unlocked</span>
          </div>
        </header>

        {loading ? (
          <CrownLoader fullscreen={false} label="Loading royal frames…" />
        ) : (
          <div className="space-y-8">
            {grouped.map(({ collection, items }) => (
              <section key={collection.id}>
                <div className="flex items-baseline justify-between mb-3">
                  <h2 className="font-display text-xl text-gold">{collection.name}</h2>
                  <span className="text-[10px] uppercase tracking-wider text-muted-foreground">
                    {items.length} frames
                  </span>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
                  {items.map((f) => {
                    const own = ownedMap.get(f.id);
                    const unlocked = !!own;
                    const equipped = !!own?.equipped;
                    const url = f.static_asset_url || f.thumbnail_asset_url;
                    return (
                      <article
                        key={f.id}
                        className={`royal-card p-3 flex flex-col items-center text-center relative overflow-hidden transition ${
                          equipped ? "ring-2 ring-gold shadow-[0_0_28px_hsl(var(--gold)/0.35)]" : ""
                        }`}
                      >
                        {equipped && (
                          <span className="absolute top-2 right-2 inline-flex items-center gap-1 rounded-full bg-gold/20 border border-gold/50 px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider text-gold">
                            <Check size={10} /> Equipped
                          </span>
                        )}
                        <div className={`relative w-32 h-32 mb-2 ${!unlocked ? "grayscale opacity-50" : ""}`}>
                          {url ? (
                            <img
                              src={url}
                              alt={f.name}
                              className="w-full h-full object-contain drop-shadow-[0_0_18px_hsl(var(--gold)/0.5)]"
                              loading="lazy"
                            />
                          ) : (
                            <div className="w-full h-full rounded-full bg-muted flex items-center justify-center">
                              <Crown className="text-gold/40" size={32} />
                            </div>
                          )}
                          {!unlocked && (
                            <div className="absolute inset-0 flex items-center justify-center">
                              <div className="rounded-full bg-background/70 p-2 backdrop-blur-sm">
                                <Lock size={18} className="text-muted-foreground" />
                              </div>
                            </div>
                          )}
                        </div>
                        <h3 className="font-display text-sm text-gold leading-tight">{f.name}</h3>
                        {f.description && (
                          <p className="text-[10px] text-muted-foreground mt-0.5 leading-snug line-clamp-2">
                            {f.description}
                          </p>
                        )}
                        <div className="w-full mt-2 pt-2 border-t border-gold/10">
                          <div className="text-[9px] uppercase tracking-wider text-gold/70 mb-1">How to unlock</div>
                          <p className="text-[10px] text-foreground/80 leading-snug min-h-[2.2em]">
                            {f.ach_description || f.ach_name || "Complete a hidden achievement"}
                          </p>
                        </div>
                        <div className="w-full mt-3">
                          {unlocked ? (
                            equipped ? (
                              <button
                                onClick={() => onEquip(null, f.name)}
                                disabled={busy !== null}
                                className="w-full text-[11px] font-bold py-1.5 rounded-md border border-gold/40 text-gold hover:bg-gold/10 disabled:opacity-50"
                              >
                                Unequip
                              </button>
                            ) : (
                              <button
                                onClick={() => onEquip(f.id, f.name)}
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
