import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import AppShell from "@/components/AppShell";
import { Crown, Lock, Sparkles, Check, Search, ChevronLeft, ChevronRight } from "lucide-react";
import { toast } from "sonner";
import CrownLoader from "@/components/CrownLoader";
import { useSeoMeta } from "@/hooks/useSeoMeta";
import { useCrownGallery, equipAchievementCrown, type CrownGalleryRow } from "@/hooks/useCrownGallery";

const PAGE_SIZE = 12;
const EXPECTED_TOTAL = 100;

type Filter = "all" | "locked" | "unlocked" | "equipped" | string;

const RARITY_STYLE: Record<string, string> = {
  common: "text-slate-300 border-slate-500/40",
  uncommon: "text-emerald-300 border-emerald-500/40",
  rare: "text-sky-300 border-sky-500/40",
  epic: "text-fuchsia-300 border-fuchsia-500/40",
  legendary: "text-amber-300 border-amber-500/40",
  mythic: "text-rose-300 border-rose-500/40",
};

function sortRows(rows: CrownGalleryRow[]): CrownGalleryRow[] {
  const rank = (r: CrownGalleryRow) => (r.equipped ? 0 : r.owned ? 1 : 2);
  return [...rows].sort((a, b) => {
    const d = rank(a) - rank(b);
    if (d !== 0) return d;
    return (a.sort_order ?? 0) - (b.sort_order ?? 0);
  });
}

function filterRows(rows: CrownGalleryRow[], filter: Filter, query: string): CrownGalleryRow[] {
  const q = query.trim().toLowerCase();
  return rows.filter((r) => {
    if (filter === "unlocked" && !r.owned) return false;
    if (filter === "locked" && r.owned) return false;
    if (filter === "equipped" && !r.equipped) return false;
    if (
      filter !== "all" &&
      filter !== "unlocked" &&
      filter !== "locked" &&
      filter !== "equipped"
    ) {
      if (r.collection_slug !== filter) return false;
    }
    if (q) {
      const hay = [r.name, r.description ?? "", r.collection_name, r.unlock_hint ?? ""]
        .join(" ")
        .toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });
}

export default function AchievementCrowns() {
  useSeoMeta({
    title: "Achievement Crowns · CrownMe",
    description:
      "Collect all 100 CrownMe Achievement Crowns across ten themed collections. Track your progress, equip a crown, and show off your journey.",
  });

  const { rows, collections, ownedCount, totalCount, loading, error, refresh } = useCrownGallery();
  const [searchParams, setSearchParams] = useSearchParams();
  const [filter, setFilter] = useState<Filter>("all");
  const [query, setQuery] = useState("");
  const [busy, setBusy] = useState<string | null>(null);

  const sorted = useMemo(() => sortRows(rows), [rows]);
  const filtered = useMemo(() => filterRows(sorted, filter, query), [sorted, filter, query]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const rawPage = parseInt(searchParams.get("page") ?? "1", 10);
  const page = Number.isFinite(rawPage) ? Math.min(Math.max(1, rawPage), totalPages) : 1;

  useEffect(() => {
    const cur = parseInt(searchParams.get("page") ?? "1", 10);
    if (!Number.isFinite(cur) || cur < 1 || cur > totalPages) {
      const p = new URLSearchParams(searchParams);
      p.set("page", String(page));
      setSearchParams(p, { replace: true });
    }
  }, [totalPages, page, searchParams, setSearchParams]);

  const start = (page - 1) * PAGE_SIZE;
  const pageRows = filtered.slice(start, start + PAGE_SIZE);
  const percent = Math.round((ownedCount / EXPECTED_TOTAL) * 100);

  function changeFilter(next: Filter) {
    setFilter(next);
    const p = new URLSearchParams(searchParams);
    p.set("page", "1");
    setSearchParams(p, { replace: true });
  }

  function goToPage(n: number) {
    const clamped = Math.min(Math.max(1, n), totalPages);
    const p = new URLSearchParams(searchParams);
    p.set("page", String(clamped));
    setSearchParams(p);
    document.getElementById("crown-gallery-heading")?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  async function onEquip(row: CrownGalleryRow, unequip: boolean) {
    setBusy(row.crown_id);
    try {
      await equipAchievementCrown(unequip ? null : row.crown_id);
      toast.success(unequip ? "Crown unequipped" : `${row.name} equipped`);
      await refresh();
    } catch (e) {
      toast.error((e as Error).message || "Couldn't update your crown");
    } finally {
      setBusy(null);
    }
  }

  return (
    <AppShell>
      <div className="max-w-6xl mx-auto px-4 py-6 pb-32">
        <header className="mb-6 text-center" id="crown-gallery-heading">
          <div className="inline-flex items-center gap-2 mb-2">
            <Crown className="text-gold" size={20} />
            <span className="text-[10px] uppercase tracking-[0.24em] text-gold/80">Achievement Rewards</span>
            <Crown className="text-gold" size={20} />
          </div>
          <h1 className="font-display text-3xl lg:text-4xl">Achievement Crowns</h1>
          <p className="text-muted-foreground text-sm mt-2 max-w-xl mx-auto">
            Collect {EXPECTED_TOTAL} unique crowns across ten themed collections — from Origin to Legend — by battling, creating, and reigning on CrownMe.
          </p>

          <div className="mt-4 max-w-md mx-auto">
            <div className="flex items-baseline justify-between text-xs mb-1.5">
              <span className="text-gold font-bold tabular-nums">
                {ownedCount} of {EXPECTED_TOTAL} unlocked
              </span>
              <span className="text-muted-foreground">
                {EXPECTED_TOTAL} total crowns · {percent}%
              </span>
            </div>
            <div
              role="progressbar"
              aria-label="Achievement crowns unlocked"
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

          {!loading && !error && totalCount > 0 && totalCount !== EXPECTED_TOTAL && (
            <div className="mt-3 mx-auto max-w-md rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive">
              Catalog anomaly: expected {EXPECTED_TOTAL} crowns but loaded {totalCount}.
            </div>
          )}
        </header>

        <div className="mb-5 space-y-3">
          <div className="flex flex-col sm:flex-row gap-2 max-w-2xl mx-auto">
            <div className="relative flex-1">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <input
                type="text"
                value={query}
                onChange={(e) => {
                  setQuery(e.target.value);
                  const p = new URLSearchParams(searchParams);
                  p.set("page", "1");
                  setSearchParams(p, { replace: true });
                }}
                placeholder="Search crowns, collections, or unlock hints…"
                className="w-full pl-9 pr-3 py-2 text-sm rounded-md bg-background border border-border focus:outline-none focus:border-gold/60"
                aria-label="Search Achievement Crowns"
              />
            </div>
            <select
              value={collections.some((c) => c.slug === filter) ? filter : "__all_collections__"}
              onChange={(e) => changeFilter(e.target.value === "__all_collections__" ? "all" : e.target.value)}
              aria-label="Filter by collection"
              className="sm:w-64 px-3 py-2 text-sm rounded-md bg-background border border-border focus:outline-none focus:border-gold/60"
            >
              <option value="__all_collections__">All collections ({collections.length})</option>
              {collections.map((c) => (
                <option key={c.slug} value={c.slug}>
                  {c.name} · {c.owned}/{c.total}
                </option>
              ))}
            </select>
          </div>
          <div className="flex flex-wrap justify-center gap-2">
            <Chip label={`All · ${rows.length}`} active={filter === "all"} onClick={() => changeFilter("all")} />
            <Chip label={`Unlocked · ${ownedCount}`} active={filter === "unlocked"} onClick={() => changeFilter("unlocked")} />
            <Chip label={`Locked · ${rows.length - ownedCount}`} active={filter === "locked"} onClick={() => changeFilter("locked")} />
            <Chip label={`Equipped · ${rows.filter((r) => r.equipped).length}`} active={filter === "equipped"} onClick={() => changeFilter("equipped")} />
            {collections.map((c) => (
              <Chip
                key={c.slug}
                label={`${c.name} · ${c.owned}/${c.total}`}
                active={filter === c.slug}
                onClick={() => changeFilter(c.slug)}
              />
            ))}
          </div>
        </div>

        {loading ? (
          <div data-testid="crowns-loading">
            <CrownLoader fullscreen={false} label="Loading achievement crowns…" />
          </div>
        ) : error ? (
          <div className="text-center py-12">
            <p className="text-sm text-destructive mb-3">The crown catalog is temporarily unavailable.</p>
            <button
              onClick={() => void refresh()}
              className="text-xs px-3 py-1.5 rounded-md border border-gold/40 text-gold hover:bg-gold/10"
            >
              Retry
            </button>
          </div>
        ) : filtered.length === 0 ? (
          <p className="text-center text-sm text-muted-foreground py-12">No crowns match these filters.</p>
        ) : (
          <>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4" data-testid="crowns-grid">
              {pageRows.map((row) => (
                <CrownCard
                  key={row.crown_id}
                  row={row}
                  onEquip={onEquip}
                  busy={busy === row.crown_id}
                  disabled={busy !== null}
                />
              ))}
            </div>

            <nav className="mt-8 flex flex-col items-center gap-2" aria-label="Crown gallery pagination">
              <div className="text-xs text-muted-foreground">
                Showing {start + 1}–{Math.min(start + PAGE_SIZE, filtered.length)} of {filtered.length}
              </div>
              <div className="text-[11px] uppercase tracking-wider text-gold/80">
                Page {page} of {totalPages}
              </div>
              <div className="flex items-center gap-1 flex-wrap justify-center">
                <PageBtn onClick={() => goToPage(page - 1)} disabled={page === 1} label="Previous">
                  <ChevronLeft size={14} />
                </PageBtn>
                {Array.from({ length: totalPages }).map((_, i) => {
                  const n = i + 1;
                  return (
                    <button
                      key={n}
                      onClick={() => goToPage(n)}
                      aria-current={n === page ? "page" : undefined}
                      aria-label={`Page ${n}`}
                      className={`h-8 min-w-[2rem] px-2 rounded-md text-xs font-bold border transition ${
                        n === page
                          ? "bg-gradient-gold text-black border-gold"
                          : "border-border text-muted-foreground hover:border-gold/40 hover:text-gold"
                      }`}
                    >
                      {n}
                    </button>
                  );
                })}
                <PageBtn onClick={() => goToPage(page + 1)} disabled={page === totalPages} label="Next">
                  <ChevronRight size={14} />
                </PageBtn>
              </div>
            </nav>
          </>
        )}
      </div>
    </AppShell>
  );
}

function Chip({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={`text-[11px] px-3 py-1.5 rounded-full border transition ${
        active
          ? "bg-gold/20 border-gold text-gold"
          : "border-border/70 bg-background/40 text-foreground/85 hover:border-gold/50 hover:text-gold"
      }`}
    >
      {label}
    </button>
  );
}

function PageBtn({
  children,
  onClick,
  disabled,
  label,
}: {
  children: React.ReactNode;
  onClick: () => void;
  disabled?: boolean;
  label: string;
}) {
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

function CrownCard({
  row,
  onEquip,
  busy,
  disabled,
}: {
  row: CrownGalleryRow;
  onEquip: (row: CrownGalleryRow, unequip: boolean) => void;
  busy: boolean;
  disabled: boolean;
}) {
  const rarityStyle = RARITY_STYLE[row.rarity] ?? RARITY_STYLE.common;
  const pct = Math.max(0, Math.min(100, Math.round(Number(row.completion_percent) || 0)));
  const isSecretLocked = row.is_secret && !row.owned;

  return (
    <article
      className={`royal-card flex flex-col text-center overflow-hidden transition ${
        row.equipped ? "ring-2 ring-gold shadow-[0_0_28px_hsl(var(--gold)/0.35)]" : ""
      }`}
      data-crown-slug={row.slug}
    >
      <div className="relative w-full" style={{ aspectRatio: "1 / 1" }}>
        <span className="absolute top-2 left-2 z-10 rounded-full bg-background/70 backdrop-blur-sm px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider border border-border text-muted-foreground">
          {row.owned ? "Unlocked" : "Locked"}
        </span>
        {row.equipped && (
          <span className="absolute top-2 right-2 z-10 inline-flex items-center gap-1 rounded-full bg-gold/20 border border-gold/50 px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider text-gold">
            <Check size={10} /> Equipped
          </span>
        )}
        <div className="absolute inset-0 flex items-center justify-center p-[10%]">
          {isSecretLocked ? (
            <div className="w-full h-full rounded-full bg-muted/40 border border-border flex items-center justify-center">
              <Lock className="text-muted-foreground" size={32} />
            </div>
          ) : (
            <img
              src={row.gallery_asset_url || row.asset_url}
              alt={row.name}
              loading="lazy"
              className={`w-full h-full object-contain drop-shadow-[0_0_18px_hsl(var(--gold)/0.35)] transition ${
                row.owned ? "" : "opacity-40 grayscale"
              }`}
            />
          )}
        </div>
        {!row.owned && !isSecretLocked && (
          <div className="absolute bottom-2 right-2">
            <div className="rounded-full bg-background/80 p-1.5 backdrop-blur-sm border border-border">
              <Lock size={12} className="text-muted-foreground" />
            </div>
          </div>
        )}
      </div>

      <div className="px-3 pb-3 pt-2 flex-1 flex flex-col">
        <h3 className="font-display text-sm text-gold leading-tight truncate">
          {isSecretLocked ? "???" : row.name}
        </h3>
        <div className="mt-1 flex items-center justify-center gap-1.5 text-[10px]">
          <span className="text-gold/70 uppercase tracking-wider truncate">{row.collection_name}</span>
          <span className={`rounded-full border px-1.5 py-0.5 uppercase tracking-wider ${rarityStyle}`}>
            {row.rarity}
          </span>
        </div>

        {!row.owned && !isSecretLocked && (
          <div className="mt-2">
            <div className="h-1.5 rounded-full bg-muted overflow-hidden">
              <div className="h-full bg-gradient-gold transition-[width] duration-500" style={{ width: `${pct}%` }} />
            </div>
            <div className="mt-1 flex items-center justify-between text-[10px] text-muted-foreground tabular-nums">
              <span>
                {Math.floor(Number(row.progress) || 0).toLocaleString()} /{" "}
                {Math.floor(Number(row.target) || 0).toLocaleString()}
              </span>
              <span>{pct}%</span>
            </div>
            {row.unlock_hint && (
              <p className="mt-1 text-[10px] text-muted-foreground leading-snug line-clamp-2">{row.unlock_hint}</p>
            )}
          </div>
        )}

        {row.owned && !isSecretLocked && row.description && (
          <p className="mt-2 text-[10px] text-muted-foreground leading-snug line-clamp-2">{row.description}</p>
        )}

        <div className="mt-3 pt-2 border-t border-gold/10">
          {row.owned ? (
            row.equipped ? (
              <button
                onClick={() => onEquip(row, true)}
                disabled={disabled}
                className="w-full text-[11px] font-bold py-1.5 rounded-md border border-gold/40 text-gold hover:bg-gold/10 disabled:opacity-50"
              >
                {busy ? "…" : "Unequip"}
              </button>
            ) : (
              <button
                onClick={() => onEquip(row, false)}
                disabled={disabled}
                className="w-full text-[11px] font-bold py-1.5 rounded-md bg-gradient-gold text-black hover:opacity-90 disabled:opacity-50 inline-flex items-center justify-center gap-1"
              >
                <Sparkles size={11} /> {busy ? "…" : "Equip"}
              </button>
            )
          ) : (
            <button
              disabled
              className="w-full text-[11px] font-bold py-1.5 rounded-md border border-border text-muted-foreground"
            >
              Locked
            </button>
          )}
        </div>
      </div>
    </article>
  );
}
