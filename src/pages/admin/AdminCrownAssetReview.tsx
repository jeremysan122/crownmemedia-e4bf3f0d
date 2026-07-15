// Pilot/admin review UI for the v2 crown asset pipeline. Lists every crown
// with all four asset URLs, current version, and quality-verified state so
// admins can visually confirm each pilot before ratifying the batch.
import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { RefreshCw, Check, X, Crown as CrownIcon } from "lucide-react";
import { useSeoMeta } from "@/hooks/useSeoMeta";

interface Row {
  crown_id: string;
  slug: string;
  name: string;
  rarity: string;
  tier_index: number;
  collection_slug: string;
  collection_name: string;
  asset_version: number;
  image_quality_verified: boolean;
  legacy_asset_url: string | null;
  master_asset_url: string | null;
  gallery_asset_url: string | null;
  wearable_asset_url: string | null;
  thumbnail_url: string | null;
  updated_at: string;
}

type Filter = "all" | "v2" | "v1" | "verified" | "pending";

export default function AdminCrownAssetReview() {
  useSeoMeta({ title: "Crown Asset Review · Admin", description: "Review and verify v2 crown assets." });
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [filter, setFilter] = useState<Filter>("v2");

  const load = useCallback(async () => {
    setLoading(true);
    const { data, error } = await (supabase as any).rpc("admin_crown_asset_review");
    if (error) toast.error(error.message);
    else setRows((data ?? []) as Row[]);
    setLoading(false);
  }, []);

  useEffect(() => { void load(); }, [load]);

  async function toggleVerified(row: Row, next: boolean) {
    setBusy(row.crown_id);
    const { error } = await (supabase as any).rpc("admin_verify_crown_asset", {
      _crown_id: row.crown_id,
      _verified: next,
    });
    setBusy(null);
    if (error) return toast.error(error.message);
    toast.success(next ? "Marked verified" : "Reverted to pending");
    setRows((prev) => prev.map((r) => (r.crown_id === row.crown_id ? { ...r, image_quality_verified: next } : r)));
  }

  const filtered = rows.filter((r) => {
    if (filter === "v2") return r.asset_version >= 2;
    if (filter === "v1") return (r.asset_version ?? 1) < 2;
    if (filter === "verified") return r.image_quality_verified;
    if (filter === "pending") return r.asset_version >= 2 && !r.image_quality_verified;
    return true;
  });

  const v2Count = rows.filter((r) => r.asset_version >= 2).length;
  const verifiedCount = rows.filter((r) => r.image_quality_verified).length;

  return (
    <div className="max-w-6xl mx-auto px-4 py-6">
      <header className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl flex items-center gap-2">
            <CrownIcon className="text-gold" size={22} /> Crown Asset Review
          </h1>
          <p className="text-sm text-muted-foreground">
            v2 pipeline: {v2Count}/{rows.length} migrated · {verifiedCount} verified
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {(["all", "v2", "v1", "verified", "pending"] as Filter[]).map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`text-xs font-bold px-3 py-1.5 rounded border ${
                filter === f
                  ? "bg-gold/20 border-gold/50 text-gold"
                  : "border-border text-muted-foreground hover:bg-muted/30"
              }`}
            >
              {f}
            </button>
          ))}
          <button
            onClick={load}
            disabled={loading}
            className="text-xs font-bold px-3 py-1.5 rounded border border-border hover:bg-muted/30 inline-flex items-center gap-1"
          >
            <RefreshCw size={12} className={loading ? "animate-spin" : ""} /> Refresh
          </button>
        </div>
      </header>

      {loading ? (
        <div className="royal-card p-8 text-center text-sm text-muted-foreground">Loading assets…</div>
      ) : filtered.length === 0 ? (
        <div className="royal-card p-8 text-center text-sm text-muted-foreground">No crowns match this filter.</div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {filtered.map((r) => {
            const isV2 = r.asset_version >= 2;
            return (
              <div key={r.crown_id} className="royal-card p-4">
                <div className="flex items-start justify-between gap-3 mb-3">
                  <div>
                    <div className="font-display text-base flex items-center gap-2">
                      {r.name}
                      <span className="text-[10px] uppercase tracking-wider text-muted-foreground">
                        {r.slug}
                      </span>
                    </div>
                    <div className="text-[11px] text-muted-foreground">
                      {r.collection_name} · {r.rarity} · v{r.asset_version ?? 1}
                    </div>
                  </div>
                  <div className="flex gap-1">
                    <span
                      className={`text-[10px] px-2 py-0.5 rounded-full border ${
                        isV2
                          ? "bg-emerald-500/10 border-emerald-500/40 text-emerald-300"
                          : "bg-slate-500/10 border-slate-500/40 text-slate-400"
                      }`}
                    >
                      {isV2 ? "v2" : "legacy"}
                    </span>
                    {r.image_quality_verified && (
                      <span className="text-[10px] px-2 py-0.5 rounded-full bg-gold/20 border border-gold/50 text-gold">
                        verified
                      </span>
                    )}
                  </div>
                </div>

                <div className="grid grid-cols-4 gap-2 mb-3">
                  {[
                    { url: r.thumbnail_url, label: "256" },
                    { url: r.gallery_asset_url, label: "768" },
                    { url: r.wearable_asset_url, label: "1024" },
                    { url: r.master_asset_url, label: "2048" },
                  ].map((slot) => (
                    <div key={slot.label} className="aspect-square rounded bg-muted/20 border border-border relative overflow-hidden">
                      {slot.url ? (
                        <a href={slot.url} target="_blank" rel="noreferrer">
                          <img
                            src={slot.url}
                            alt={slot.label}
                            loading="lazy"
                            className="w-full h-full object-contain"
                          />
                        </a>
                      ) : (
                        <div className="w-full h-full flex items-center justify-center text-[10px] text-muted-foreground">
                          missing
                        </div>
                      )}
                      <span className="absolute bottom-0.5 right-0.5 text-[9px] bg-background/70 rounded px-1">
                        {slot.label}
                      </span>
                    </div>
                  ))}
                </div>

                <div className="flex gap-2">
                  {r.image_quality_verified ? (
                    <button
                      onClick={() => toggleVerified(r, false)}
                      disabled={busy === r.crown_id}
                      className="flex-1 text-xs font-bold px-3 py-2 rounded border border-border hover:bg-muted/30 inline-flex items-center justify-center gap-1 disabled:opacity-50"
                    >
                      <X size={12} /> Revert to pending
                    </button>
                  ) : (
                    <button
                      onClick={() => toggleVerified(r, true)}
                      disabled={busy === r.crown_id || !isV2}
                      className="flex-1 text-xs font-bold px-3 py-2 rounded bg-gradient-gold text-black inline-flex items-center justify-center gap-1 disabled:opacity-40"
                    >
                      <Check size={12} /> Mark verified
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
