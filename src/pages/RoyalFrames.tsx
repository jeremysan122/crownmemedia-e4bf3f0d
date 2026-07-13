import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import AppShell from "@/components/AppShell";
import { Crown, Lock, Sparkles, Check, Search, ChevronLeft, ChevronRight } from "lucide-react";
import { toast } from "sonner";
import CrownLoader from "@/components/CrownLoader";
import { useSeoMeta } from "@/hooks/useSeoMeta";
import { useFrameGallery, type FrameGalleryItem } from "@/hooks/useFrameGallery";
import { equipAvatarFrame } from "@/hooks/useMyAchievements";
import { extractRequirements, formatRequirementLine } from "@/lib/frameUnlockText";

const PAGE_SIZE = 9;
const EXPECTED_TOTAL = 81;

type Filter = "all" | "locked" | "unlocked" | "equipped" | string; // string = collection id

export default function RoyalFrames() {
  useSeoMeta({
    title: "Royal Avatar Frames · CrownMe",
    description:
      "Explore all 81 ornate Royal Avatar Frames. Each frame is earned through a specific CrownMe achievement — see the exact unlock, your progress, and equip the frames you've earned.",
  });

  const { items, collections, ownedCount, totalCount, loading, error, refresh } = useFrameGallery();
  const [searchParams, setSearchParams] = useSearchParams();
  const [filter, setFilter] = useState<Filter>("all");
  const [query, setQuery] = useState("");
  const [busy, setBusy] = useState<string | null>(null);

  const filtered = useMemo(() => filterItems(items, filter, query), [items, filter, query]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const rawPage = parseInt(searchParams.get("page") ?? "1", 10);
  const page = Number.isFinite(rawPage) ? Math.min(Math.max(1, rawPage), totalPages) : 1;

  useEffect(() => {
    // Snap invalid page numbers to a valid one without stomping the query string.
    const current = parseInt(searchParams.get("page") ?? "1", 10);
    if (!Number.isFinite(current) || current < 1 || current > totalPages) {
      const next = new URLSearchParams(searchParams);
      next.set("page", String(page));
      setSearchParams(next, { replace: true });
    }
  }, [totalPages, page, searchParams, setSearchParams]);

  const start = (page - 1) * PAGE_SIZE;
  const pageItems = filtered.slice(start, start + PAGE_SIZE);

  const percent = Math.round((ownedCount / EXPECTED_TOTAL) * 100);
  const catalogHealthy = !loading && !error && totalCount === EXPECTED_TOTAL;

  function goToPage(next: number) {
    const clamped = Math.min(Math.max(1, next), totalPages);
    const params = new URLSearchParams(searchParams);
    params.set("page", String(clamped));
    setSearchParams(params);
    // Scroll the header into view without slamming to the top of the app.
    document.getElementById("royal-frames-heading")?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  function changeFilter(next: Filter) {
    setFilter(next);
    const params = new URLSearchParams(searchParams);
    params.set("page", "1");
    setSearchParams(params, { replace: true });
  }

  async function onEquip(item: FrameGalleryItem, unequip: boolean) {
    const id = item.frame.id;
    setBusy(id);
    try {
      await equipAvatarFrame(unequip ? null : id);
      toast.success(unequip ? "Frame unequipped" : `${item.frame.name} equipped`);
      await refresh();
    } catch (e) {
      toast.error((e as Error).message || "Couldn't update your frame");
    } finally {
      setBusy(null);
    }
  }

  return (
    <AppShell>
      <div className="max-w-6xl mx-auto px-4 py-6 pb-32">
        <header className="mb-6 text-center" id="royal-frames-heading">
          <div className="inline-flex items-center gap-2 mb-2">
            <Crown className="text-gold" size={20} />
            <span className="text-[10px] uppercase tracking-[0.24em] text-gold/80">Achievement Rewards</span>
            <Crown className="text-gold" size={20} />
          </div>
          <h1 className="font-display text-3xl lg:text-4xl">Royal Avatar Frames</h1>
          <p className="text-muted-foreground text-sm mt-2 max-w-xl mx-auto">
            Earn crowns, defend cities, and hit royal milestones to unlock {EXPECTED_TOTAL} ornate frames that decorate your profile avatar.
          </p>

          <div className="mt-4 max-w-md mx-auto">
            <div className="flex items-baseline justify-between text-xs mb-1.5">
              <span className="text-gold font-bold tabular-nums">
                {ownedCount} of {EXPECTED_TOTAL} unlocked
              </span>
              <span className="text-muted-foreground">
                {EXPECTED_TOTAL} total frames · {percent}%
              </span>
            </div>
            <div
              role="progressbar"
              aria-label="Avatar frames unlocked"
              aria-valuemin={0}
              aria-valuemax={EXPECTED_TOTAL}
              aria-valuenow={ownedCount}
              className="h-2 w-full rounded-full bg-muted overflow-hidden border border-gold/20"
            >
              <div
                className="h-full bg-gradient-gold transition-[width] duration-500"
                style={{ width: `${percent}%` }}
              />
            </div>
          </div>

          {!loading && !error && totalCount !== EXPECTED_TOTAL && (
            <div className="mt-3 mx-auto max-w-md rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive">
              Catalog anomaly: expected {EXPECTED_TOTAL} frames but loaded {totalCount}. Some frames may be hidden.
            </div>
          )}
        </header>

        {/* Filters + search */}
        <div className="mb-5 space-y-3">
          <div className="relative max-w-md mx-auto">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <input
              type="text"
              value={query}
              onChange={(e) => { setQuery(e.target.value); const p = new URLSearchParams(searchParams); p.set("page", "1"); setSearchParams(p, { replace: true }); }}
              placeholder="Search frames or achievements…"
              className="w-full pl-9 pr-3 py-2 text-sm rounded-md bg-background border border-border focus:outline-none focus:border-gold/60"
              aria-label="Search Royal Frames"
            />
          </div>
          <div className="flex flex-wrap justify-center gap-2">
            <FilterChip label={`All Frames · ${items.length}`} active={filter === "all"} onClick={() => changeFilter("all")} />
            <FilterChip label={`Unlocked · ${items.filter((i) => i.ownership).length}`} active={filter === "unlocked"} onClick={() => changeFilter("unlocked")} />
            <FilterChip label={`Locked · ${items.filter((i) => !i.ownership).length}`} active={filter === "locked"} onClick={() => changeFilter("locked")} />
            <FilterChip label={`Equipped · ${items.filter((i) => i.ownership?.equipped).length}`} active={filter === "equipped"} onClick={() => changeFilter("equipped")} />
            {collections.map((c) => {
              const n = items.filter((i) => i.frame.collection_id === c.id).length;
              return (
                <FilterChip
                  key={c.id}
                  label={`${c.name} · ${n}`}
                  active={filter === c.id}
                  onClick={() => changeFilter(c.id)}
                />
              );
            })}
          </div>
        </div>

        {loading ? (
          <CrownLoader fullscreen={false} label="Loading royal frames…" />
        ) : error ? (
          <div className="text-center py-12">
            <p className="text-sm text-destructive mb-3">The Royal Frames catalog is temporarily unavailable.</p>
            <button onClick={() => void refresh()} className="text-xs px-3 py-1.5 rounded-md border border-gold/40 text-gold hover:bg-gold/10">
              Retry
            </button>
          </div>
        ) : filtered.length === 0 ? (
          <p className="text-center text-sm text-muted-foreground py-12">No frames match these filters.</p>
        ) : (
          <>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4" data-testid="frames-grid">
              {pageItems.map((item) => (
                <FrameCard
                  key={item.frame.id}
                  item={item}
                  onEquip={onEquip}
                  busy={busy === item.frame.id}
                  disabled={busy !== null}
                />
              ))}
            </div>

            <nav
              className="mt-8 flex flex-col items-center gap-2"
              aria-label="Royal Frames pagination"
            >
              <div className="text-xs text-muted-foreground" data-testid="pagination-summary">
                Showing {start + 1}–{Math.min(start + PAGE_SIZE, filtered.length)} of {filtered.length}
              </div>
              <div className="text-[11px] uppercase tracking-wider text-gold/80" data-testid="pagination-page">
                Page {page} of {totalPages}
              </div>
              <div className="flex items-center gap-1 flex-wrap justify-center">
                <PageButton onClick={() => goToPage(1)} disabled={page === 1} label="First">«</PageButton>
                <PageButton onClick={() => goToPage(page - 1)} disabled={page === 1} label="Previous">
                  <ChevronLeft size={14} />
                </PageButton>
                {Array.from({ length: totalPages }).map((_, i) => {
                  const n = i + 1;
                  return (
                    <button
                      key={n}
                      onClick={() => goToPage(n)}
                      aria-current={n === page ? "page" : undefined}
                      aria-label={`Page ${n}`}
                      className={`h-8 min-w-[2rem] px-2 rounded-md text-xs font-bold border transition ${
                        n === page ? "bg-gradient-gold text-black border-gold" : "border-border text-muted-foreground hover:border-gold/40 hover:text-gold"
                      }`}
                    >
                      {n}
                    </button>
                  );
                })}
                <PageButton onClick={() => goToPage(page + 1)} disabled={page === totalPages} label="Next">
                  <ChevronRight size={14} />
                </PageButton>
                <PageButton onClick={() => goToPage(totalPages)} disabled={page === totalPages} label="Last">»</PageButton>
              </div>
            </nav>
          </>
        )}

        {catalogHealthy ? null : null /* placeholder retained for future admin diagnostics */}
      </div>
    </AppShell>
  );
}

function filterItems(items: FrameGalleryItem[], filter: Filter, query: string): FrameGalleryItem[] {
  const q = query.trim().toLowerCase();
  return items.filter((i) => {
    if (filter === "unlocked" && !i.ownership) return false;
    if (filter === "locked" && i.ownership) return false;
    if (filter === "equipped" && !i.ownership?.equipped) return false;
    if (filter !== "all" && filter !== "unlocked" && filter !== "locked" && filter !== "equipped") {
      if (i.frame.collection_id !== filter) return false;
    }
    if (q) {
      const haystack = [
        i.frame.name,
        i.frame.description ?? "",
        i.achievement?.name ?? "",
        i.achievement?.description ?? "",
      ]
        .join(" ")
        .toLowerCase();
      if (!haystack.includes(q)) return false;
    }
    return true;
  });
}

function FilterChip({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={`text-[11px] px-3 py-1.5 rounded-full border transition ${
        active ? "bg-gold/20 border-gold text-gold" : "border-border text-muted-foreground hover:border-gold/40 hover:text-gold"
      }`}
    >
      {label}
    </button>
  );
}

function PageButton({ children, onClick, disabled, label }: { children: React.ReactNode; onClick: () => void; disabled?: boolean; label: string }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      className="h-8 min-w-[2rem] px-2 rounded-md text-xs font-bold border border-border text-muted-foreground hover:border-gold/40 hover:text-gold disabled:opacity-40 disabled:pointer-events-none inline-flex items-center justify-center"
    >
      {children}
    </button>
  );
}

function FrameCard({
  item,
  onEquip,
  busy,
  disabled,
}: {
  item: FrameGalleryItem;
  onEquip: (item: FrameGalleryItem, unequip: boolean) => void;
  busy: boolean;
  disabled: boolean;
}) {
  const { frame, collection, achievement, ownership } = item;
  const unlocked = !!ownership;
  const equipped = !!ownership?.equipped;

  const artwork = frame.animated_asset_url || frame.static_asset_url || frame.thumbnail_asset_url;
  const requirements = achievement ? extractRequirements(achievement.requirement_logic) : [];

  return (
    <article
      className={`royal-card flex flex-col text-center overflow-hidden transition ${
        equipped ? "ring-2 ring-gold shadow-[0_0_28px_hsl(var(--gold)/0.35)]" : ""
      }`}
    >
      {/* Artwork stage — square, contain, generous padding, never cropped. */}
      <div className="relative w-full" style={{ aspectRatio: "1 / 1" }}>
        <div className="absolute inset-0 flex items-center justify-center p-4">
          {artwork ? (
            <img
              src={artwork}
              alt={frame.name}
              loading="lazy"
              onError={(e) => {
                const el = e.currentTarget;
                if (frame.thumbnail_asset_url && el.src !== frame.thumbnail_asset_url) {
                  el.src = frame.thumbnail_asset_url;
                } else {
                  el.style.visibility = "hidden";
                }
              }}
              className={`w-full h-full object-contain drop-shadow-[0_0_18px_hsl(var(--gold)/0.45)] ${
                !unlocked ? "grayscale opacity-60" : ""
              }`}
              style={{ objectPosition: "center" }}
            />
          ) : (
            <div className="w-full h-full rounded-full bg-muted/40 flex items-center justify-center text-muted-foreground text-[10px] uppercase tracking-wider">
              Artwork unavailable
            </div>
          )}
        </div>
        {!unlocked && (
          <div className="absolute inset-0 flex items-end justify-center p-3 pointer-events-none">
            <div className="rounded-full bg-background/80 p-2 backdrop-blur-sm border border-border">
              <Lock size={16} className="text-muted-foreground" />
            </div>
          </div>
        )}
        {equipped && (
          <span className="absolute top-2 right-2 inline-flex items-center gap-1 rounded-full bg-gold/20 border border-gold/50 px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider text-gold">
            <Check size={10} /> Equipped
          </span>
        )}
        <span
          className={`absolute top-2 left-2 rounded-full px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider border ${
            unlocked
              ? "bg-emerald-500/15 text-emerald-400 border-emerald-500/40"
              : "bg-muted/60 text-muted-foreground border-border"
          }`}
        >
          {unlocked ? "Unlocked" : "Locked"}
        </span>
      </div>

      <div className="px-4 pb-4 pt-2 flex-1 flex flex-col">
        <h3 className="font-display text-base text-gold leading-tight">{frame.name}</h3>
        {frame.description && (
          <p className="text-[11px] text-muted-foreground mt-1 leading-snug">{frame.description}</p>
        )}
        <div className="mt-1.5 flex items-center justify-center gap-2 text-[10px]">
          {collection && (
            <span className="text-gold/70 uppercase tracking-wider">{collection.name}</span>
          )}
          {frame.rarity && (
            <span className="rounded-full border border-gold/30 px-1.5 py-0.5 text-gold/80 uppercase tracking-wider">
              {frame.rarity}
            </span>
          )}
        </div>

        <div className="w-full mt-3 pt-3 border-t border-gold/10 text-left">
          <div className="text-[9px] uppercase tracking-wider text-gold/70 mb-1">How to unlock</div>
          {achievement ? (
            <>
              <div className="text-[11px] font-bold text-foreground">{achievement.name}</div>
              {achievement.description && (
                <p className="text-[10px] text-muted-foreground leading-snug mt-0.5">{achievement.description}</p>
              )}
              {requirements.length > 0 && (
                <ul className="mt-1.5 space-y-0.5">
                  {requirements.map((r) => (
                    <li key={r.key} className="text-[10px] text-foreground/80 leading-snug">
                      • {formatRequirementLine(r)}
                    </li>
                  ))}
                </ul>
              )}
            </>
          ) : (
            <p className="text-[10px] text-muted-foreground">Achievement details unavailable.</p>
          )}
        </div>

        <div className="w-full mt-3">
          {unlocked ? (
            equipped ? (
              <button
                onClick={() => onEquip(item, true)}
                disabled={disabled}
                className="w-full text-[11px] font-bold py-1.5 rounded-md border border-gold/40 text-gold hover:bg-gold/10 disabled:opacity-50"
              >
                {busy ? "Working…" : "Unequip"}
              </button>
            ) : (
              <button
                onClick={() => onEquip(item, false)}
                disabled={disabled}
                className="w-full text-[11px] font-bold py-1.5 rounded-md bg-gradient-gold text-black hover:opacity-90 disabled:opacity-50 inline-flex items-center justify-center gap-1"
              >
                <Sparkles size={11} /> {busy ? "Working…" : "Equip"}
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
}
