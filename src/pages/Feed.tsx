import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { Hash, X as XIcon, ArrowUp, Loader2, Clock, TrendingUp, Flame as FlameIcon, type LucideIcon } from "lucide-react";
import AppShell from "@/components/AppShell";
import { FeedPost } from "@/components/PostCard";
import CommentsDrawer from "@/components/CommentsDrawer";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { supabase } from "@/integrations/supabase/client";
import { POST_SELECT, hydrateParents } from "@/lib/postQuery";
import { useAuth } from "@/context/AuthContext";
import { useSeoMeta } from "@/hooks/useSeoMeta";
import { trackUsage } from "@/lib/usageTrack";
import FeedRightRail from "@/components/desktop/FeedRightRail";
import FeedRealtimeAlert from "@/components/FeedRealtimeAlert";
import DailyRewardChip from "@/components/DailyRewardChip";
import { Camera, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { CrownCategory } from "@/lib/crown";
import { FILTERS, FilterId } from "@/lib/filters";
import SpotlightStrip from "@/components/feed/SpotlightStrip";
import FeedSkeleton from "@/components/feed/FeedSkeleton";
import FeedEmptyState from "@/components/feed/FeedEmptyState";
import FeedErrorState from "@/components/feed/FeedErrorState";
import BackToTopButton from "@/components/feed/BackToTopButton";
import FeedPostCard from "@/components/feed/FeedPostCard";
import { useFeedFilters, isFilteredOut } from "@/hooks/useFeedFilters";
import { useCategoryTree } from "@/lib/categories";

type Tab = "nearby" | "city" | "state" | "global" | "following";
type CatFilter = "all" | CrownCategory;
type FilterSort = "off" | "filtered-first" | FilterId;
type SortMode = "latest" | "top" | "rising";
type TimeWindow = "24h" | "7d" | "30d" | "all";

const PAGE_SIZE = 25;
const FILTER_SORT_KEY = "crownme:feed:filter-sort";
const FEED_TAB_KEY = "crownme:feed:tab";
const TAG_FILTER_KEY = "crownme:feed:tag";
const SORT_KEY = "crownme:feed:sort";
const WINDOW_KEY = "crownme:feed:window";
const HUB_KEY = "crownme:feed:hub";
const TOPIC_KEY = "crownme:feed:topic";

const isValidFilterSort = (v: unknown): v is FilterSort => {
  if (v === "off" || v === "filtered-first") return true;
  if (typeof v !== "string") return false;
  return FILTERS.some((f) => f.id === v && f.id !== "none");
};

const readSavedFilterSort = (): FilterSort => {
  try {
    const v = localStorage.getItem(FILTER_SORT_KEY);
    return isValidFilterSort(v) ? v : "off";
  } catch { return "off"; }
};

const isValidTab = (v: unknown): v is Tab =>
  v === "nearby" || v === "city" || v === "state" || v === "global" || v === "following";

const readSavedTab = (): Tab => {
  try {
    const v = localStorage.getItem(FEED_TAB_KEY);
    return isValidTab(v) ? v : "global";
  } catch { return "global"; }
};

const readSavedSort = (): SortMode => {
  try {
    const v = localStorage.getItem(SORT_KEY);
    return v === "top" || v === "rising" || v === "latest" ? v : "latest";
  } catch { return "latest"; }
};

const readSavedWindow = (): TimeWindow => {
  try {
    const v = localStorage.getItem(WINDOW_KEY);
    return v === "24h" || v === "7d" || v === "30d" || v === "all" ? v : "all";
  } catch { return "all"; }
};

const windowSince = (w: TimeWindow): string | null => {
  if (w === "all") return null;
  const ms = w === "24h" ? 86400e3 : w === "7d" ? 7 * 86400e3 : 30 * 86400e3;
  return new Date(Date.now() - ms).toISOString();
};

// ── Hoisted chip components ──────────────────────────────────────────────────
// Defined outside Feed so React sees a stable component type on every render.
// An inline definition would cause React to unmount+remount the DOM subtree on
// every Feed state change — even when the chip hasn't changed at all.

interface SortChipProps {
  value: SortMode; label: string; icon: LucideIcon;
  currentSort: SortMode; onSort: (v: SortMode) => void;
}
const SortChip = memo(function SortChip({ value, label, icon: Icon, currentSort, onSort }: SortChipProps) {
  return (
    <button
      onClick={() => onSort(value)}
      className={`shrink-0 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[11px] font-bold uppercase tracking-wider border transition ${
        currentSort === value
          ? "bg-gradient-gold text-primary-foreground border-transparent gold-shadow"
          : "bg-card/60 text-muted-foreground border-border hover:border-primary/40 hover:text-foreground"
      }`}
      aria-pressed={currentSort === value}
    >
      <Icon size={12} /> {label}
    </button>
  );
});

interface WindowChipProps {
  value: TimeWindow; label: string;
  currentWindow: TimeWindow; onWindow: (v: TimeWindow) => void;
}
const WindowChip = memo(function WindowChip({ value, label, currentWindow, onWindow }: WindowChipProps) {
  return (
    <button
      onClick={() => onWindow(value)}
      className={`shrink-0 px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider border transition ${
        currentWindow === value
          ? "bg-primary/15 text-primary border-primary/40"
          : "bg-card/60 text-muted-foreground border-border hover:text-foreground"
      }`}
      aria-pressed={currentWindow === value}
    >
      {label}
    </button>
  );
});

export default function Feed() {
  const { profile, user } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const tagFilter = (searchParams.get("tag") || "").toLowerCase().trim();
  const qFilter = (searchParams.get("q") || "").trim();

  useEffect(() => { trackUsage("feed_opened"); }, []);

  useEffect(() => {
    if (tagFilter) {
      try { localStorage.setItem(TAG_FILTER_KEY, tagFilter); } catch { /* noop */ }
      return;
    }
    try {
      const saved = localStorage.getItem(TAG_FILTER_KEY);
      if (saved && saved.trim()) {
        const next = new URLSearchParams(searchParams);
        next.set("tag", saved.trim());
        setSearchParams(next, { replace: true });
      }
    } catch { /* noop */ }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tagFilter]);

  useSeoMeta({
    title: tagFilter ? `#${tagFilter} · CrownMe` : "Royal Feed · CrownMe",
    description: "See who's competing for the crown right now.",
  });

  const [tab, setTab] = useState<Tab>(() => readSavedTab());
  const [catFilter, setCatFilter] = useState<CatFilter>("all");
  const [sort, setSort] = useState<SortMode>(() => readSavedSort());
  const [timeWindow, setTimeWindow] = useState<TimeWindow>(() => readSavedWindow());
  const [filterSort, setFilterSort] = useState<FilterSort>(() => readSavedFilterSort());

  // Category system filters — hub (main category) + topic (subcategory). URL
  // params win over localStorage so a shared link instantly applies a filter.
  const { mains: hubList, subs: topicList } = useCategoryTree();
  const initialHub = searchParams.get("hub") || (typeof localStorage !== "undefined" ? localStorage.getItem(HUB_KEY) : "") || "";
  const initialTopic = searchParams.get("topic") || (typeof localStorage !== "undefined" ? localStorage.getItem(TOPIC_KEY) : "") || "";
  const [hubSlug, setHubSlug] = useState<string>(initialHub);
  const [topicSlug, setTopicSlug] = useState<string>(initialTopic);

  useEffect(() => { try { localStorage.setItem(FEED_TAB_KEY, tab); } catch { /* noop */ } }, [tab]);
  useEffect(() => { try { localStorage.setItem(SORT_KEY, sort); } catch { /* noop */ } }, [sort]);
  useEffect(() => { try { localStorage.setItem(WINDOW_KEY, timeWindow); } catch { /* noop */ } }, [timeWindow]);
  useEffect(() => { try { localStorage.setItem(FILTER_SORT_KEY, filterSort); } catch { /* noop */ } }, [filterSort]);
  useEffect(() => {
    try { localStorage.setItem(HUB_KEY, hubSlug); localStorage.setItem(TOPIC_KEY, topicSlug); } catch { /* noop */ }
    const next = new URLSearchParams(searchParams);
    if (hubSlug) next.set("hub", hubSlug); else next.delete("hub");
    if (topicSlug) next.set("topic", topicSlug); else next.delete("topic");
    setSearchParams(next, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hubSlug, topicSlug]);

  const visibleTopics = useMemo(() => {
    if (!hubSlug) return [];
    const hub = hubList.find((h) => h.slug === hubSlug);
    if (!hub) return [];
    return topicList.filter((t) => t.main_category_id === hub.id);
  }, [hubSlug, hubList, topicList]);

  // If the saved topic no longer belongs to the chosen hub, clear it.
  useEffect(() => {
    if (!topicSlug) return;
    if (!hubSlug) { setTopicSlug(""); return; }
    if (visibleTopics.length === 0) return; // still loading
    if (!visibleTopics.some((t) => t.slug === topicSlug)) setTopicSlug("");
  }, [hubSlug, visibleTopics, topicSlug]);

  // ── Scroll restoration ─────────────────────────────────────────────────────
  // When the user opens a post and presses back, the browser remounts Feed.
  // We persist scrollY (per filter signature) in sessionStorage and restore
  // it once the matching post list is on the page. Persistence is throttled
  // so the scroll listener stays cheap.
  const scrollKey = useMemo(
    () => `crownme:feed:scroll:${tab}:${catFilter}:${hubSlug}:${topicSlug}:${tagFilter}:${sort}:${timeWindow}`,
    [tab, catFilter, hubSlug, topicSlug, tagFilter, sort, timeWindow],
  );
  useEffect(() => {
    let pending = false;
    const save = () => {
      pending = false;
      try { sessionStorage.setItem(scrollKey, String(window.scrollY)); } catch { /* noop */ }
    };
    const onScroll = () => {
      if (pending) return;
      pending = true;
      window.requestAnimationFrame(save);
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => { window.removeEventListener("scroll", onScroll); save(); };
  }, [scrollKey]);


  const [debouncedFilterSort, setDebouncedFilterSort] = useState<FilterSort>(filterSort);
  useEffect(() => {
    const t = setTimeout(() => setDebouncedFilterSort(filterSort), 180);
    return () => clearTimeout(t);
  }, [filterSort]);

  const [posts, setPosts] = useState<FeedPost[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [openComment, setOpenComment] = useState<string | null>(null);
  const [newPosts, setNewPosts] = useState<FeedPost[]>([]);
  const [followingIds, setFollowingIds] = useState<string[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  // Bumping this forces the load effect to re-run for Retry, without clobbering
  // the tab/filter state or clearing previously-rendered posts.
  const [reloadKey, setReloadKey] = useState(0);

  // Block + muted-word filters (loaded once per user, applied to query
  // results AND realtime INSERTs).
  const feedFilters = useFeedFilters();

  // Restore saved scrollY once posts for the current filter signature have
  // rendered. We only do this once per mount-per-signature so manual scrolls
  // afterward aren't yanked back.
  const restoredFor = useRef<string | null>(null);
  useEffect(() => {
    if (loading) return;
    if (posts.length === 0) return;
    if (restoredFor.current === scrollKey) return;
    let saved: number | null = null;
    try {
      const v = sessionStorage.getItem(scrollKey);
      saved = v ? parseInt(v, 10) : null;
    } catch { /* noop */ }
    restoredFor.current = scrollKey;
    if (saved && saved > 0) {
      // Defer to next frame so PostCards have a chance to lay out before scroll.
      window.requestAnimationFrame(() => {
        try { window.scrollTo(0, saved!); } catch { /* noop */ }
      });
    }
  }, [loading, posts.length, scrollKey]);


  // Pre-fetch following ids so the "Following" tab + INSERT filter both work.
  useEffect(() => {
    if (!user) { setFollowingIds(null); return; }
    let cancelled = false;
    (async () => {
      const { data } = await supabase.from("follows").select("following_id").eq("follower_id", user.id);
      if (!cancelled) setFollowingIds((data || []).map((f: any) => f.following_id));
    })();
    return () => { cancelled = true; };
  }, [user?.id]);

  const orderColumn = sort === "latest" ? "created_at" : "crown_score";
  const sinceIso = useMemo(() => (sort === "rising" ? windowSince("24h") : windowSince(timeWindow)), [sort, timeWindow]);

  const buildQuery = useCallback((opts: { cursor?: { val: string | number; id: string } | null }) => {
    let q = supabase
      .from("posts")
      .select(POST_SELECT)
      .eq("is_removed", false)
      // Archived posts belong only to the owner's archive view — never in Feed.
      .eq("is_archived", false)
      // Main feed shows posts only. Vertical Scrolls live on /shorts under
      // their own immersive surface — mixing them into the grid feed makes
      // for a broken layout. Legacy rows that were inserted before
      // `content_type` existed (image rows backfilled as 'post', video rows
      // backfilled as 'scroll') route correctly via the backfill migration.
      .eq("content_type", "post")
      .order(orderColumn, { ascending: false })
      .order("id", { ascending: false })
      .limit(PAGE_SIZE);

    if (catFilter !== "all") q = q.eq("category", catFilter);
    if (hubSlug) q = q.eq("main_category_slug", hubSlug);
    if (topicSlug) q = q.eq("subcategory_slug", topicSlug);
    if (tagFilter) q = q.contains("hashtags", [tagFilter]);
    if (qFilter) q = q.ilike("caption", `%${qFilter.replace(/[%_]/g, (m) => `\\${m}`)}%`);
    if (sinceIso) q = q.gte("created_at", sinceIso);

    if (tab === "city" && profile?.city) q = q.eq("city", profile.city);
    else if (tab === "state" && profile?.state) q = q.eq("state", profile.state);
    else if (tab === "nearby" && profile?.city) q = q.eq("city", profile.city);

    if (opts.cursor) {
      // Simple keyset: rows with a strictly smaller sort value. id-tiebreak
      // is rare enough at our scale that the dedupe in setPosts handles it.
      q = q.lt(orderColumn, opts.cursor.val as any);
    }
    return q;
  }, [catFilter, hubSlug, topicSlug, tagFilter, qFilter, sinceIso, tab, profile?.city, profile?.state, orderColumn]);


  // INITIAL / FILTER-CHANGE LOAD
  useEffect(() => {
    if (!feedFilters.ready) return; // wait for blocks/muted-words
    let cancelled = false;
    const load = async () => {
      setLoading(true);
      setLoadError(null);
      setNewPosts([]);
      setHasMore(true);

      if (tab === "following") {
        if (!user) { if (!cancelled) { setPosts([]); setLoading(false); setHasMore(false); } return; }
        if (followingIds === null) return; // wait for fetch
        if (followingIds.length === 0) { if (!cancelled) { setPosts([]); setLoading(false); setHasMore(false); } return; }
      }

      let q = buildQuery({ cursor: null });
      if (tab === "following" && followingIds && followingIds.length) q = q.in("user_id", followingIds);

      const { data, error } = await q;
      if (cancelled) return;
      if (error) {
        // Never surface raw database/PostgREST errors (e.g. "permission denied
        // for table posts") to end users — log for diagnostics only. Preserve
        // any previously-rendered posts so the screen doesn't flash blank on
        // a transient failure; the FeedErrorState banner surfaces retry.
        console.error("[Feed] load failed:", error);
        toast.error("Couldn't load posts right now");
        setLoadError("Couldn't load posts right now.");
        setLoading(false);
        return;
      }
      const rows = ((data as any[]) || []).filter((p) => !isFilteredOut(p, feedFilters));
      await hydrateParents(rows);
      setPosts(rows as FeedPost[]);
      setHasMore(((data as any[]) || []).length >= PAGE_SIZE);
      setLoading(false);
    };
    load();
    return () => { cancelled = true; };
  }, [tab, catFilter, hubSlug, topicSlug, tagFilter, sort, timeWindow, profile?.city, profile?.state, user?.id, followingIds, buildQuery, feedFilters, reloadKey]);


  // LOAD MORE (infinite scroll)
  const loadMore = useCallback(async () => {
    if (loading || loadingMore || !hasMore || posts.length === 0) return;
    const last = posts[posts.length - 1] as any;
    const cursorVal = orderColumn === "created_at" ? last.created_at : last.crown_score;
    setLoadingMore(true);
    let q = buildQuery({ cursor: { val: cursorVal, id: last.id } });
    if (tab === "following" && followingIds && followingIds.length) q = q.in("user_id", followingIds);
    const { data, error } = await q;
    if (error) { setLoadingMore(false); return; }
    const rawRows = (data as any[]) || [];
    const rows = rawRows.filter((r) => !isFilteredOut(r, feedFilters));
    await hydrateParents(rows);
    setPosts((prev) => {
      const seen = new Set(prev.map((p) => p.id));
      return [...prev, ...rows.filter((r) => !seen.has(r.id))] as FeedPost[];
    });
    setHasMore(rawRows.length >= PAGE_SIZE);
    setLoadingMore(false);
  }, [posts, loading, loadingMore, hasMore, orderColumn, buildQuery, tab, followingIds, feedFilters]);

  // IntersectionObserver sentinel
  const sentinelRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    const el = sentinelRef.current;
    if (!el) return;
    const io = new IntersectionObserver((entries) => {
      if (entries[0]?.isIntersecting) loadMore();
    }, { rootMargin: "600px 0px" });
    io.observe(el);
    return () => io.disconnect();
  }, [loadMore]);

  // REALTIME — UPDATE/DELETE patch + INSERT queue for "new posts" pill.
  const matchesCurrentFilters = useCallback((p: any): boolean => {
    if (!p) return false;
    if (p.is_removed || p.is_archived) return false;
    // Feed is post-only; Scrolls have their own surface.
    if (p.content_type && p.content_type !== "post") return false;
    if (isFilteredOut(p, feedFilters)) return false;
    if (catFilter !== "all" && p.category !== catFilter) return false;
    if (hubSlug && p.main_category_slug !== hubSlug) return false;
    if (topicSlug && p.subcategory_slug !== topicSlug) return false;
    if (tagFilter && !(Array.isArray(p.hashtags) && p.hashtags.includes(tagFilter))) return false;
    if (sinceIso && p.created_at && p.created_at < sinceIso) return false;
    if (tab === "city" && profile?.city && p.city !== profile.city) return false;
    if (tab === "state" && profile?.state && p.state !== profile.state) return false;
    if (tab === "nearby" && profile?.city && p.city !== profile.city) return false;
    if (tab === "following") {
      if (!followingIds || !followingIds.includes(p.user_id)) return false;
    }
    return true;
  }, [catFilter, hubSlug, topicSlug, tagFilter, sinceIso, tab, profile?.city, profile?.state, followingIds, feedFilters]);

  useEffect(() => {
    const onUpdated = (e: Event) => {
      const d = (e as CustomEvent).detail;
      if (!d?.id) return;
      setPosts((prev) => prev.map((p) => {
        // Patch the row itself if it's the target.
        if (p.id === d.id) {
          return { ...p, ...(d.caption !== undefined ? { caption: d.caption } : {}), ...(d.image_url !== undefined ? { image_url: d.image_url } : {}), ...(d.filter !== undefined ? { filter: d.filter } : {}), ...(d.edited_at !== undefined ? { edited_at: d.edited_at } : {}) };
        }
        // If a repost's original updated, patch the parent metadata.
        if ((p as any).parent_post_id === d.id && (p as any).parent) {
          const parent = (p as any).parent;
          return { ...p, parent: { ...parent, ...(d.caption !== undefined ? { caption: d.caption } : {}), ...(d.image_url !== undefined ? { image_url: d.image_url } : {}), ...(d.filter !== undefined ? { filter: d.filter } : {}) } } as any;
        }
        return p;
      }));
    };
    const onDeleted = (e: Event) => {
      const d = (e as CustomEvent).detail;
      if (!d?.id) return;
      setPosts((prev) => prev.flatMap((p) => {
        if (p.id === d.id) return [];
        // A repost whose original was deleted should show "unavailable" fallback.
        if ((p as any).parent_post_id === d.id) return [{ ...p, parent: null } as any];
        return [p];
      }));
    };
    window.addEventListener("post:updated", onUpdated);
    window.addEventListener("post:deleted", onDeleted);

    const ch = supabase
      .channel(`feed-posts-rt-${Math.random().toString(36).slice(2, 8)}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "posts" }, async (payload) => {
        const n: any = payload.new;
        if (!n || !matchesCurrentFilters(n)) return;
        // hydrate profile join
        const { data: prof } = await supabase
          .from("profiles")
          .select("username, profile_photo_url, crowns_held, gender, hide_likes, hide_comments, hide_views, verified")
          .eq("id", n.user_id)
          .maybeSingle();
        const enriched = { ...n, profile: prof || { username: "—", profile_photo_url: null, crowns_held: 0 } } as FeedPost;
        setNewPosts((prev) => prev.some((p) => p.id === n.id) ? prev : [enriched, ...prev].slice(0, 50));
      })
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "posts" }, (payload) => {
        const n: any = payload.new;
        if (!n) return;
        setPosts((prev) => {
          const next: FeedPost[] = [];
          for (const p of prev) {
            // Direct row patch — but if it no longer matches, drop it.
            if (p.id === n.id) {
              const merged = { ...p, ...n, profile: (p as any).profile, parent: (p as any).parent } as FeedPost;
              if (!matchesCurrentFilters(merged)) continue;
              next.push(merged);
              continue;
            }
            // Parent (original) updated → propagate to any repost referencing it.
            if ((p as any).parent_post_id === n.id) {
              const parent = (p as any).parent;
              // If original became removed/archived, clear parent so UI shows fallback.
              if (n.is_removed || n.is_archived) {
                next.push({ ...p, parent: null } as any);
              } else if (parent) {
                next.push({ ...p, parent: { ...parent, ...n } } as any);
              } else {
                next.push(p);
              }
              continue;
            }
            next.push(p);
          }
          return next;
        });
        // Also prune from newPosts pill if it stopped matching.
        setNewPosts((prev) => prev.map((p) => p.id === n.id ? ({ ...p, ...n, profile: (p as any).profile } as FeedPost) : p).filter((p) => matchesCurrentFilters(p)));
      })
      .on("postgres_changes", { event: "DELETE", schema: "public", table: "posts" }, (payload) => {
        const o: any = payload.old;
        if (!o?.id) return;
        setPosts((prev) => prev.flatMap((p) => {
          if (p.id === o.id) return [];
          if ((p as any).parent_post_id === o.id) return [{ ...p, parent: null } as any];
          return [p];
        }));
        setNewPosts((prev) => prev.filter((p) => p.id !== o.id));
      })
      .subscribe();

    return () => {
      window.removeEventListener("post:updated", onUpdated);
      window.removeEventListener("post:deleted", onDeleted);
      supabase.removeChannel(ch);
    };
  }, [matchesCurrentFilters]);

  // Show queued new posts at the top of the feed.
  // Wrapped in useCallback so the "new posts" pill button gets a stable onClick ref.
  const showNewPosts = useCallback(() => {
    setPosts((prev) => {
      const seen = new Set(prev.map((p) => p.id));
      return [...newPosts.filter((p) => !seen.has(p.id)), ...prev];
    });
    setNewPosts([]);
    try { window.scrollTo({ top: 0, behavior: "smooth" }); } catch { /* noop */ }
  // newPosts is intentionally captured here — it's the batch we want to prepend.
   
  }, [newPosts]);

  // Pull-to-refresh (mobile only)
  const ptrRef = useRef<HTMLDivElement | null>(null);
  const [pullDist, setPullDist] = useState(0);
  // ↓ Ref keeps the live pullDist value available inside the effect's onEnd
  // closure WITHOUT putting pullDist in the dep array — which would re-register
  // the touch listeners on every pixel of a pull gesture (~90×/swipe).
  const pullDistRef = useRef(0);
  const [refreshing, setRefreshing] = useState(false);
  useEffect(() => {
    const el = ptrRef.current;
    if (!el) return;
    // Respect prefers-reduced-motion: disable the pull-to-refresh gesture
    // entirely (browser-native reload still works on iOS Safari).
    const reduce = typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    if (reduce) return;
    let startY = 0;
    let startX = 0;
    let active = false;
    const onStart = (e: TouchEvent) => {
      if (window.scrollY > 0) { active = false; return; }
      startY = e.touches[0].clientY;
      startX = e.touches[0].clientX;
      active = true;
    };
    const onMove = (e: TouchEvent) => {
      if (!active) return;
      const dy = e.touches[0].clientY - startY;
      const dx = Math.abs(e.touches[0].clientX - startX);
      // If the user is clearly swiping horizontally (e.g. category carousel),
      // bail out of the pull gesture entirely.
      if (dx > 12 && dx > Math.abs(dy)) { active = false; pullDistRef.current = 0; setPullDist(0); return; }
      if (dy > 0) {
        const d = Math.min(90, dy * 0.5);
        pullDistRef.current = d;
        setPullDist(d);
      }
    };
    const onEnd = async () => {
      if (!active) return;
      active = false;
      if (pullDistRef.current >= 60) {
        setRefreshing(true);
        try {
          let q = buildQuery({ cursor: null });
          if (tab === "following" && followingIds && followingIds.length) q = q.in("user_id", followingIds);
          const { data } = await q;
          const rows = (data as any[]) || [];
          await hydrateParents(rows);
          setPosts(rows as FeedPost[]);
          setHasMore(rows.length >= PAGE_SIZE);
          setNewPosts([]);
        } catch { /* noop */ }
        setRefreshing(false);
      }
      pullDistRef.current = 0;
      setPullDist(0);
    };
    el.addEventListener("touchstart", onStart, { passive: true });
    el.addEventListener("touchmove", onMove, { passive: true });
    el.addEventListener("touchend", onEnd);
    return () => {
      el.removeEventListener("touchstart", onStart);
      el.removeEventListener("touchmove", onMove);
      el.removeEventListener("touchend", onEnd);
    };
  // pullDist removed — read via pullDistRef.current inside onEnd instead.
  }, [buildQuery, tab, followingIds]);

  const showRank = catFilter !== "all" || !!hubSlug || !!topicSlug || tab === "city" || tab === "state";

  const filterPopularity = useMemo(() => {
    const m = new Map<FilterId, number>();
    for (const p of posts) {
      const f = p.filter ?? null;
      if (!f || f === "none") continue;
      if (!FILTERS.some((x) => x.id === f)) continue;
      m.set(f as FilterId, (m.get(f as FilterId) ?? 0) + 1);
    }
    return m;
  }, [posts]);

  const trendingFilters = useMemo(
    () => Array.from(filterPopularity.entries()).sort((a, b) => b[1] - a[1]).slice(0, 5),
    [filterPopularity],
  );

  const orderedPosts = useMemo(() => {
    if (debouncedFilterSort === "off") return posts;
    const tier = (p: FeedPost): number => {
      const f = p.filter ?? null;
      if (debouncedFilterSort !== "filtered-first" && f === debouncedFilterSort) return 3;
      if (f) return 2;
      return 1;
    };
    return [...posts].map((p, i) => ({ p, i })).sort((a, b) => {
      const ta = tier(a.p), tb = tier(b.p);
      if (ta !== tb) return tb - ta;
      const popA = a.p.filter ? filterPopularity.get(a.p.filter as FilterId) ?? 0 : 0;
      const popB = b.p.filter ? filterPopularity.get(b.p.filter as FilterId) ?? 0 : 0;
      if (popA !== popB) return popB - popA;
      if (a.p.crown_score !== b.p.crown_score) return b.p.crown_score - a.p.crown_score;
      return a.i - b.i;
    }).map((x) => x.p);
  }, [posts, debouncedFilterSort, filterPopularity]);

  // Pre-attach rank to each post inside a useMemo so the rendered objects are
  // stable references — avoids creating a new `{ ...p, rank }` object on every
  // Feed render, which would defeat React.memo on PostCard.
  const rankedPosts = useMemo(
    () => orderedPosts.map((p, i) => ({ ...p, rank: showRank ? i + 1 : null })),
    [orderedPosts, showRank],
  );

  return (
    <AppShell title="CrownMe" rightRail={<FeedRightRail />}>
      <h1 className="sr-only">CrownMe Feed — latest posts from the community</h1>

      <div ref={ptrRef} style={{ transform: pullDist ? `translateY(${pullDist}px)` : undefined, transition: pullDist ? "none" : "transform 200ms ease" }}>
        {(pullDist > 0 || refreshing) && (
          <div className="flex items-center justify-center py-2 text-xs text-muted-foreground" aria-hidden>
            <Loader2 size={14} className={`mr-1.5 ${refreshing ? "animate-spin" : ""}`} />
            {refreshing ? "Refreshing…" : pullDist >= 60 ? "Release to refresh" : "Pull to refresh"}
          </div>
        )}

        {/* Desktop create-post card */}
        <Link to="/upload" className="hidden lg:flex items-center gap-3 royal-card p-4 mb-4 hover:border-primary/40 transition group">
          <div className="size-11 rounded-full bg-muted overflow-hidden ring-1 ring-border shrink-0">
            {profile?.profile_photo_url && (<img loading="lazy" src={profile.profile_photo_url} alt="" className="w-full h-full object-cover" />)}
          </div>
          <div className="flex-1 px-4 py-2.5 rounded-full bg-input/60 border border-border text-sm text-muted-foreground group-hover:border-primary/40 transition">
            Crown a moment, @{profile?.username ?? "royal"}…
          </div>
          <span className="size-11 rounded-full bg-gradient-gold text-primary-foreground flex items-center justify-center gold-shadow">
            <Camera size={18} strokeWidth={2.4} />
          </span>
        </Link>

        <FeedRealtimeAlert />


        {tagFilter && (
          <div className="mx-3 lg:mx-0 mt-3 flex items-center justify-between gap-2 royal-card px-3 py-2">
            <div className="flex items-center gap-2 min-w-0">
              <Hash size={14} className="text-primary shrink-0" />
              <span className="text-sm font-semibold truncate">
                Filtering by <span className="text-gold">#{tagFilter}</span>
              </span>
            </div>
            <button
              onClick={() => {
                const next = new URLSearchParams(searchParams);
                next.delete("tag");
                try { localStorage.removeItem(TAG_FILTER_KEY); } catch { /* noop */ }
                setSearchParams(next, { replace: true });
              }}
              className="inline-flex items-center gap-1 text-[11px] uppercase tracking-widest font-bold text-muted-foreground hover:text-foreground"
              aria-label="Clear hashtag filter"
            >
              <XIcon size={12} /> Clear
            </button>
          </div>
        )}

        <div className="-mx-3 lg:mx-0 bg-background border-b border-border/40 lg:border-0">
          <Tabs value={tab} onValueChange={(v) => setTab(v as Tab)} className="px-3 lg:px-0 pt-2 lg:pt-0">
            <TabsList className="w-full grid grid-cols-5 bg-muted/40 lg:h-11">
              <TabsTrigger value="nearby" className="text-xs lg:text-sm">Nearby</TabsTrigger>
              <TabsTrigger value="city" className="text-xs lg:text-sm">City</TabsTrigger>
              <TabsTrigger value="state" className="text-xs lg:text-sm">State</TabsTrigger>
              <TabsTrigger value="global" className="text-xs lg:text-sm">Global</TabsTrigger>
              <TabsTrigger value="following" className="text-xs lg:text-sm">Following</TabsTrigger>
            </TabsList>
          </Tabs>
        </div>

        {/* Sort + time window chips */}
        <div className="px-3 lg:px-0 pt-3 flex flex-wrap items-center gap-2">
          <SortChip value="latest" label="Latest" icon={Clock} currentSort={sort} onSort={setSort} />
          <SortChip value="top" label="Top" icon={TrendingUp} currentSort={sort} onSort={setSort} />
          <SortChip value="rising" label="Rising" icon={FlameIcon} currentSort={sort} onSort={setSort} />
          {sort === "top" && (
            <div className="flex items-center gap-1.5 ml-1">
              <WindowChip value="24h" label="24h" currentWindow={timeWindow} onWindow={setTimeWindow} />
              <WindowChip value="7d" label="7d" currentWindow={timeWindow} onWindow={setTimeWindow} />
              <WindowChip value="30d" label="30d" currentWindow={timeWindow} onWindow={setTimeWindow} />
              <WindowChip value="all" label="All" currentWindow={timeWindow} onWindow={setTimeWindow} />
            </div>
          )}
          <div className="ml-auto flex items-center gap-2">
            <DailyRewardChip />
          </div>
        </div>


        {/* Master Category (Hub) chip rail */}
        <div className="px-3 lg:px-0 pt-3">
          <div className="flex items-center gap-2 mb-1.5">
            <Sparkles size={12} className="text-primary" />
            <span className="text-[11px] uppercase tracking-widest text-muted-foreground font-bold">Master Category</span>
            {(hubSlug || topicSlug) && (
              <button
                onClick={() => { setHubSlug(""); setTopicSlug(""); }}
                className="ml-auto text-[10px] uppercase tracking-wider text-muted-foreground hover:text-foreground inline-flex items-center gap-1"
              >
                <XIcon size={10} /> Clear
              </button>
            )}
          </div>
          <div
            data-testid="hub-category-carousel"
            className="flex gap-2 overflow-x-auto no-scrollbar pb-2 -mx-3 lg:mx-0 px-3 lg:px-0"
            style={{ touchAction: "pan-x", overscrollBehaviorY: "contain", overscrollBehaviorX: "contain", WebkitOverflowScrolling: "touch" }}
          >
            <button
              onClick={() => { setHubSlug(""); setTopicSlug(""); }}
              className={`shrink-0 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[11px] font-bold uppercase tracking-wider border transition ${
                !hubSlug
                  ? "bg-gradient-gold text-primary-foreground border-transparent gold-shadow"
                  : "bg-card/60 text-muted-foreground border-border hover:border-primary/40 hover:text-foreground"
              }`}
            >
              <Sparkles size={12} fill="currentColor" /> All
            </button>
            {hubList.map((h) => {
              const active = hubSlug === h.slug;
              return (
                <button
                  key={h.id}
                  onClick={() => { setHubSlug(active ? "" : h.slug); setTopicSlug(""); }}
                  className={`shrink-0 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[11px] font-bold uppercase tracking-wider border transition ${
                    active
                      ? `text-white border-transparent shadow bg-gradient-to-br ${h.gradient ?? "from-amber-400 to-yellow-600"}`
                      : "bg-card/60 text-muted-foreground border-border hover:border-primary/40 hover:text-foreground"
                  }`}
                >
                  {h.label}
                </button>
              );
            })}
          </div>
        </div>

        {/* Topic chip rail — only when a hub is selected */}
        {hubSlug && visibleTopics.length > 0 && (
          <div className="px-3 lg:px-0 pt-2">
            <div className="flex items-center gap-2 mb-1.5">
              <Hash size={12} className="text-primary" />
              <span className="text-[11px] uppercase tracking-widest text-muted-foreground font-bold">Topic</span>
            </div>
            <div
              data-testid="topic-carousel"
              className="flex gap-2 overflow-x-auto no-scrollbar pb-2 -mx-3 lg:mx-0 px-3 lg:px-0"
              style={{ touchAction: "pan-x", overscrollBehaviorY: "contain", overscrollBehaviorX: "contain", WebkitOverflowScrolling: "touch" }}
            >
              <button
                onClick={() => setTopicSlug("")}
                className={`shrink-0 px-2.5 py-1 rounded-full text-[11px] font-semibold border transition ${
                  !topicSlug
                    ? "bg-primary/15 text-primary border-primary/40"
                    : "bg-card/60 text-muted-foreground border-border hover:text-foreground hover:border-primary/40"
                }`}
              >
                All topics
              </button>
              {visibleTopics.map((t) => {
                const active = topicSlug === t.slug;
                return (
                  <button
                    key={t.id}
                    onClick={() => setTopicSlug(active ? "" : t.slug)}
                    className={`shrink-0 px-2.5 py-1 rounded-full text-[11px] font-semibold border transition ${
                      active
                        ? "bg-primary text-primary-foreground border-primary"
                        : "bg-card/60 text-muted-foreground border-border hover:text-foreground hover:border-primary/40"
                    }`}
                  >
                    {t.label}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* Trending Filters strip moved to Discover page only */}

        {/* New posts pill */}
        {newPosts.length > 0 && (
          <div className="sticky top-[112px] z-30 flex justify-center pt-2 pointer-events-none">
            <button
              onClick={showNewPosts}
              aria-live="polite"
              className="pointer-events-auto inline-flex items-center gap-2 px-4 py-2 rounded-full bg-gradient-gold text-primary-foreground text-xs font-bold gold-shadow shadow-lg animate-fade-in"
            >
              <ArrowUp size={14} />
              {newPosts.length} new {newPosts.length === 1 ? "post" : "posts"}
            </button>
          </div>
        )}
        <span className="sr-only" aria-live="polite" aria-atomic="true">
          {newPosts.length > 0 ? `${newPosts.length} new ${newPosts.length === 1 ? "post" : "posts"} available` : ""}
        </span>

        <div className="px-3 lg:px-0 pt-1">
          <div className="pb-3"><SpotlightStrip /></div>
          {loading ? (
            <FeedSkeleton count={4} />
          ) : loadError ? (
            <FeedErrorState
              onRetry={() => {
                setLoadError(null);
                setReloadKey((k) => k + 1);
              }}
              onGoGlobal={tab !== "global" ? () => { setTab("global"); setCatFilter("all"); } : undefined}
              message={loadError}
            />
          ) : orderedPosts.length === 0 ? (
            <FeedEmptyState
              tab={tab}
              catFilter={catFilter}
              tagFilter={tagFilter}
              city={profile?.city}
              state={profile?.state}
              hasAnyFilter={catFilter !== "all" || !!hubSlug || !!topicSlug || !!tagFilter || tab !== "global"}
              onClearFilters={() => {
                setCatFilter("all");
                if (tagFilter) {
                  const next = new URLSearchParams(searchParams);
                  next.delete("tag");
                  try { localStorage.removeItem(TAG_FILTER_KEY); } catch { /* noop */ }
                  setSearchParams(next, { replace: true });
                }
              }}
              onGoGlobal={() => { setTab("global"); }}
            />
          ) : (
            <>
              {rankedPosts.map((p) => (
                <FeedPostCard
                  key={p.id}
                  post={p}
                  onCommentClick={setOpenComment}
                  feature="Feed"
                  tab={tab}
                  category={p.category ?? null}
                />
              ))}
              <div ref={sentinelRef} className="h-12 flex items-center justify-center">
                {loadingMore && (
                  <div className="inline-flex items-center gap-2 text-xs text-muted-foreground">
                    <Loader2 size={14} className="animate-spin" /> Loading more royals…
                  </div>
                )}
                {!hasMore && posts.length > 0 && (
                  <div className="text-[11px] uppercase tracking-widest text-muted-foreground/60 font-bold py-4">
                    👑 You've reached the end
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      </div>

      <CommentsDrawer postId={openComment} onClose={() => setOpenComment(null)} />
      <BackToTopButton />
    </AppShell>
  );
}
