import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import AppShell from "@/components/AppShell";
import { supabase } from "@/integrations/supabase/client";
import { Crown, Search, Sparkles, MapPin, List, Globe2, Upload, Loader2, Flame, Share2, SlidersHorizontal, X, Radio, Pause, TrendingUp, Bookmark, BookmarkCheck, Info, Copy, History, HelpCircle, ChevronDown } from "lucide-react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { formatScore, CATEGORIES, CATEGORY_LABEL, type CrownCategory } from "@/lib/crown";
import { CategoryBadge, CATEGORY_GRADIENT, CATEGORY_ICON } from "@/lib/categoryIcons";
import { useAuth } from "@/context/AuthContext";
import { useRealtimeChannel } from "@/hooks/useRealtimeChannel";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { lookupGeo, fallbackCoord, type LatLng } from "@/lib/geoCoords";
import { toast } from "sonner";
import mapboxgl from "mapbox-gl";
import "mapbox-gl/dist/mapbox-gl.css";
import { useMapboxToken } from "@/hooks/useMapboxToken";
import { trackUsage } from "@/lib/usageTrack";

type Scope = "all" | "global" | "country" | "state" | "city";
type View = "list" | "map";

type Row = {
  region_name: string;
  region_type: "global" | "country" | "state" | "city";
  user_id: string;
  post_id: string | null;
  crown_score: number;
  category: CrownCategory;
  profile: { username: string; profile_photo_url: string | null } | null;
};

const PAGE_SIZE = 60;
const STORAGE_KEY = "crownmap.prefs.v1";
const BOOKMARKS_KEY = "crownmap.bookmarks.v1";
const SHARE_HISTORY_KEY = "crownmap.share.v1";

type Prefs = { scope: Scope; category: CrownCategory; q: string; view: View; mine: boolean; heat: boolean };

type Bookmark = { region_type: Row["region_type"]; region_name: string; category: CrownCategory; addedAt: number };
type ShareEntry = { url: string; at: number; label: string };

function loadPrefs(): Partial<Prefs> {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}"); } catch { return {}; }
}
function savePrefs(p: Prefs) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(p)); } catch { /* ignore */ }
}
function loadBookmarks(): Bookmark[] {
  try { return JSON.parse(localStorage.getItem(BOOKMARKS_KEY) || "[]"); } catch { return []; }
}
function saveBookmarks(b: Bookmark[]) {
  try { localStorage.setItem(BOOKMARKS_KEY, JSON.stringify(b)); } catch { /* ignore */ }
}
function loadShareHistory(): ShareEntry[] {
  try { return JSON.parse(localStorage.getItem(SHARE_HISTORY_KEY) || "[]"); } catch { return []; }
}
function pushShareHistory(entry: ShareEntry) {
  try {
    const cur = loadShareHistory().filter((e) => e.url !== entry.url);
    const next = [entry, ...cur].slice(0, 6);
    localStorage.setItem(SHARE_HISTORY_KEY, JSON.stringify(next));
  } catch { /* ignore */ }
}

function useIsScrolling(idleMs = 250) {
  const [scrolling, setScrolling] = useState(false);
  useEffect(() => {
    let t: number | null = null;
    const onScroll = () => {
      setScrolling(true);
      if (t) window.clearTimeout(t);
      t = window.setTimeout(() => setScrolling(false), idleMs);
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      window.removeEventListener("scroll", onScroll);
      if (t) window.clearTimeout(t);
    };
  }, [idleMs]);
  return scrolling;
}

function useDocumentVisible() {
  const [v, setV] = useState(typeof document === "undefined" ? true : document.visibilityState === "visible");
  useEffect(() => {
    const h = () => setV(document.visibilityState === "visible");
    document.addEventListener("visibilitychange", h);
    return () => document.removeEventListener("visibilitychange", h);
  }, []);
  return v;
}

function useOnScreen<T extends HTMLElement>(): [React.RefObject<T>, boolean] {
  const ref = useRef<T>(null);
  const [onScreen, setOnScreen] = useState(true);
  useEffect(() => {
    if (!ref.current || typeof IntersectionObserver === "undefined") return;
    const obs = new IntersectionObserver(([e]) => setOnScreen(e.isIntersecting), { threshold: 0.05 });
    obs.observe(ref.current);
    return () => obs.disconnect();
  }, []);
  return [ref, onScreen];
}

function useOnline() {
  const [online, setOnline] = useState(typeof navigator === "undefined" ? true : navigator.onLine);
  useEffect(() => {
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    window.addEventListener("online", on);
    window.addEventListener("offline", off);
    return () => { window.removeEventListener("online", on); window.removeEventListener("offline", off); };
  }, []);
  return online;
}

export default function CrownMap() {
  const { user } = useAuth();
  useEffect(() => { trackUsage("crown_map_opened"); }, []);
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const stored = useMemo(loadPrefs, []);
  const online = useOnline();

  const [scope, setScope] = useState<Scope>(((params.get("scope") as Scope) || (stored.scope as Scope) || "all"));
  const [category, setCategory] = useState<CrownCategory>(((params.get("category") as CrownCategory) || (stored.category as CrownCategory) || "overall"));
  const [query, setQuery] = useState<string>(params.get("q") ?? stored.q ?? "");
  const [view, setView] = useState<View>(((params.get("view") as View) || (stored.view as View) || "list"));
  const [mineOnly, setMineOnly] = useState<boolean>(params.get("mine") === "1" || (params.get("mine") == null && !!stored.mine));
  const [heat, setHeat] = useState<boolean>(params.get("heat") === "1" || (params.get("heat") == null && !!stored.heat));

  const [holderQ, setHolderQ] = useState<string>(params.get("holder") ?? "");
  const [exactName, setExactName] = useState<boolean>(params.get("exact") === "1");
  const [minScore, setMinScore] = useState<string>(params.get("min") ?? "");
  const [advOpen, setAdvOpen] = useState<boolean>(!!(params.get("holder") || params.get("exact") || params.get("min")));
  // On mobile/tablet (below lg) the filter panel collapses by default so the
  // List/Map toggle and search are reachable without scrolling past Realm/Category.
  // Persisted across reloads + navigation so the user's preferred density sticks.
  const [mobileFiltersOpen, setMobileFiltersOpen] = useState<boolean>(() => {
    if (typeof window === "undefined") return false;
    try { return window.localStorage.getItem("crownmap.filtersOpen.v1") === "1"; } catch { return false; }
  });
  useEffect(() => {
    try { window.localStorage.setItem("crownmap.filtersOpen.v1", mobileFiltersOpen ? "1" : "0"); } catch {}
  }, [mobileFiltersOpen]);

  // Track the lg breakpoint so we can stage filter edits as drafts on
  // mobile/tablet — changes only commit when the user taps Apply, avoiding
  // re-fetches between every toggle.
  const [isCompact, setIsCompact] = useState<boolean>(() =>
    typeof window !== "undefined" && window.matchMedia("(max-width: 1023px)").matches,
  );
  useEffect(() => {
    if (typeof window === "undefined") return;
    const mql = window.matchMedia("(max-width: 1023px)");
    const upd = () => setIsCompact(mql.matches);
    mql.addEventListener("change", upd);
    return () => mql.removeEventListener("change", upd);
  }, []);

  // Draft mirrors of the filters that get staged while the mobile panel is open.
  const [draftScope, setDraftScope] = useState<Scope>(scope);
  const [draftCategory, setDraftCategory] = useState<CrownCategory>(category);
  const [draftMineOnly, setDraftMineOnly] = useState<boolean>(mineOnly);
  const [draftHeat, setDraftHeat] = useState<boolean>(heat);

  const [regions, setRegions] = useState<Row[]>([]);
  const [page, setPage] = useState(0);
  const [hasMore, setHasMore] = useState(true);
  const [loading, setLoading] = useState(false);
  const [total, setTotal] = useState<number | null>(null);

  const [flashKeys, setFlashKeys] = useState<Record<string, number>>({});
  const flashTimer = useRef<Record<string, number>>({});

  // Hot movers — recent score deltas tracked from realtime events
  const [movers, setMovers] = useState<Record<string, { region_type: Row["region_type"]; region_name: string; delta: number; lastScore: number; at: number; username?: string }>>({});
  const lastScoreRef = useRef<Record<string, number>>({});

  // Bookmarks
  const [bookmarks, setBookmarks] = useState<Bookmark[]>(() => loadBookmarks());
  useEffect(() => { saveBookmarks(bookmarks); }, [bookmarks]);
  // Collapsible side-panel sections so the map gets room on narrower screens.
  const [bookmarksOpen, setBookmarksOpen] = useState(true);
  const [hotMoversOpen, setHotMoversOpen] = useState(true);
  const isBookmarked = useCallback(
    (rt: Row["region_type"], rn: string, cat: CrownCategory) =>
      bookmarks.some((b) => b.region_type === rt && b.region_name === rn && b.category === cat),
    [bookmarks],
  );
  const toggleBookmark = useCallback((rt: Row["region_type"], rn: string, cat: CrownCategory) => {
    setBookmarks((prev) => {
      const exists = prev.some((b) => b.region_type === rt && b.region_name === rn && b.category === cat);
      if (exists) {
        toast.success("Bookmark removed");
        return prev.filter((b) => !(b.region_type === rt && b.region_name === rn && b.category === cat));
      }
      toast.success("Region bookmarked", { description: `${rn} · ${CATEGORY_LABEL[cat]}` });
      return [{ region_type: rt, region_name: rn, category: cat, addedAt: Date.now() }, ...prev].slice(0, 50);
    });
  }, []);

  // Live indicator + auto-pause
  const [pendingChanges, setPendingChanges] = useState(0);
  const [changesSinceRefresh, setChangesSinceRefresh] = useState(0);
  const [lastRefreshAt, setLastRefreshAt] = useState<number>(Date.now());
  const [liveBlink, setLiveBlink] = useState(0);

  const [contentRef, contentOnScreen] = useOnScreen<HTMLDivElement>();
  const visible = useDocumentVisible();
  const scrolling = useIsScrolling();
  const animationsPaused = !contentOnScreen || !visible || scrolling;

  // Share history
  const [shareHistory, setShareHistory] = useState<ShareEntry[]>(() => loadShareHistory());

  const fetchPage = useCallback(async (nextPage: number, replace = false) => {
    setLoading(true);
    const from = nextPage * PAGE_SIZE;
    const to = from + PAGE_SIZE - 1;
    const holder = holderQ.trim().toLowerCase().replace(/^@/, "");
    // Use an inner join when filtering by holder so pagination doesn't drop matches
    // that live on later pages. Without `!inner`, the embedded profile filter would
    // only narrow the embedded select — the parent row would still come back.
    const joinSpec = holder
      ? "profile:profiles!crowns_user_id_fkey!inner(username, profile_photo_url)"
      : "profile:profiles!crowns_user_id_fkey(username, profile_photo_url)";
    let q = supabase
      .from("crowns")
      .select(
        `region_name, region_type, user_id, post_id, crown_score, category, ${joinSpec}`,
        { count: "exact" },
      )
      .eq("active", true)
      .eq("category", category);

    if (scope !== "all") q = q.eq("region_type", scope);
    if (query.trim()) {
      if (exactName) q = q.ilike("region_name", query.trim());
      else q = q.ilike("region_name", `%${query.trim()}%`);
    }
    if (mineOnly && user) q = q.eq("user_id", user.id);
    const min = parseFloat(minScore);
    if (!isNaN(min) && min > 0) q = q.gte("crown_score", min);
    if (holder) q = q.ilike("profile.username", `%${holder}%`);

    const { data, count, error } = await q.order("crown_score", { ascending: false }).range(from, to);

    const rows: Row[] = (!error ? ((data as any) || []) : []);

    if (!error) {
      setRegions((prev) => (replace ? rows : [...prev, ...rows]));
      // Seed lastScore baseline so subsequent realtime events compute deltas correctly
      rows.forEach((r) => {
        const k = `${r.region_type}:${r.region_name}`;
        if (lastScoreRef.current[k] == null) lastScoreRef.current[k] = r.crown_score;
      });
      setHasMore((data?.length ?? 0) === PAGE_SIZE && (count == null || from + (data?.length ?? 0) < count));
      setTotal(count ?? null);
      setPage(nextPage);
      if (replace) {
        setChangesSinceRefresh(0);
        setPendingChanges(0);
        setLastRefreshAt(Date.now());
      }
    }
    setLoading(false);
  }, [category, scope, query, exactName, mineOnly, user, minScore, holderQ]);

  useEffect(() => {
    setRegions([]);
    setPage(0);
    setHasMore(true);
    fetchPage(0, true);
  }, [fetchPage]);

  const upsertRow = useCallback(async (region_type: Row["region_type"], region_name: string) => {
    const { data } = await supabase
      .from("crowns")
      .select("region_name, region_type, user_id, post_id, crown_score, category, profile:profiles!crowns_user_id_fkey(username, profile_photo_url)")
      .eq("active", true)
      .eq("category", category)
      .eq("region_type", region_type)
      .eq("region_name", region_name)
      .maybeSingle();
    if (!data) {
      setRegions((prev) => prev.filter((r) => !(r.region_type === region_type && r.region_name === region_name)));
      return;
    }
    setRegions((prev) => {
      const idx = prev.findIndex((r) => r.region_type === region_type && r.region_name === region_name);
      if (idx === -1) return [data as any, ...prev];
      const next = prev.slice();
      next[idx] = data as any;
      return next;
    });

    // Track delta for hot movers
    const k = `${region_type}:${region_name}`;
    const prevScore = lastScoreRef.current[k];
    const newScore = (data as any).crown_score as number;
    if (prevScore != null && newScore !== prevScore) {
      const delta = newScore - prevScore;
      setMovers((m) => ({
        ...m,
        [k]: {
          region_type,
          region_name,
          delta: (m[k]?.delta ?? 0) + delta,
          lastScore: newScore,
          at: Date.now(),
          username: (data as any).profile?.username,
        },
      }));
    }
    lastScoreRef.current[k] = newScore;
  }, [category]);

  const pausedRef = useRef(animationsPaused);
  useEffect(() => { pausedRef.current = animationsPaused; }, [animationsPaused]);

  useRealtimeChannel(
    `crown-map:${category}`,
    (ch) =>
      ch.on(
        "postgres_changes",
        { event: "*", schema: "public", table: "crowns", filter: `category=eq.${category}` },
        (payload: any) => {
          const row = (payload.new || payload.old) as any;
          if (!row || !row.region_name || !row.region_type) return;
          const key = `${row.region_type}:${row.region_name}`;

          setChangesSinceRefresh((n) => n + 1);
          setLiveBlink((n) => n + 1);

          if (pausedRef.current) {
            setPendingChanges((n) => n + 1);
          } else {
            if (flashTimer.current[key]) window.clearTimeout(flashTimer.current[key]);
            setFlashKeys((m) => { const n = { ...m }; delete n[key]; return n; });
            requestAnimationFrame(() => {
              setFlashKeys((m) => ({ ...m, [key]: Date.now() }));
              flashTimer.current[key] = window.setTimeout(() => {
                setFlashKeys((m) => { const n = { ...m }; delete n[key]; return n; });
                delete flashTimer.current[key];
              }, 2200);
            });
          }

          upsertRow(row.region_type, row.region_name);
        },
      ),
    undefined,
    [category, upsertRow],
  );

  useEffect(() => () => {
    Object.values(flashTimer.current).forEach((t) => window.clearTimeout(t));
    flashTimer.current = {};
  }, []);

  useEffect(() => {
    if (animationsPaused) {
      setFlashKeys({});
      Object.values(flashTimer.current).forEach((t) => window.clearTimeout(t));
      flashTimer.current = {};
    }
  }, [animationsPaused]);

  // Decay movers (drop entries older than 10 min)
  useEffect(() => {
    const i = window.setInterval(() => {
      const cutoff = Date.now() - 10 * 60 * 1000;
      setMovers((m) => {
        const next: typeof m = {};
        Object.entries(m).forEach(([k, v]) => { if (v.at >= cutoff) next[k] = v; });
        return next;
      });
    }, 30000);
    return () => window.clearInterval(i);
  }, []);

  // Reset movers + score baselines when category changes
  useEffect(() => {
    setMovers({});
    lastScoreRef.current = {};
  }, [category]);

  useEffect(() => {
    const next = new URLSearchParams(params);
    const set = (k: string, v: string, def: string) => { if (v && v !== def) next.set(k, v); else next.delete(k); };
    set("scope", scope, "all");
    set("category", category, "overall");
    set("q", query, "");
    set("view", view, "list");
    set("mine", mineOnly ? "1" : "", "");
    set("heat", heat ? "1" : "", "");
    set("holder", holderQ, "");
    set("exact", exactName ? "1" : "", "");
    set("min", minScore, "");
    if (next.toString() !== params.toString()) setParams(next, { replace: true });
    savePrefs({ scope, category, q: query, view, mine: mineOnly, heat });
    // eslint-disable-next-line
  }, [scope, category, query, view, mineOnly, heat, holderQ, exactName, minScore]);

  const shareUrl = useMemo(() => {
    const next = new URLSearchParams();
    const set = (k: string, v: string, def: string) => { if (v && v !== def) next.set(k, v); };
    set("scope", scope, "all");
    set("category", category, "overall");
    set("q", query, "");
    set("view", view, "list");
    set("mine", mineOnly ? "1" : "", "");
    set("heat", heat ? "1" : "", "");
    set("holder", holderQ, "");
    set("exact", exactName ? "1" : "", "");
    set("min", minScore, "");
    const qs = next.toString();
    if (typeof window === "undefined") return `/crown-map${qs ? `?${qs}` : ""}`;
    return `${window.location.origin}/crown-map${qs ? `?${qs}` : ""}`;
  }, [scope, category, query, view, mineOnly, heat, holderQ, exactName, minScore]);

  const shareLabel = useMemo(() => {
    const parts: string[] = [CATEGORY_LABEL[category]];
    if (scope !== "all") parts.push(scope);
    if (query) parts.push(`"${query}"`);
    if (mineOnly) parts.push("mine");
    if (heat) parts.push("heat");
    return parts.join(" · ");
  }, [scope, category, query, mineOnly, heat]);

  const recordShare = useCallback(() => {
    const entry: ShareEntry = { url: shareUrl, at: Date.now(), label: shareLabel };
    pushShareHistory(entry);
    setShareHistory(loadShareHistory());
  }, [shareUrl, shareLabel]);

  const copyShareUrl = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(shareUrl);
      toast.success("Link copied", { description: "Filters preserved in URL." });
      recordShare();
    } catch {
      toast.error("Couldn't copy", { description: "Long-press the URL preview to copy manually." });
    }
  }, [shareUrl, recordShare]);

  useEffect(() => {
    if (!liveBlink) return;
    const t = window.setTimeout(() => setLiveBlink(0), 900);
    return () => window.clearTimeout(t);
  }, [liveBlink]);

  const filtered = regions;

  const grouped = filtered.reduce((acc: Record<string, Row[]>, r) => {
    (acc[r.region_type] = acc[r.region_type] || []).push(r);
    return acc;
  }, {});

  const myCount = user ? regions.filter((r) => r.user_id === user.id).length : 0;

  // Top hot movers (sorted by absolute delta, gainers first)
  const hotMovers = useMemo(() => {
    return Object.values(movers)
      .filter((m) => m.delta !== 0)
      .sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta))
      .slice(0, 6);
  }, [movers]);

  // Bookmarks for current category (highlighted) + others (greyed)
  const bookmarksForCat = bookmarks.filter((b) => b.category === category);
  const bookmarksOther = bookmarks.filter((b) => b.category !== category);

  // Sync drafts whenever the panel opens on mobile so staged values match what's applied.
  useEffect(() => {
    if (mobileFiltersOpen && isCompact) {
      setDraftScope(scope);
      setDraftCategory(category);
      setDraftMineOnly(mineOnly);
      setDraftHeat(heat);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mobileFiltersOpen, isCompact]);

  const useDraft = isCompact && mobileFiltersOpen;
  const effScope = useDraft ? draftScope : scope;
  const effCategory = useDraft ? draftCategory : category;
  const effMineOnly = useDraft ? draftMineOnly : mineOnly;
  const effHeat = useDraft ? draftHeat : heat;
  const pickScope = useDraft ? setDraftScope : setScope;
  const pickCategory = useDraft ? setDraftCategory : setCategory;
  const pickMineOnly = useDraft ? setDraftMineOnly : setMineOnly;
  const pickHeat = useDraft ? setDraftHeat : setHeat;
  const draftDirty =
    useDraft &&
    (draftScope !== scope ||
      draftCategory !== category ||
      draftMineOnly !== mineOnly ||
      draftHeat !== heat);
  const applyMobileFilters = () => {
    setScope(draftScope);
    setCategory(draftCategory);
    setMineOnly(draftMineOnly);
    setHeat(draftHeat);
    setMobileFiltersOpen(false);
  };

  // Focus management for the mobile collapsible panel: when it opens, move
  // focus to the first interactive control inside; when it closes, return
  // focus to the trigger so keyboard users keep their place.
  const filtersTriggerRef = useRef<HTMLButtonElement | null>(null);
  const filtersPanelRef = useRef<HTMLDivElement | null>(null);
  const prevOpenRef = useRef(mobileFiltersOpen);
  useEffect(() => {
    if (!isCompact) return;
    const wasOpen = prevOpenRef.current;
    prevOpenRef.current = mobileFiltersOpen;
    if (mobileFiltersOpen && !wasOpen) {
      const first = filtersPanelRef.current?.querySelector<HTMLElement>(
        'button:not([disabled]),[href],input,select,textarea,[tabindex]:not([tabindex="-1"])',
      );
      first?.focus();
    } else if (!mobileFiltersOpen && wasOpen) {
      filtersTriggerRef.current?.focus();
    }
  }, [mobileFiltersOpen, isCompact]);

  // Roving keyboard navigation for the List/Map tablist.
  const onTabsKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.key !== "ArrowLeft" && e.key !== "ArrowRight" && e.key !== "Home" && e.key !== "End") return;
    e.preventDefault();
    const next: View = e.key === "ArrowLeft" || e.key === "Home" ? "list" : "map";
    setView(next);
    const target = e.currentTarget.querySelector<HTMLButtonElement>(`[data-view="${next}"]`);
    target?.focus();
  };

  const Filter = (
    <aside className="royal-card p-4 lg:sticky lg:top-[88px] lg:self-start space-y-4" aria-label="CrownMap filters">
      <div>
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-display text-sm tracking-widest text-gold">Search</h2>
          <button
            onClick={() => setAdvOpen((v) => !v)}
            className={`flex items-center gap-1 text-[10px] uppercase tracking-widest px-2 py-1 rounded-md transition focus-visible:ring-2 focus-visible:ring-primary focus-visible:outline-none ${
              advOpen || holderQ || exactName || minScore
                ? "text-primary bg-primary/10 border border-primary/40"
                : "text-muted-foreground hover:text-foreground border border-transparent"
            }`}
            aria-expanded={advOpen}
            aria-controls="adv-search-panel"
          >
            <SlidersHorizontal size={11} aria-hidden /> Advanced
          </button>
        </div>
        <label className="relative block">
          <span className="sr-only">Search realm name</span>
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" aria-hidden />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={exactName ? "Exact realm name…" : "Search realm…"}
            className="w-full h-10 pl-9 pr-3 rounded-lg bg-input border border-border text-sm focus:border-primary/60 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
          />
        </label>

        {advOpen && (
          <div id="adv-search-panel" className="mt-3 space-y-2 rounded-lg border border-border/60 bg-secondary/20 p-2.5 animate-fade-in">
            <label className="block">
              <span className="text-[10px] uppercase tracking-widest text-muted-foreground">Holder username</span>
              <div className="relative mt-1">
                <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground text-xs" aria-hidden>@</span>
                <input
                  value={holderQ}
                  onChange={(e) => setHolderQ(e.target.value.replace(/^@+/, ""))}
                  placeholder="username"
                  className="w-full h-8 pl-6 pr-2 rounded-md bg-input border border-border text-xs focus:border-primary/60 focus:outline-none"
                />
              </div>
            </label>
            <label className="flex items-center justify-between gap-2 text-xs">
              <span className="text-muted-foreground">Exact region match</span>
              <input
                type="checkbox"
                checked={exactName}
                onChange={(e) => setExactName(e.target.checked)}
                className="accent-primary"
              />
            </label>
            <label className="block">
              <span className="text-[10px] uppercase tracking-widest text-muted-foreground">Min crown score</span>
              <input
                type="number"
                min={0}
                value={minScore}
                onChange={(e) => setMinScore(e.target.value)}
                placeholder="0"
                className="mt-1 w-full h-8 px-2 rounded-md bg-input border border-border text-xs tabular-nums focus:border-primary/60 focus:outline-none"
              />
            </label>
            {(holderQ || exactName || minScore) && (
              <button
                onClick={() => { setHolderQ(""); setExactName(false); setMinScore(""); }}
                className="w-full flex items-center justify-center gap-1 text-[11px] text-muted-foreground hover:text-foreground py-1"
              >
                <X size={11} /> Clear advanced
              </button>
            )}
          </div>
        )}
      </div>

      {/* Mobile/tablet collapse toggle — keeps the panel compact so the
          List/Map switcher below stays one tap away. Hidden on desktop where
          the full sidebar is always visible. */}
      <button
        type="button"
        ref={filtersTriggerRef}
        onClick={() => setMobileFiltersOpen((v) => !v)}
        aria-expanded={mobileFiltersOpen}
        aria-controls="crownmap-mobile-filters"
        className="lg:hidden w-full flex items-center justify-between gap-2 text-[11px] uppercase tracking-widest text-muted-foreground hover:text-foreground border border-border rounded-lg px-3 py-2 transition focus-visible:ring-2 focus-visible:ring-primary focus-visible:outline-none"
      >
        <span className="flex items-center gap-1.5">
          <SlidersHorizontal size={11} aria-hidden /> Realm & category
        </span>
        <ChevronDown
          size={13}
          aria-hidden
          className={`transition-transform ${mobileFiltersOpen ? "rotate-180" : ""}`}
        />
      </button>


      {/* Animated collapsible — uses the grid-rows trick so the panel grows
          and shrinks smoothly without abrupt layout jumps. On lg+ the wrapper
          collapses back to a normal block layout via lg:!block / lg:!grid-rows-[1fr]. */}
      <div
        id="crownmap-mobile-filters"
        ref={filtersPanelRef}
        role="region"
        aria-label="Realm and category filters"
        aria-hidden={!mobileFiltersOpen && isCompact}
        className={`grid lg:!grid-rows-[1fr] transition-[grid-template-rows] duration-300 ease-out ${
          mobileFiltersOpen ? "grid-rows-[1fr]" : "grid-rows-[0fr]"
        }`}
      >
        <div className="overflow-hidden lg:overflow-visible">
          <div className="space-y-4 pt-1">
      <div>

        <h2 className="font-display text-sm tracking-widest text-gold mb-2">Realm</h2>
        <div className="grid grid-cols-2 lg:grid-cols-1 gap-1.5" role="group" aria-label="Realm scope">
          {(["all", "global", "country", "state", "city"] as Scope[]).map((s) => (
            <button
              key={s}
              onClick={() => pickScope(s)}
              aria-pressed={effScope === s}
              className={`text-left text-sm px-3 py-2 rounded-lg capitalize transition focus-visible:ring-2 focus-visible:ring-primary focus-visible:outline-none ${
                effScope === s
                  ? "bg-gradient-to-r from-primary/20 to-transparent border border-primary/50 text-primary font-semibold"
                  : "border border-transparent text-muted-foreground hover:text-foreground hover:bg-secondary/30"
              }`}
            >
              {s === "all" ? "All Realms" : s + "s"}
            </button>
          ))}
        </div>
      </div>

      <div>
        <h2 className="font-display text-sm tracking-widest text-gold mb-2">Category</h2>
        <div className="max-h-56 overflow-y-auto pr-1 space-y-1" role="group" aria-label="Category">
          {CATEGORIES.map((c) => {
            const Icon = CATEGORY_ICON[c] ?? Crown;
            const active = effCategory === c;
            return (
              <button
                key={c}
                onClick={() => pickCategory(c)}
                aria-pressed={active}
                className={`w-full flex items-center gap-2 text-left text-xs px-2.5 py-1.5 rounded-md transition focus-visible:ring-2 focus-visible:ring-primary focus-visible:outline-none ${
                  active
                    ? "bg-gradient-to-r from-primary/20 to-transparent border border-primary/50 text-primary font-semibold"
                    : "border border-transparent text-muted-foreground hover:text-foreground hover:bg-secondary/30"
                }`}
              >
                <Icon size={12} fill="currentColor" aria-hidden />
                <span className="truncate">{CATEGORY_LABEL[c]}</span>
              </button>
            );
          })}
        </div>
      </div>

      {user && (
        <button
          onClick={() => pickMineOnly(!effMineOnly)}
          aria-pressed={effMineOnly}
          className={`w-full flex items-center justify-between gap-2 text-xs px-3 py-2 rounded-lg transition focus-visible:ring-2 focus-visible:ring-primary focus-visible:outline-none ${
            effMineOnly
              ? "bg-gradient-to-r from-amber-500/20 to-transparent border border-amber-400/60 text-amber-300 font-semibold"
              : "border border-border text-muted-foreground hover:text-foreground"
          }`}
        >
          <span className="flex items-center gap-1.5"><Sparkles size={12} aria-hidden /> My crowns only</span>
          <span className="tabular-nums">{myCount}</span>
        </button>
      )}

      <div className="flex items-stretch gap-1.5">
        <button
          onClick={() => pickHeat(!effHeat)}
          aria-pressed={effHeat}
          aria-label={`Heat overlay ${effHeat ? "on" : "off"} — emphasizes high crown regions on the map`}
          className={`flex-1 flex items-center justify-between gap-2 text-xs px-3 py-2 rounded-lg transition focus-visible:ring-2 focus-visible:ring-primary focus-visible:outline-none ${
            effHeat
              ? "bg-gradient-to-r from-orange-500/20 via-rose-500/15 to-transparent border border-orange-400/60 text-orange-300 font-semibold"
              : "border border-border text-muted-foreground hover:text-foreground"
          }`}
        >
          <span className="flex items-center gap-1.5"><Flame size={12} aria-hidden /> Heat overlay</span>
          <span className="text-[10px] uppercase tracking-widest">{effHeat ? "On" : "Off"}</span>
        </button>
        <HeatLegendButton />
      </div>

      {/* Mobile/tablet "Apply" — commits draft filters in one go. Hidden on
          desktop where edits already apply live via the persistent sidebar. */}
      {isCompact && (
        <button
          type="button"
          onClick={applyMobileFilters}
          disabled={!draftDirty}
          className={`w-full flex items-center justify-center gap-1.5 text-xs font-bold uppercase tracking-widest px-3 py-2.5 rounded-lg transition focus-visible:ring-2 focus-visible:ring-primary focus-visible:outline-none ${
            draftDirty
              ? "bg-gradient-to-r from-primary/30 to-primary/10 border border-primary text-primary"
              : "border border-border text-muted-foreground/60 cursor-not-allowed"
          }`}
        >
          {draftDirty ? "Apply filters" : "Filters applied"}
        </button>
      )}
          </div>
        </div>
      </div>

      {/* Sticky List/Map switcher on mobile/tablet so changing view doesn't
          require scrolling back to the top of the filters card. */}
      <div className="sticky lg:static top-[64px] z-20 -mx-4 lg:mx-0 px-4 lg:px-0 py-2 lg:py-0 bg-background/95 lg:bg-transparent backdrop-blur supports-[backdrop-filter]:bg-background/70 lg:!bg-transparent">
        <div
          className="flex gap-1.5 p-1 rounded-lg bg-secondary/40 border border-border"
          role="tablist"
          aria-label="View mode"
          onKeyDown={onTabsKeyDown}
        >
          <button
            data-view="list"
            onClick={() => setView("list")}
            role="tab"
            id="crownmap-tab-list"
            aria-selected={view === "list"}
            aria-controls="crownmap-panel-list"
            tabIndex={view === "list" ? 0 : -1}
            className={`flex-1 flex items-center justify-center gap-1.5 text-xs py-1.5 rounded-md transition focus-visible:ring-2 focus-visible:ring-primary focus-visible:outline-none ${
              view === "list" ? "bg-primary/20 text-primary font-semibold" : "text-muted-foreground"
            }`}
          >
            <List size={12} aria-hidden /> List
          </button>
          <button
            data-view="map"
            onClick={() => setView("map")}
            role="tab"
            id="crownmap-tab-map"
            aria-selected={view === "map"}
            aria-controls="crownmap-panel-map"
            tabIndex={view === "map" ? 0 : -1}
            className={`flex-1 flex items-center justify-center gap-1.5 text-xs py-1.5 rounded-md transition focus-visible:ring-2 focus-visible:ring-primary focus-visible:outline-none ${
              view === "map" ? "bg-primary/20 text-primary font-semibold" : "text-muted-foreground"
            }`}
          >
            <Globe2 size={12} aria-hidden /> Map
          </button>
        </div>
      </div>


      <p className="text-[11px] text-muted-foreground" aria-live="polite">
        {filtered.length}{total != null && total > filtered.length ? ` of ${total}` : ""} crown{filtered.length === 1 ? "" : "s"} loaded
      </p>
    </aside>
  );

  const isMine = (r: Row) => user && r.user_id === user.id;

  // Side panel: bookmarks + hot movers
  const SidePanel = (
    <aside className="space-y-4" aria-label="Bookmarks and hot movers">
      {/* Bookmarks */}
      <div className="royal-card p-3.5">
        <button
          type="button"
          onClick={() => setBookmarksOpen((v) => !v)}
          aria-expanded={bookmarksOpen}
          aria-controls="side-bookmarks-body"
          className="w-full flex items-center justify-between mb-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary rounded"
        >
          <h3 className="font-display text-sm tracking-widest text-gold flex items-center gap-1.5">
            <BookmarkCheck size={13} aria-hidden /> Bookmarks
          </h3>
          <span className="flex items-center gap-2 text-[10px] text-muted-foreground tabular-nums">
            {bookmarks.length}
            <ChevronDown size={12} className={`transition-transform ${bookmarksOpen ? "" : "-rotate-90"}`} aria-hidden />
          </span>
        </button>
        {bookmarksOpen && (
          <div id="side-bookmarks-body">
            {bookmarks.length === 0 ? (
              <p className="text-xs text-muted-foreground">
                Bookmark a region from the map or list to jump back fast.
              </p>
            ) : (
              <div className="space-y-1">
                {bookmarksForCat.slice(0, 5).map((b) => (
                  <BookmarkRow key={`bm-${b.category}-${b.region_type}-${b.region_name}`} bm={b} active onJump={() => navigate(`/leaderboard?scope=${b.region_type}&region=${encodeURIComponent(b.region_name)}&category=${b.category}`)} onRemove={() => toggleBookmark(b.region_type, b.region_name, b.category)} />
                ))}
                {bookmarksOther.slice(0, 3).map((b) => (
                  <BookmarkRow key={`bmo-${b.category}-${b.region_type}-${b.region_name}`} bm={b} onJump={() => { setCategory(b.category); navigate(`/leaderboard?scope=${b.region_type}&region=${encodeURIComponent(b.region_name)}&category=${b.category}`); }} onRemove={() => toggleBookmark(b.region_type, b.region_name, b.category)} />
                ))}
                {bookmarks.length > 8 && (
                  <p className="text-[10px] text-muted-foreground pt-1">+{bookmarks.length - 8} more saved</p>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Hot movers */}
      <div className="royal-card p-3.5">
        <button
          type="button"
          onClick={() => setHotMoversOpen((v) => !v)}
          aria-expanded={hotMoversOpen}
          aria-controls="side-hotmovers-body"
          className="w-full flex items-center justify-between mb-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary rounded"
        >
          <h3 className="font-display text-sm tracking-widest text-gold flex items-center gap-1.5">
            <TrendingUp size={13} aria-hidden /> Hot Movers
          </h3>
          <span className="flex items-center gap-2 text-[10px] text-muted-foreground">
            last 10 min
            <ChevronDown size={12} className={`transition-transform ${hotMoversOpen ? "" : "-rotate-90"}`} aria-hidden />
          </span>
        </button>
        {hotMoversOpen && (
          <div id="side-hotmovers-body">
            {hotMovers.length === 0 ? (
              <p className="text-xs text-muted-foreground">No recent movement. Watch this space — we'll surface regions whose crown score shifts in realtime.</p>
            ) : (
              <ul className="space-y-1.5" aria-live="polite">
                {hotMovers.map((m) => {
                  const up = m.delta > 0;
                  return (
                    <li key={`mv-${m.region_type}-${m.region_name}`}>
                      <Link
                        to={`/leaderboard?scope=${m.region_type}&region=${encodeURIComponent(m.region_name)}&category=${category}`}
                        className="flex items-center gap-2 px-2 py-1.5 rounded-md hover:bg-secondary/40 transition focus-visible:ring-2 focus-visible:ring-primary focus-visible:outline-none"
                      >
                        <span className={`text-[10px] font-bold tabular-nums px-1.5 py-0.5 rounded ${up ? "bg-emerald-500/15 text-emerald-300" : "bg-rose-500/15 text-rose-300"}`}>
                          {up ? "▲" : "▼"} {Math.abs(m.delta).toFixed(0)}
                        </span>
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-medium truncate">{m.region_name}</p>
                          <p className="text-[10px] text-muted-foreground capitalize truncate">
                            {m.region_type}{m.username ? ` · @${m.username}` : ""}
                          </p>
                        </div>
                        <span className="text-[10px] text-gold tabular-nums">{formatScore(m.lastScore)}</span>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        )}
      </div>
    </aside>
  );

  return (
    <AppShell title="CROWN MAP">
      <div className="px-4 lg:px-0 py-4 lg:grid lg:grid-cols-[260px_minmax(0,1fr)_260px] lg:gap-6">
        {Filter}

        <div ref={contentRef} className="space-y-5 mt-4 lg:mt-0">
          <div className="flex items-center justify-between gap-3">
            <div className="hidden lg:block">
              <h1 className="font-display text-2xl text-gold">Kingdoms of CrownMe</h1>
              <p className="text-sm text-muted-foreground">
                Active crowns across the world · <CategoryBadge category={category} label={CATEGORY_LABEL[category]} size="xs" className="ml-1 align-middle" />
              </p>
            </div>
            <div className="flex items-center gap-2 ml-auto">
              <LiveIndicator
                paused={animationsPaused}
                changes={changesSinceRefresh}
                pending={pendingChanges}
                blink={liveBlink}
                lastRefreshAt={lastRefreshAt}
                onRefresh={() => fetchPage(0, true)}
              />
              <SharePopover
                shareUrl={shareUrl}
                shareLabel={shareLabel}
                online={online}
                history={shareHistory}
                onCopy={copyShareUrl}
                onShare={async () => {
                  try {
                    if (online && (navigator as any).share) {
                      await (navigator as any).share({ title: "CrownMap", url: shareUrl });
                      recordShare();
                    } else {
                      await copyShareUrl();
                    }
                  } catch { /* cancelled */ }
                }}
                onPickHistory={(u) => { window.history.replaceState({}, "", u); window.location.assign(u); }}
                onClearHistory={() => { localStorage.removeItem(SHARE_HISTORY_KEY); setShareHistory([]); }}
              />
            </div>
          </div>

          {filtered.length === 0 && !loading && view === "list" && (
            <div className="royal-card p-8 text-center space-y-3 animate-fade-in">
              <Crown size={36} className="mx-auto text-primary opacity-60" fill="currentColor" />
              <div>
                <p className="font-display text-lg text-gold">
                  {mineOnly ? "You don't hold any crowns yet" : "No crowns in this realm"}
                </p>
                <p className="text-xs text-muted-foreground mt-1">
                  {mineOnly
                    ? "Post in this category to claim your first crown."
                    : "Be the first to claim a crown here — post and start collecting votes."}
                </p>
              </div>
              <div className="flex justify-center gap-2">
                <Button onClick={() => navigate("/upload")} size="sm" className="gap-1.5">
                  <Upload size={14} /> Post to claim
                </Button>
                <Button onClick={() => navigate("/leaderboard")} variant="outline" size="sm">
                  See leaderboard
                </Button>
              </div>
            </div>
          )}

          {view === "map" && (
            <div id="crownmap-panel-map" role="tabpanel" aria-labelledby="crownmap-tab-map" tabIndex={0}>
              <MapView
                rows={filtered}
                category={category}
                userId={user?.id}
                flashKeys={flashKeys}
                heat={heat}
                isBookmarked={isBookmarked}
                onToggleBookmark={toggleBookmark}
              />
            </div>
          )}

          {view === "list" && (
            <div id="crownmap-panel-list" role="tabpanel" aria-labelledby="crownmap-tab-list" tabIndex={0} className="space-y-6">
            {(scope === "all" ? ["global", "country", "state", "city"] : [scope]).map((s) => (
              <section key={s} aria-label={`${s} crowns`}>
                <h2 className="font-display text-sm uppercase tracking-widest text-muted-foreground mb-2">
                  {s}{s === "global" ? "" : "s"}
                </h2>
                <div className="space-y-2 lg:grid lg:grid-cols-2 lg:gap-2 lg:space-y-0">
                  {(grouped[s] || []).map((r, i) => {
                    const key = `${r.region_type}:${r.region_name}`;
                    const flashed = !!flashKeys[key];
                    const mine = isMine(r);
                    const bookmarked = isBookmarked(r.region_type, r.region_name, category);
                    return (
                      <div
                        key={`${s}-${i}-${r.region_name}`}
                        className={`royal-card p-3 flex items-center gap-3 transition ${
                          mine ? "border-amber-400/60 bg-gradient-to-r from-amber-500/10 to-transparent shadow-[0_0_24px_-12px_hsl(var(--primary))]" : "hover:border-primary/40"
                        } ${flashed ? "animate-pulse ring-2 ring-primary/60" : ""}`}
                      >
                        <Link
                          to={`/leaderboard?scope=${s}&region=${encodeURIComponent(r.region_name)}&category=${category}`}
                          className="flex items-center gap-3 flex-1 min-w-0 focus-visible:ring-2 focus-visible:ring-primary focus-visible:outline-none rounded"
                        >
                          <Crown size={18} className={mine ? "text-amber-300" : "text-primary"} fill="currentColor" aria-hidden />
                          <div className="flex-1 min-w-0">
                            <p className="font-display text-sm truncate flex items-center gap-1.5">
                              {r.region_name}
                              {mine && <span className="text-[9px] uppercase tracking-widest text-amber-300 font-bold">You</span>}
                            </p>
                            <p className="text-xs text-muted-foreground truncate">Held by @{r.profile?.username}</p>
                          </div>
                          <span className="text-xs font-bold tabular-nums text-gold">{formatScore(r.crown_score)}</span>
                        </Link>
                        <button
                          type="button"
                          onClick={(e) => { e.preventDefault(); toggleBookmark(r.region_type, r.region_name, category); }}
                          aria-pressed={bookmarked}
                          aria-label={bookmarked ? `Remove bookmark for ${r.region_name}` : `Bookmark ${r.region_name}`}
                          title={bookmarked ? "Remove bookmark" : "Bookmark this region"}
                          className={`p-1.5 rounded-md transition focus-visible:ring-2 focus-visible:ring-primary focus-visible:outline-none ${bookmarked ? "text-amber-300 hover:text-amber-200" : "text-muted-foreground hover:text-foreground"}`}
                        >
                          {bookmarked ? <BookmarkCheck size={14} /> : <Bookmark size={14} />}
                        </button>
                      </div>
                    );
                  })}
                  {!grouped[s]?.length && <p className="text-xs text-muted-foreground">No crowns held yet.</p>}
                </div>
              </section>
            ))}
            </div>
          )}

          {/* Mobile-only side panel below map/list */}
          <div className="lg:hidden">{SidePanel}</div>

          {hasMore && filtered.length > 0 && (
            <div className="flex justify-center pt-2">
              <Button
                variant="outline"
                size="sm"
                disabled={loading}
                onClick={() => fetchPage(page + 1)}
                className="gap-1.5"
              >
                {loading ? <Loader2 size={14} className="animate-spin" /> : null}
                Load more
              </Button>
            </div>
          )}
        </div>

        {/* Desktop side panel */}
        <div className="hidden lg:block lg:sticky lg:top-[88px] lg:self-start">
          {SidePanel}
        </div>
      </div>
    </AppShell>
  );
}

/* --------------------------- Bookmark row --------------------------- */

function BookmarkRow({ bm, active, onJump, onRemove }: { bm: Bookmark; active?: boolean; onJump: () => void; onRemove: () => void }) {
  return (
    <div className={`flex items-center gap-1.5 group rounded-md px-1 ${active ? "" : "opacity-70"}`}>
      <button
        onClick={onJump}
        className="flex-1 flex items-center gap-2 text-left text-xs py-1.5 px-1 rounded hover:bg-secondary/40 focus-visible:ring-2 focus-visible:ring-primary focus-visible:outline-none"
      >
        <Crown size={11} className="text-amber-300 shrink-0" fill="currentColor" aria-hidden />
        <span className="truncate flex-1">{bm.region_name}</span>
        <span className="text-[9px] uppercase tracking-widest text-muted-foreground shrink-0">{bm.region_type}</span>
      </button>
      <button
        onClick={onRemove}
        aria-label={`Remove bookmark ${bm.region_name}`}
        className="p-1 rounded text-muted-foreground hover:text-foreground opacity-0 group-hover:opacity-100 focus:opacity-100 focus-visible:ring-2 focus-visible:ring-primary focus-visible:outline-none"
      >
        <X size={11} />
      </button>
    </div>
  );
}

/* --------------------------- Heat legend popover --------------------------- */

function HeatLegendButton() {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label="Show heat and cluster legend"
          title="Heat & cluster legend"
          className="px-2 rounded-lg border border-border text-muted-foreground hover:text-foreground focus-visible:ring-2 focus-visible:ring-primary focus-visible:outline-none"
        >
          <HelpCircle size={13} />
        </button>
      </PopoverTrigger>
      <PopoverContent side="bottom" align="end" className="w-72 p-3.5">
        <div className="space-y-3">
          <div>
            <h4 className="font-display text-sm text-gold flex items-center gap-1.5"><Flame size={12} /> Heat & Cluster Legend</h4>
            <p className="text-[11px] text-muted-foreground mt-0.5">How to read the map at a glance.</p>
          </div>

          <div>
            <p className="text-[10px] uppercase tracking-widest text-muted-foreground mb-1.5">Marker size = crown score</p>
            <div className="flex items-end gap-3">
              <div className="flex flex-col items-center gap-1">
                <span className="block w-2 h-2 rounded-full bg-primary" />
                <span className="text-[10px] text-muted-foreground tabular-nums">&lt; 10</span>
              </div>
              <div className="flex flex-col items-center gap-1">
                <span className="block w-3 h-3 rounded-full bg-primary" />
                <span className="text-[10px] text-muted-foreground tabular-nums">10–100</span>
              </div>
              <div className="flex flex-col items-center gap-1">
                <span className="block w-4 h-4 rounded-full bg-primary" />
                <span className="text-[10px] text-muted-foreground tabular-nums">100–1k</span>
              </div>
              <div className="flex flex-col items-center gap-1">
                <span className="block w-5 h-5 rounded-full bg-primary" />
                <span className="text-[10px] text-muted-foreground tabular-nums">1k+</span>
              </div>
            </div>
          </div>

          <div>
            <p className="text-[10px] uppercase tracking-widest text-muted-foreground mb-1.5">Heat ramp</p>
            <div
              className="w-full h-3 rounded"
              style={{ background: "linear-gradient(90deg, hsl(45 95% 55% / 0.4), hsl(30 95% 55% / 0.7), hsl(0 90% 60%))" }}
              aria-hidden
            />
            <div className="flex justify-between text-[10px] text-muted-foreground mt-1">
              <span>Sparse</span>
              <span>Active</span>
              <span>Hot zone</span>
            </div>
            <p className="text-[11px] text-muted-foreground mt-1.5 leading-snug">
              Larger, brighter blooms mark high-density regions. When multiple high-score crowns sit close together, their heat overlaps into a cluster — these are your most contested kingdoms.
            </p>
          </div>

          <div className="pt-1 border-t border-border/60 space-y-1">
            <p className="text-[11px] flex items-center gap-1.5">
              <span className="block w-2.5 h-2.5 rounded-full" style={{ background: "hsl(45 95% 55%)" }} />
              <span className="text-muted-foreground">Gold = your crown</span>
            </p>
            <p className="text-[11px] flex items-center gap-1.5">
              <span className="inline-block w-3 h-3 rounded-full border-2 border-primary/60 animate-ping" />
              <span className="text-muted-foreground">Pulsing ring = just updated</span>
            </p>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}

/* --------------------------- Share popover --------------------------- */

function SharePopover({
  shareUrl, shareLabel, online, history, onCopy, onShare, onPickHistory, onClearHistory,
}: {
  shareUrl: string;
  shareLabel: string;
  online: boolean;
  history: ShareEntry[];
  onCopy: () => void;
  onShare: () => void;
  onPickHistory: (u: string) => void;
  onClearHistory: () => void;
}) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm" className="gap-1.5 h-8" aria-label="Share this CrownMap view">
          <Share2 size={13} aria-hidden /> Share
        </Button>
      </PopoverTrigger>
      <PopoverContent side="bottom" align="end" className="w-80 p-3">
        <div className="space-y-3">
          <div>
            <h4 className="font-display text-sm text-gold">Share this view</h4>
            <p className="text-[11px] text-muted-foreground">{shareLabel}</p>
          </div>

          <div>
            <label className="text-[10px] uppercase tracking-widest text-muted-foreground" htmlFor="share-url-preview">URL preview</label>
            <div className="mt-1 flex items-center gap-1.5">
              <input
                id="share-url-preview"
                readOnly
                value={shareUrl}
                onFocus={(e) => e.currentTarget.select()}
                className="flex-1 h-8 px-2 rounded-md bg-input border border-border text-[11px] font-mono truncate focus:border-primary/60 focus:outline-none"
                aria-label="Shareable URL preview"
              />
              <Button onClick={onCopy} size="sm" variant="outline" className="h-8 px-2" aria-label="Copy URL">
                <Copy size={12} />
              </Button>
            </div>
            {!online && (
              <p className="text-[11px] text-amber-300/90 mt-1.5 flex items-center gap-1">
                <Info size={11} /> Offline — copy now, share when reconnected.
              </p>
            )}
          </div>

          <div className="flex gap-1.5">
            <Button onClick={onShare} size="sm" className="flex-1 h-8 gap-1.5">
              <Share2 size={12} /> {online && (navigator as any).share ? "Share…" : "Copy link"}
            </Button>
          </div>

          {history.length > 0 && (
            <div className="pt-2 border-t border-border/60">
              <div className="flex items-center justify-between mb-1">
                <p className="text-[10px] uppercase tracking-widest text-muted-foreground flex items-center gap-1"><History size={10} /> Recent shares</p>
                <button onClick={onClearHistory} className="text-[10px] text-muted-foreground hover:text-foreground">Clear</button>
              </div>
              <ul className="space-y-1 max-h-40 overflow-y-auto">
                {history.map((h) => (
                  <li key={h.url} className="flex items-center gap-1.5">
                    <button
                      onClick={() => onPickHistory(h.url)}
                      className="flex-1 text-left text-[11px] px-2 py-1 rounded hover:bg-secondary/40 truncate focus-visible:ring-2 focus-visible:ring-primary focus-visible:outline-none"
                      title={h.url}
                    >
                      <span className="text-foreground">{h.label || "(default view)"}</span>
                    </button>
                    <button
                      onClick={async () => { try { await navigator.clipboard.writeText(h.url); toast.success("Copied"); } catch {} }}
                      aria-label="Copy this link"
                      className="p-1 rounded text-muted-foreground hover:text-foreground"
                    >
                      <Copy size={11} />
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}

/* --------------------------- Map View --------------------------- */

function project(lat: number, lon: number, w: number, h: number) {
  const x = ((lon + 180) / 360) * w;
  const y = ((90 - lat) / 180) * h;
  return [x, y];
}

function geoFor(r: Row): { coord: LatLng; approximate: boolean } {
  if (r.region_type === "global") return { coord: [0, 0], approximate: false };
  const exact = lookupGeo(r.region_name, r.region_type as any);
  if (exact) return { coord: exact, approximate: false };
  return { coord: fallbackCoord(`${r.region_type}:${r.region_name}`), approximate: true };
}

function MapView({
  rows, category, userId, flashKeys, heat, isBookmarked, onToggleBookmark,
}: {
  rows: Row[];
  category: CrownCategory;
  userId?: string;
  flashKeys: Record<string, number>;
  heat: boolean;
  isBookmarked: (rt: Row["region_type"], rn: string, cat: CrownCategory) => boolean;
  onToggleBookmark: (rt: Row["region_type"], rn: string, cat: CrownCategory) => void;
}) {
  const navigate = useNavigate();
  const { token, version: tokenVersion, loading: tokenLoading, error: tokenError, refresh: refreshToken } = useMapboxToken();
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<mapboxgl.Map | null>(null);
  const markersRef = useRef<mapboxgl.Marker[]>([]);
  const popupRef = useRef<mapboxgl.Popup | null>(null);
  const [markerMode, setMarkerMode] = useState<"posts" | "users">("posts");
  // Surface a friendly error UI when Mapbox rejects requests (401/403),
  // which usually means an expired/invalid token or a restricted account.
  const [mapAuthError, setMapAuthError] = useState(false);
  // Track whether we've already attempted a one-shot token refresh for the
  // current token version, so we don't loop forever on a genuinely bad token.
  const refreshAttemptedRef = useRef<number | null>(null);

  const points = useMemo(
    () =>
      rows
        .filter((r) => r.region_type !== "global")
        .map((r) => {
          const { coord, approximate } = geoFor(r);
          return { r, coord, approximate };
        }),
    [rows],
  );
  const approxCount = points.filter((p) => p.approximate).length;
  const maxScore = Math.max(1, ...points.map((p) => p.r.crown_score));

  // Init map once we have a token
  useEffect(() => {
    if (!token || !containerRef.current || mapRef.current) return;
    mapboxgl.accessToken = token;
    const map = new mapboxgl.Map({
      container: containerRef.current,
      style: "mapbox://styles/mapbox/dark-v11",
      center: [0, 20],
      zoom: 1.4,
      attributionControl: true,
      projection: "globe" as any,
    });
    map.addControl(new mapboxgl.NavigationControl({ showCompass: false }), "top-right");
    map.scrollZoom.disable();
    // Detect Mapbox auth/quota rejections (401/403) on tile/style requests and
    // swap in a friendly error UI instead of leaving a blank globe.
    map.on("error", (e: any) => {
      const status = e?.error?.status ?? e?.status;
      if (status === 401 || status === 403) {
        // Try a one-shot refresh of the Mapbox token before giving up — the
        // current value may simply have expired. The map effect re-runs when
        // `tokenVersion` changes, so a fresh token rebuilds the map cleanly.
        if (refreshAttemptedRef.current !== tokenVersion) {
          refreshAttemptedRef.current = tokenVersion;
          refreshToken().then((t) => {
            if (!t) setMapAuthError(true);
          }).catch(() => setMapAuthError(true));
        } else {
          setMapAuthError(true);
        }
      }
    });
    map.on("style.load", () => {
      try {
        map.setFog({
          color: "rgb(15, 10, 30)",
          "high-color": "rgb(40, 20, 60)",
          "horizon-blend": 0.15,
          "space-color": "rgb(5, 0, 15)",
          "star-intensity": 0.6,
        } as any);
      } catch { /* fog optional */ }
    });
    mapRef.current = map;
    return () => {
      markersRef.current.forEach((m) => m.remove());
      markersRef.current = [];
      popupRef.current?.remove();
      popupRef.current = null;
      map.remove();
      mapRef.current = null;
    };
  }, [token, tokenVersion]);

  // Render markers whenever points / mode / category change
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    markersRef.current.forEach((m) => m.remove());
    markersRef.current = [];

    const popup =
      popupRef.current ??
      new mapboxgl.Popup({
        closeButton: false,
        closeOnClick: false,
        offset: 14,
        className: "crownmap-popup",
      });
    popupRef.current = popup;

    points.forEach((p) => {
      const mine = userId && p.r.user_id === userId;
      const intensity = Math.max(0.25, Math.min(1, p.r.crown_score / maxScore));
      const size = Math.round(14 + intensity * 26);
      const bookmarked = isBookmarked(p.r.region_type, p.r.region_name, category);

      // Wrapper element is what Mapbox positions via `transform: translate(...)`.
      // The inner button owns visual transforms (scale on hover) so we never
      // clobber Mapbox's positional transform — that was the hover-drift bug.
      const wrap = document.createElement("div");
      wrap.style.cssText = "width:0;height:0;will-change:transform;";

      const el = document.createElement("button");
      el.type = "button";
      el.setAttribute(
        "aria-label",
        `${p.r.region_name}, ${p.r.region_type}, held by @${p.r.profile?.username ?? "unknown"}, score ${formatScore(p.r.crown_score)}`,
      );
      el.style.cssText = `
        position:absolute;left:50%;top:50%;
        width:${size}px;height:${size}px;border-radius:9999px;cursor:pointer;
        background:${mine ? "hsl(45 95% 55%)" : "hsl(45 90% 60%)"};
        border:2px solid rgba(0,0,0,0.6);
        box-shadow:0 0 ${Math.round(size * 0.6)}px hsl(45 95% 55% / ${0.35 + intensity * 0.5});
        opacity:${p.approximate ? 0.7 : 0.95};
        display:flex;align-items:center;justify-content:center;color:#1a1208;
        font-weight:800;font-size:${Math.max(10, Math.round(size * 0.42))}px;
        transform:translate(-50%, -50%);
        transition:transform .15s ease;
        transform-origin:center;
      `;
      el.textContent = "♛";
      if (bookmarked) {
        const dot = document.createElement("span");
        dot.style.cssText =
          "position:absolute;top:-3px;right:-3px;width:9px;height:9px;border-radius:9999px;background:hsl(45 95% 55%);border:1.5px solid #000;";
        el.appendChild(dot);
      }
      wrap.appendChild(el);

      const profileTarget = p.r.profile?.username
        ? `/u/${encodeURIComponent(p.r.profile.username)}`
        : null;
      const postTarget = p.r.post_id ? `/post/${p.r.post_id}` : null;
      const navTarget = markerMode === "posts" && postTarget ? postTarget : profileTarget;

      const popupHtml = `
        <div style="min-width:200px;font-family:inherit">
          <div style="font-weight:700;font-size:13px;color:#fff;margin-bottom:2px">
            ♛ ${escapeHtml(p.r.region_name)}
          </div>
          <div style="font-size:10px;text-transform:uppercase;letter-spacing:.08em;color:#aaa;margin-bottom:6px">
            ${p.r.region_type} · ${escapeHtml(CATEGORY_LABEL[category])}
          </div>
          <div style="font-size:12px;color:#ddd">
            Held by <b style="color:hsl(45 95% 65%)">@${escapeHtml(p.r.profile?.username ?? "unknown")}</b>
          </div>
          <div style="display:flex;justify-content:space-between;align-items:center;margin-top:6px">
            <span style="font-size:10px;color:#888">Crown score</span>
            <span style="font-size:13px;font-weight:800;color:hsl(45 95% 65%)">${formatScore(p.r.crown_score)}</span>
          </div>
          <div style="margin-top:6px;font-size:10px;color:#777;font-style:italic">
            ${markerMode === "posts" ? (postTarget ? "Click to view post" : "Click to view holder") : "Click to view profile"}${p.approximate ? " · approx. location" : ""}
          </div>
        </div>
      `;

      el.addEventListener("mouseenter", () => {
        el.style.transform = "translate(-50%, -50%) scale(1.15)";
        popup.setLngLat([p.coord[1], p.coord[0]]).setHTML(popupHtml).addTo(map);
      });
      el.addEventListener("mouseleave", () => {
        el.style.transform = "translate(-50%, -50%) scale(1)";
        popup.remove();
      });
      el.addEventListener("click", async (ev) => {
        ev.stopPropagation();
        // Verify the post still exists & is visible before navigating to /post/:id.
        // Falls back to the holder's profile (or a toast) instead of dumping the user
        // on the 404 page when the underlying post was removed/hidden.
        if (markerMode === "posts" && postTarget && p.r.post_id) {
          try {
            const { data } = await supabase
              .from("posts")
              .select("id")
              .eq("id", p.r.post_id)
              .eq("is_removed", false)
              .maybeSingle();
            if (data?.id) {
              navigate(postTarget);
              return;
            }
          } catch { /* fall through */ }
          if (profileTarget) {
            toast.info("Post unavailable — opening holder's profile");
            navigate(profileTarget);
            return;
          }
          toast.error("This crown's post is no longer available");
          return;
        }
        if (navTarget) navigate(navTarget);
        else toast.error("No destination for this crown");
      });

      const marker = new mapboxgl.Marker({ element: wrap, anchor: "center" })
        .setLngLat([p.coord[1], p.coord[0]])
        .addTo(map);
      markersRef.current.push(marker);
    });
  }, [points, markerMode, category, userId, maxScore, isBookmarked, navigate]);

  // Pulse flashed markers
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    points.forEach((p, i) => {
      const key = `${p.r.region_type}:${p.r.region_name}`;
      const marker = markersRef.current[i];
      if (!marker) return;
      // The visible button is the wrapper's first child (see marker render above).
      const visual = marker.getElement().firstElementChild as HTMLElement | null;
      if (!visual) return;
      if (flashKeys[key]) {
        visual.animate(
          [
            { boxShadow: "0 0 0 0 hsl(45 95% 55% / 0.9)" },
            { boxShadow: "0 0 0 22px hsl(45 95% 55% / 0)" },
          ],
          { duration: 1400, iterations: 2 },
        );
      }
    });

  }, [flashKeys, points]);

  // Heat overlay: register a real Mapbox heatmap layer driven by crown_score.
  // Rebuilds the GeoJSON source whenever points change; toggles opacity on `heat`.
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const SRC = "crown-heat-src";
    const LAYER = "crown-heat-layer";

    const apply = () => {
      const fc = {
        type: "FeatureCollection" as const,
        features: points.map((p) => ({
          type: "Feature" as const,
          properties: { weight: Math.max(0.2, Math.min(1, p.r.crown_score / maxScore)) },
          geometry: { type: "Point" as const, coordinates: [p.coord[1], p.coord[0]] },
        })),
      };
      try {
        const existing = map.getSource(SRC) as mapboxgl.GeoJSONSource | undefined;
        if (existing) {
          existing.setData(fc as any);
        } else {
          map.addSource(SRC, { type: "geojson", data: fc as any });
          map.addLayer({
            id: LAYER,
            type: "heatmap",
            source: SRC,
            maxzoom: 9,
            paint: {
              "heatmap-weight": ["get", "weight"],
              "heatmap-intensity": ["interpolate", ["linear"], ["zoom"], 0, 1, 9, 3],
              "heatmap-color": [
                "interpolate", ["linear"], ["heatmap-density"],
                0, "rgba(0,0,0,0)",
                0.2, "hsla(45,95%,55%,0.35)",
                0.4, "hsla(35,95%,55%,0.55)",
                0.6, "hsla(20,95%,55%,0.75)",
                0.8, "hsla(0,95%,55%,0.9)",
                1, "hsla(330,95%,60%,1)",
              ],
              "heatmap-radius": ["interpolate", ["linear"], ["zoom"], 0, 14, 9, 40],
              "heatmap-opacity": heat ? 0.85 : 0,
            },
          });
        }
        if (map.getLayer(LAYER)) {
          map.setPaintProperty(LAYER, "heatmap-opacity", heat ? 0.85 : 0);
        }
      } catch { /* style not yet ready */ }
    };

    if (map.isStyleLoaded()) apply();
    else map.once("style.load", apply);
  }, [points, heat, maxScore]);

  if (tokenLoading) {
    return (
      <div className="royal-card p-8 flex items-center justify-center text-sm text-muted-foreground">
        <Loader2 size={16} className="animate-spin mr-2" /> Loading map…
      </div>
    );
  }
  if (tokenError || !token) {
    return (
      <div className="royal-card p-6 text-sm text-muted-foreground">
        <p className="font-display text-base text-foreground mb-1">Map unavailable</p>
        <p>The Mapbox token isn't configured. An admin can add it in Lovable Cloud secrets as <code className="text-gold">MAPBOX_PUBLIC_TOKEN</code>.</p>
      </div>
    );
  }
  if (mapAuthError) {
    return (
      <div className="royal-card p-6 text-sm text-muted-foreground space-y-3 animate-fade-in">
        <div className="flex items-center gap-2">
          <MapPin size={16} className="text-gold" aria-hidden />
          <p className="font-display text-base text-foreground">The world map is taking a breather</p>
        </div>
        <p>
          We can't reach the map service right now (the tile provider returned a permission error).
          Your crowns and regions are safe — you can switch to the list view to keep exploring.
        </p>
        <div className="flex flex-wrap gap-2">
          <Button size="sm" variant="outline" onClick={async () => {
            // Reset the one-shot guard and ask the hook for a fresh token —
            // far cheaper than a full page reload and preserves filters/state.
            refreshAttemptedRef.current = null;
            setMapAuthError(false);
            const t = await refreshToken();
            if (!t) setMapAuthError(true);
          }}>
            Try again
          </Button>
          <Button size="sm" variant="ghost" onClick={() => navigate("/map?view=list")}>
            Open list view
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="royal-card p-3 overflow-hidden animate-fade-in">
      <div className="flex items-center justify-between mb-2 gap-2 flex-wrap">
        <div role="tablist" aria-label="Marker type" className="inline-flex p-0.5 rounded-md bg-secondary/40 border border-border text-xs">
          <button
            role="tab"
            aria-selected={markerMode === "posts"}
            onClick={() => setMarkerMode("posts")}
            className={`px-2.5 py-1 rounded transition ${markerMode === "posts" ? "bg-primary/20 text-primary font-semibold" : "text-muted-foreground"}`}
          >
            Crowned posts
          </button>
          <button
            role="tab"
            aria-selected={markerMode === "users"}
            onClick={() => setMarkerMode("users")}
            className={`px-2.5 py-1 rounded transition ${markerMode === "users" ? "bg-primary/20 text-primary font-semibold" : "text-muted-foreground"}`}
          >
            Top users
          </button>
        </div>
        <span className="text-[11px] text-muted-foreground flex items-center gap-1">
          <MapPin size={10} /> {points.length} mapped{approxCount > 0 ? ` · ${approxCount} approx.` : ""}
        </span>
      </div>
      <div ref={containerRef} className="w-full rounded-md overflow-hidden" style={{ height: "min(70vh, 560px)" }} />
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 mt-3 text-[11px] text-muted-foreground">
        <span className="flex items-center gap-1.5">
          <span className="w-2.5 h-2.5 rounded-full inline-block" style={{ background: "hsl(45 90% 60%)" }} aria-hidden /> Crown
        </span>
        {userId && (
          <span className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full inline-block" style={{ background: "hsl(45 95% 55%)", boxShadow: "0 0 8px hsl(45 95% 55%)" }} aria-hidden /> You
          </span>
        )}
        <span className="hidden md:inline italic">Hover a marker to preview · click to open</span>
      </div>
    </div>
  );
}

function escapeHtml(s: string) {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));
}

/* --------------------------- Live Indicator --------------------------- */

function relTime(ts: number) {
  const s = Math.max(0, Math.floor((Date.now() - ts) / 1000));
  if (s < 5) return "just now";
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  return `${h}h ago`;
}

function LiveIndicator({
  paused, changes, pending, blink, lastRefreshAt, onRefresh,
}: {
  paused: boolean;
  changes: number;
  pending: number;
  blink: number;
  lastRefreshAt: number;
  onRefresh: () => void;
}) {
  const [, setTick] = useState(0);
  useEffect(() => {
    const i = window.setInterval(() => setTick((n) => n + 1), 15000);
    return () => window.clearInterval(i);
  }, []);

  const dotColor = paused ? "bg-muted-foreground" : "bg-emerald-400";
  return (
    <button
      onClick={onRefresh}
      className="group flex items-center gap-2 h-8 px-2.5 rounded-md border border-border bg-secondary/40 hover:border-primary/40 transition text-xs focus-visible:ring-2 focus-visible:ring-primary focus-visible:outline-none"
      title={paused ? "Auto-paused — click to refresh" : "Live — click to refresh"}
      aria-label={`${paused ? "Live updates paused" : "Live updates active"}, ${changes} change${changes === 1 ? "" : "s"} since last refresh. Click to refresh.`}
    >
      <span className="relative flex items-center justify-center w-2.5 h-2.5">
        <span className={`absolute inset-0 rounded-full ${dotColor} opacity-80`} />
        {!paused && (
          <span
            key={blink}
            className={`absolute inset-0 rounded-full ${dotColor} ${blink ? "animate-ping" : ""}`}
          />
        )}
      </span>
      <span className="flex items-center gap-1 text-muted-foreground group-hover:text-foreground">
        {paused ? <Pause size={11} /> : <Radio size={11} />}
        <span>{paused ? "Paused" : "Live"}</span>
      </span>
      {changes > 0 && (
        <span className="flex items-center gap-1 pl-1.5 ml-0.5 border-l border-border text-foreground tabular-nums">
          +{changes}
          {pending > 0 && <span className="text-[10px] text-muted-foreground">({pending} queued)</span>}
        </span>
      )}
      <span className="hidden sm:inline text-[10px] text-muted-foreground">· {relTime(lastRefreshAt)}</span>
    </button>
  );
}
