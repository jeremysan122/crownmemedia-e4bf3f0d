import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import AppShell from "@/components/AppShell";
import { useSeoMeta } from "@/hooks/useSeoMeta";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/context/AuthContext";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Swords, Crown, Search, Share2, Sparkles, Clock, MapPin, Check, Loader2, Flame, Lock, RotateCw,
} from "lucide-react";
import * as LucideIcons from "lucide-react";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { CATEGORY_LABEL, CrownCategory, timeUntil, locationLabel } from "@/lib/crown";
import { cssFor, isValidFilter, type FilterId } from "@/lib/filters";
import { useCountdown } from "@/hooks/useCountdown";
import { toast } from "sonner";
import ChallengeDialog from "@/components/battles/ChallengeDialog";
import AcceptBattleDialog from "@/components/battles/AcceptBattleDialog";
import ShareBattleDialog from "@/components/battles/ShareBattleDialog";
import TopBattlersWidget from "@/components/battles/TopBattlersWidget";
import WinnerReveal from "@/components/battles/WinnerReveal";
import { OfficialResultBadge } from "@/components/battles/OfficialResultBadge";
import { haptic } from "@/lib/haptics";
import { trackEvent } from "@/lib/analytics";
import { isSafeBattleForList } from "@/lib/battlesLogic";
import { invalidateOfficialResult } from "@/hooks/useOfficialBattleResult";
import { Play } from "lucide-react";
import { fetchMainCategories, fetchSubcategories, type MainCategory, type Subcategory } from "@/lib/categories";
import {
  appendDedup,
  emptyPerTab,
  loadPersistedState,
  nextCursor,
  PAGE_SIZE,
  savePersistedState,
  tabPredicate,
  TAB_KEYS,
  type BattleCursor,
  type PersistedTabState,
  type TabKey,
} from "@/lib/battlesPagination";

interface Battle {
  id: string;
  challenger_id: string; opponent_id: string;
  challenger_post_id: string; opponent_post_id: string | null;
  challenger_votes: number; opponent_votes: number;
  status: string; ends_at: string | null; winner_id: string | null;
  created_at: string;
  challenger: { username: string; profile_photo_url: string | null } | null;
  opponent: { username: string; profile_photo_url: string | null } | null;
  challenger_post: { image_url: string; category: CrownCategory; city: string | null; state: string | null; country: string | null; main_category_slug: string | null; subcategory_slug: string | null; filter: string | null } | null;
  opponent_post: { image_url: string; category: CrownCategory; filter: string | null } | null;
}

const SkeletonCard = () => (
  <div className="royal-card overflow-hidden animate-pulse">
    <div className="grid grid-cols-2 gap-px"><div className="aspect-square bg-muted/40" /><div className="aspect-square bg-muted/40" /></div>
    <div className="h-2 bg-muted/30" />
    <div className="p-3 h-10" />
  </div>
);

function CountdownPill({ endsAt }: { endsAt: string }) {
  const remaining = useCountdown(new Date(endsAt).getTime());
  const urgent = remaining > 0 && remaining < 3600;
  if (remaining <= 0) return <span className="text-[10px] uppercase font-bold text-muted-foreground">Ended</span>;
  return (
    <span className={`inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider ${
      urgent ? "text-destructive animate-pulse" : "text-primary"
    }`}>
      <Clock size={10} /> {timeUntil(endsAt)}
    </span>
  );
}

const SELECT_COLS = `*,
  challenger:profiles!battles_challenger_id_fkey(username, profile_photo_url),
  opponent:profiles!battles_opponent_id_fkey(username, profile_photo_url),
  challenger_post:posts!battles_challenger_post_id_fkey(image_url, category, city, state, country, main_category_slug, subcategory_slug, filter),
  opponent_post:posts!battles_opponent_post_id_fkey(image_url, category, filter)
`;

/** Max server pages to chain inside one Load More click before yielding back
 * to the user (avoids walking the whole table when a tab's predicate matches rarely). */
const MAX_AUTO_CHAIN = 4;

export default function Battles() {
  useSeoMeta({
    title: "Battles · CrownMe",
    description:
      "Head-to-head crown battles. Challenge rivals, vote for the best, and watch who takes the throne.",
  });
  const { user } = useAuth();
  const nav = useNavigate();
  const [params, setParams] = useSearchParams();

  // ---- Filters (search/sort/category/region/hub/topic) ----
  const [query, setQuery] = useState(params.get("q") || "");
  const [region, setRegion] = useState<string>(params.get("region") || "all");
  const [category, setCategory] = useState<string>(params.get("category") || "all");
  const [sort, setSort] = useState<string>(params.get("sort") || "hot");
  const [tab, setTab] = useState<TabKey>(((params.get("tab") as TabKey) || "active"));
  const [hub, setHub] = useState<string>(params.get("hub") || "all");
  const [topic, setTopic] = useState<string>(params.get("topic") || "all");
  const [mains, setMains] = useState<MainCategory[]>([]);
  const [subs, setSubs] = useState<Subcategory[]>([]);

  // ---- Per-tab pagination state (stable keyset cursor) ----
  const [perTab, setPerTab] = useState<Record<TabKey, PersistedTabState<Battle>>>(() => emptyPerTab<Battle>());
  const [tabLoading, setTabLoading] = useState<Record<TabKey, boolean>>({ active: false, pending: false, mine: false, done: false, declined: false });
  const [tabError, setTabError] = useState<Record<TabKey, boolean>>({ active: false, pending: false, mine: false, done: false, declined: false });
  // Tracks in-flight load() calls per tab so rapid double-clicks coalesce instead of duplicating fetches.
  const inFlightLoad = useRef<Record<TabKey, boolean>>({ active: false, pending: false, mine: false, done: false, declined: false });
  const [initialHydrating, setInitialHydrating] = useState(true);
  const restoredRef = useRef(false);

  // ---- Other UI state ----
  const [myVotes, setMyVotes] = useState<Record<string, string>>({});
  const [challengeOpen, setChallengeOpen] = useState(false);
  const [acceptBattle, setAcceptBattle] = useState<Battle | null>(null);
  const [shareBattle, setShareBattle] = useState<Battle | null>(null);
  const [burstMap, setBurstMap] = useState<Record<string, string>>({});
  const burstTimers = useRef<Record<string, any>>({});
  const [freshWins, setFreshWins] = useState<Set<string>>(new Set());
  const prevStatusRef = useRef<Record<string, { status: string; winner: string | null }>>({});
  const inFlightVotes = useRef<Set<string>>(new Set());
  const [submittingVotes, setSubmittingVotes] = useState<Set<string>>(new Set());
  const [blockedIds, setBlockedIds] = useState<Set<string>>(new Set());
  // Scroll restoration — capture pending scrollY across hydration so we can apply it after the first render with rows.
  const pendingScrollY = useRef<number | null>(null);

  useEffect(() => {
    if (!user) { setBlockedIds(new Set()); return; }
    (async () => {
      const { data } = await supabase.from("blocks").select("blocked_id").eq("blocker_id", user.id);
      setBlockedIds(new Set(((data as any[]) || []).map((r) => r.blocked_id)));
    })();
  }, [user?.id]);

  // ---- Fetch one page for a specific tab using its own cursor ----
  // The Active tab is platform-wide (any user's live battles), while the
  // four personal tabs (Pending / Mine / Past / Declined) share a viewer-
  // scoped query `(challenger_id=me OR opponent_id=me)`. Each tab still
  // owns its own cursor so paginating one tab never moves another's
  // pointer.
  const fetchPage = useCallback(async (forTab: TabKey, cursor: BattleCursor | null): Promise<{
    rows: Battle[]; nextCur: BattleCursor | null; exhausted: boolean;
  }> => {
    const isPlatformWide = forTab === "active";
    if (!isPlatformWide && !user) return { rows: [], nextCur: null, exhausted: true };
    let q = supabase
      .from("battles")
      .select(SELECT_COLS)
      .order("created_at", { ascending: false })
      .order("id", { ascending: false })
      .limit(PAGE_SIZE);
    if (isPlatformWide) {
      // Server-side narrow to active battles so the page is dense.
      q = q.eq("status", "active");
    } else if (user) {
      q = q.or(`challenger_id.eq.${user.id},opponent_id.eq.${user.id}`);
    }
    if (cursor) {
      // Strict keyset: created_at < cur.createdAt OR (created_at = cur.createdAt AND id < cur.id)
      q = q.or(
        `created_at.lt.${cursor.createdAt},and(created_at.eq.${cursor.createdAt},id.lt.${cursor.id})`,
      );
    }
    const { data, error } = await q;
    if (error) throw error;
    const raw = (data as any[]) || [];
    // Defence-in-depth safety filter — RLS is the source of truth, but we
    // also drop hidden/removed rows and blocked users before they reach
    // state, even after rehydration from sessionStorage. For the Declined
    // tab we deliberately keep declined/cancelled rows.
    const safety = forTab === "declined"
      ? raw.filter((b) => !blockedIds.has(b.challenger_id) && !blockedIds.has(b.opponent_id))
      : raw.filter((b) => isSafeBattleForList(b as any, { blockedIds }));
    const nowMs = Date.now();
    const matched = safety.filter((b) => tabPredicate(forTab, b as any, user?.id ?? null, nowMs)) as Battle[];
    const cur = nextCursor(raw, PAGE_SIZE);
    return { rows: matched, nextCur: cur, exhausted: cur === null };
  }, [user?.id, blockedIds]);

  // Load (initial or "load more") for a tab. Coalesces concurrent calls,
  // chains up to MAX_AUTO_CHAIN server pages when the tab predicate matches
  // nothing on the first page (so users don't see an idle Load More button
  // that "did nothing" when most of their battles are e.g. all Past).
  const loadTab = useCallback(async (forTab: TabKey, opts: { reset?: boolean } = {}) => {
    // Active is platform-wide so it can load without a session; the four
    // personal tabs still require a signed-in viewer.
    if (forTab !== "active" && !user) return;
    if (inFlightLoad.current[forTab]) return;
    inFlightLoad.current[forTab] = true;
    setTabLoading((s) => ({ ...s, [forTab]: true }));
    setTabError((s) => ({ ...s, [forTab]: false }));
    try {
      let cursor = opts.reset ? null : perTab[forTab].cursor;
      let appendedCount = 0;
      let exhausted = false;
      let workingRows: Battle[] = opts.reset ? [] : perTab[forTab].rows;
      for (let i = 0; i < MAX_AUTO_CHAIN; i++) {
        const { rows, nextCur, exhausted: ex } = await fetchPage(forTab, cursor);
        const { merged } = appendDedup(workingRows, rows);
        appendedCount += merged.length - workingRows.length;
        workingRows = merged;
        cursor = nextCur;
        exhausted = ex;
        if (ex) break;
        if (appendedCount > 0) break; // got at least one usable row → yield to user
      }
      setPerTab((s) => ({
        ...s,
        [forTab]: { rows: workingRows, cursor, exhausted },
      }));

      // Hydrate votes for newly-loaded battles only (requires a session).
      const newIds = workingRows.slice(opts.reset ? 0 : perTab[forTab].rows.length).map((b) => b.id);
      if (user && newIds.length) {
        const { data: votes } = await supabase
          .from("battle_votes")
          .select("battle_id, voted_for_user_id")
          .eq("user_id", user.id)
          .in("battle_id", newIds);
        if (votes && votes.length) {
          setMyVotes((m) => {
            const next = { ...m };
            (votes as any[]).forEach((v) => { next[v.battle_id] = v.voted_for_user_id; });
            return next;
          });
        }
      }
    } catch (e) {
      console.error("[battles] loadTab failed", forTab, e);
      setTabError((s) => ({ ...s, [forTab]: true }));
    } finally {
      inFlightLoad.current[forTab] = false;
      setTabLoading((s) => ({ ...s, [forTab]: false }));
    }
  }, [user?.id, perTab, fetchPage]);

  // ---- Initial mount: restore from sessionStorage or fetch fresh ----
  useEffect(() => {
    if (!user) { setInitialHydrating(false); return; }
    if (restoredRef.current) return;
    restoredRef.current = true;
    const restored = loadPersistedState<Battle>(user.id);
    if (restored) {
      setTab(restored.tab);
      setQuery(restored.filters.query);
      setRegion(restored.filters.region);
      setCategory(restored.filters.category);
      setSort(restored.filters.sort);
      setHub(restored.filters.hub);
      setTopic(restored.filters.topic);
      // Re-apply safety filter on rehydrated rows so a row that became
      // unsafe while the user was away can never re-appear from cache.
      const filtered: Record<TabKey, PersistedTabState<Battle>> = emptyPerTab<Battle>();
      for (const k of TAB_KEYS) {
        const t = restored.perTab[k];
        filtered[k] = {
          rows: t.rows.filter((b) => isSafeBattleForList(b as any, { blockedIds })),
          cursor: t.cursor,
          exhausted: t.exhausted,
        };
      }
      setPerTab(filtered);
      pendingScrollY.current = restored.scrollY;
      setInitialHydrating(false);
    } else {
      setInitialHydrating(false);
      // Fresh load for the initial tab.
      const initial = (params.get("tab") as TabKey) || "active";
      void loadTab(initial, { reset: true });
    }
  }, [user?.id]);

  // ---- Auto-load the active tab the first time it's viewed ----
  useEffect(() => {
    if (initialHydrating || !user) return;
    const t = perTab[tab];
    if (t.rows.length === 0 && !t.exhausted && !tabLoading[tab] && !tabError[tab]) {
      void loadTab(tab, { reset: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, user?.id, initialHydrating]);

  useEffect(() => { fetchMainCategories().then(setMains); fetchSubcategories().then(setSubs); }, []);

  // ---- Apply scroll restoration once rows are on screen ----
  useEffect(() => {
    if (pendingScrollY.current == null) return;
    if (perTab[tab].rows.length === 0) return;
    const y = pendingScrollY.current;
    pendingScrollY.current = null;
    requestAnimationFrame(() => window.scrollTo({ top: y, behavior: "auto" }));
  }, [tab, perTab]);

  // ---- Persist state on every meaningful change (debounced) ----
  useEffect(() => {
    if (!user || initialHydrating) return;
    const handle = window.setTimeout(() => {
      savePersistedState<Battle>({
        savedAt: Date.now(),
        viewerId: user.id,
        tab,
        filters: { query, region, category, sort, hub, topic },
        perTab,
        scrollY: window.scrollY,
      });
    }, 200);
    return () => window.clearTimeout(handle);
  }, [user?.id, initialHydrating, tab, query, region, category, sort, hub, topic, perTab]);

  // ---- Save scroll position before navigating away ----
  useEffect(() => {
    if (!user) return;
    const save = () => {
      savePersistedState<Battle>({
        savedAt: Date.now(),
        viewerId: user.id,
        tab,
        filters: { query, region, category, sort, hub, topic },
        perTab,
        scrollY: window.scrollY,
      });
    };
    window.addEventListener("pagehide", save);
    document.addEventListener("visibilitychange", save);
    return () => {
      save();
      window.removeEventListener("pagehide", save);
      document.removeEventListener("visibilitychange", save);
    };
  }, [user?.id, tab, query, region, category, sort, hub, topic, perTab]);

  // ---- URL sync for shareable deep links ----
  useEffect(() => {
    const next = new URLSearchParams(params);
    const setOrDel = (k: string, v: string, def: string) => {
      if (v && v !== def) next.set(k, v); else next.delete(k);
    };
    setOrDel("tab", tab, "active");
    setOrDel("region", region, "all");
    setOrDel("category", category, "all");
    setOrDel("sort", sort, "hot");
    setOrDel("q", query.trim(), "");
    setOrDel("hub", hub, "all");
    setOrDel("topic", topic, "all");
    if (next.toString() !== params.toString()) {
      setParams(next, { replace: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, region, category, sort, query, hub, topic]);

  // ---- Realtime: mutate any matching row across every tab's loaded rows ----
  const updateRowEverywhere = useCallback((id: string, patch: (b: Battle) => Battle) => {
    setPerTab((s) => {
      const next = { ...s };
      for (const k of TAB_KEYS) {
        const idx = next[k].rows.findIndex((b) => b.id === id);
        if (idx >= 0) {
          const rows = next[k].rows.slice();
          rows[idx] = patch(rows[idx]);
          next[k] = { ...next[k], rows };
        }
      }
      return next;
    });
  }, []);

  const removeRowEverywhere = useCallback((id: string) => {
    setPerTab((s) => {
      const next = { ...s };
      for (const k of TAB_KEYS) {
        if (next[k].rows.some((b) => b.id === id)) {
          next[k] = { ...next[k], rows: next[k].rows.filter((b) => b.id !== id) };
        }
      }
      return next;
    });
  }, []);

  useEffect(() => {
    if (!user) return;
    const ch = supabase.channel("battles-live")
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "battles" }, (payload: any) => {
        const row = payload.new as Battle;
        updateRowEverywhere(row.id, (b) => ({ ...b, ...row }));
        const prev = prevStatusRef.current[row.id];
        if (prev && prev.status !== "completed" && row.status === "completed" && row.winner_id) {
          setFreshWins((s) => { const n = new Set(s); n.add(row.id); return n; });
        }
        invalidateOfficialResult(row.id);
        prevStatusRef.current[row.id] = { status: row.status, winner: row.winner_id };
      })
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "battles" }, () => {
        // A brand-new battle was created. Refresh the current tab from cursor=null
        // so it can land at the top without breaking other tabs' cursors.
        void loadTab(tab, { reset: true });
      })
      .on("postgres_changes", { event: "DELETE", schema: "public", table: "battles" }, (payload: any) => {
        const id = (payload.old as { id?: string } | null)?.id;
        if (id) removeRowEverywhere(id);
      })
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "battle_votes" }, (payload: any) => {
        if (user && payload.new.user_id === user.id) return;
        updateRowEverywhere(payload.new.battle_id, (b) => {
          const isC = payload.new.voted_for_user_id === b.challenger_id;
          return {
            ...b,
            challenger_votes: b.challenger_votes + (isC ? 1 : 0),
            opponent_votes: b.opponent_votes + (isC ? 0 : 1),
          };
        });
      })
      .subscribe();
    return () => { supabase.removeChannel(ch); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id, tab]);

  const triggerBurst = (battleId: string, side: string) => {
    setBurstMap((m) => ({ ...m, [battleId]: side }));
    clearTimeout(burstTimers.current[battleId]);
    burstTimers.current[battleId] = setTimeout(() => {
      setBurstMap((m) => { const { [battleId]: _, ...rest } = m; return rest; });
    }, 800);
  };

  const vote = async (b: Battle, forUserId: string) => {
    if (!user) { toast.error("Sign in to vote"); return; }
    if (b.status !== "active") {
      void trackEvent("battle_vote_blocked_duplicate", { metadata: { battle_id: b.id, reason: "not_active" } });
      return;
    }
    if (myVotes[b.id]) {
      haptic("warning");
      void trackEvent("battle_vote_blocked_duplicate", { metadata: { battle_id: b.id, reason: "already_voted" } });
      toast.info("You already voted on this duel", {
        description: `You backed @${myVotes[b.id] === b.challenger_id ? b.challenger?.username : b.opponent?.username}`,
      });
      return;
    }
    if (b.challenger_id === user.id || b.opponent_id === user.id) {
      haptic("warning");
      toast.info("Can't vote in your own battle"); return;
    }

    if (inFlightVotes.current.has(b.id)) return;
    inFlightVotes.current.add(b.id);
    setSubmittingVotes((s) => { const n = new Set(s); n.add(b.id); return n; });
    void trackEvent("battle_vote_started", { metadata: { battle_id: b.id } });

    haptic("success");
    const isC = forUserId === b.challenger_id;
    setMyVotes((m) => ({ ...m, [b.id]: forUserId }));
    updateRowEverywhere(b.id, (x) => ({
      ...x,
      challenger_votes: x.challenger_votes + (isC ? 1 : 0),
      opponent_votes: x.opponent_votes + (isC ? 0 : 1),
    }));
    triggerBurst(b.id, isC ? "L" : "R");

    const { error } = await supabase
      .from("battle_votes")
      .upsert(
        { battle_id: b.id, user_id: user.id, voted_for_user_id: forUserId },
        { onConflict: "battle_id,user_id", ignoreDuplicates: true },
      );
    inFlightVotes.current.delete(b.id);
    setSubmittingVotes((s) => { const n = new Set(s); n.delete(b.id); return n; });

    if (error) {
      haptic("error");
      setMyVotes((m) => { const { [b.id]: _, ...rest } = m; return rest; });
      updateRowEverywhere(b.id, (x) => ({
        ...x,
        challenger_votes: x.challenger_votes - (isC ? 1 : 0),
        opponent_votes: x.opponent_votes - (isC ? 0 : 1),
      }));
      void trackEvent("battle_vote_failed", { metadata: { battle_id: b.id } });
      toast.error("Couldn't record your vote. Tap to retry.", {
        action: { label: "Retry", onClick: () => void vote(b, forUserId) },
      });
    } else {
      void trackEvent("battle_vote_success", { metadata: { battle_id: b.id, side: isC ? "challenger" : "opponent" } });
      toast.success("Vote cast 👑");
      (async () => {
        const { data: srv } = await supabase
          .from("battles")
          .select("challenger_votes, opponent_votes, status, winner_id, ends_at")
          .eq("id", b.id)
          .maybeSingle();
        if (srv) {
          updateRowEverywhere(b.id, (x) => ({ ...x, ...srv } as Battle));
          invalidateOfficialResult(b.id);
        }
      })();
    }
  };

  const replayReveal = (battleId: string) => {
    haptic("medium");
    setFreshWins((s) => { const next = new Set(s); next.delete(battleId); return next; });
    setTimeout(() => {
      setFreshWins((s) => { const next = new Set(s); next.add(battleId); return next; });
    }, 60);
  };

  // ---- Post-filter and sort the *current tab's* loaded rows ----
  const currentRows = perTab[tab].rows;
  const filteredCurrent = useMemo(() => {
    let arr = currentRows.slice();
    const q = query.trim().toLowerCase();
    if (q) {
      arr = arr.filter((b) => {
        const hay = [
          b.challenger?.username, b.opponent?.username,
          b.challenger_post?.city, b.challenger_post?.state, b.challenger_post?.country,
          b.challenger_post?.category && CATEGORY_LABEL[b.challenger_post.category],
        ].filter(Boolean).join(" ").toLowerCase();
        return hay.includes(q);
      });
    }
    if (category !== "all") arr = arr.filter((b) => b.challenger_post?.category === category);
    if (hub !== "all") arr = arr.filter((b) => b.challenger_post?.main_category_slug === hub);
    if (topic !== "all") arr = arr.filter((b) => b.challenger_post?.subcategory_slug === topic);
    if (region !== "all") {
      arr = arr.filter((b) => {
        const p = b.challenger_post;
        if (!p) return false;
        if (region === "global") return true;
        const f = (region === "city" ? p.city : region === "state" ? p.state : p.country);
        return !!f;
      });
    }
    if (sort === "competitive") {
      arr.sort((a, b) => {
        const ta = a.challenger_votes + a.opponent_votes;
        const tb = b.challenger_votes + b.opponent_votes;
        const ma = Math.abs(a.challenger_votes - a.opponent_votes) / Math.max(ta, 1);
        const mb = Math.abs(b.challenger_votes - b.opponent_votes) / Math.max(tb, 1);
        return ma - mb || tb - ta;
      });
    } else if (sort === "hot" || sort === "votes") {
      arr.sort((a, b) => (b.challenger_votes + b.opponent_votes) - (a.challenger_votes + a.opponent_votes));
    } else if (sort === "newest") {
      arr.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
    } else if (sort === "ending") {
      arr.sort((a, b) => (new Date(a.ends_at || 0).getTime() || Infinity) - (new Date(b.ends_at || 0).getTime() || Infinity));
    }
    return arr;
  }, [currentRows, query, category, region, sort, hub, topic]);

  const now = Date.now();
  const isEnded = (b: Battle) =>
    b.status === "completed" || b.status === "declined" || b.status === "cancelled" ||
    (!!b.ends_at && new Date(b.ends_at).getTime() <= now);

  const activeRows = tab === "active" ? filteredCurrent : [];
  const featured = activeRows[0];

  // Deep link ?b=xxx → scroll/highlight
  useEffect(() => {
    const id = params.get("b");
    if (id && currentRows.some((b) => b.id === id)) {
      setTimeout(() => {
        document.getElementById(`battle-${id}`)?.scrollIntoView({ behavior: "smooth", block: "center" });
      }, 200);
    }
  }, [params, currentRows]);

  const Card = ({ b, live, featured: feat = false }: { b: Battle; live: boolean; featured?: boolean }) => {
    const total = b.challenger_votes + b.opponent_votes || 1;
    const cPct = (b.challenger_votes / total) * 100;
    const oPct = 100 - cPct;
    const myVote = myVotes[b.id];
    const isParticipant = user && (user.id === b.challenger_id || user.id === b.opponent_id);
    const isPending = b.status === "pending";
    const isWinnerC = b.winner_id === b.challenger_id;
    const isWinnerO = b.winner_id === b.opponent_id;
    const margin = Math.abs(cPct - oPct).toFixed(0);
    const burstSide = burstMap[b.id];
    const cat = b.challenger_post?.category;
    const fresh = freshWins.has(b.id);
    const votedSideName = myVote
      ? (myVote === b.challenger_id ? b.challenger?.username : b.opponent?.username)
      : null;
    const submitting = submittingVotes.has(b.id);
    const isLocked = !!myVote || submitting || (!!isParticipant && live) || !live;

    const Side = ({
      side, profile, post, votes, userId, pct, won,
    }: { side: "L" | "R"; profile: any; post: any; votes: number; userId: string; pct: number; won: boolean }) => {
      const iVoted = myVote === userId;
      const btn = (
        <button
          disabled={isLocked}
          aria-busy={submitting}
          onClick={() => vote(b, userId)}
          aria-label={iVoted ? `You voted for @${profile?.username}` : `Vote for @${profile?.username}`}
          className={`relative aspect-square group disabled:cursor-not-allowed overflow-hidden w-full ${
            myVote && !iVoted ? "opacity-60 grayscale-[0.4]" : ""
          }`}
        >
          {post?.image_url
            ? <img
                loading="lazy"
                src={post.image_url}
                alt=""
                className="w-full h-full object-cover transition-transform group-hover:scale-105"
                style={{ filter: cssFor(isValidFilter(post?.filter ?? null) ? (post.filter as FilterId) : null) }}
              />
            : <div className="w-full h-full bg-muted flex items-center justify-center text-[10px] text-muted-foreground">Awaiting post</div>}

          {won && <WinnerReveal margin={parseFloat(margin)} side={side} fresh={fresh} />}

          {iVoted && (
            <div className="absolute top-2 left-2 bg-primary text-primary-foreground text-[9px] font-bold px-1.5 py-0.5 rounded-full uppercase shadow-lg flex items-center gap-0.5 animate-fade-in">
              <Check size={9} /> Your vote
            </div>
          )}

          {submitting && !iVoted && (
            <div className="absolute inset-0 bg-background/40 backdrop-blur-[1px] flex items-center justify-center">
              <Loader2 size={20} className="text-primary animate-spin" />
            </div>
          )}

          {myVote && !iVoted && live && (
            <div className="absolute top-2 right-2 bg-background/80 backdrop-blur text-muted-foreground text-[9px] font-bold px-1.5 py-0.5 rounded-full uppercase flex items-center gap-0.5">
              <Lock size={9} /> Locked
            </div>
          )}

          {burstSide === side && (
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
              <div className="animate-scale-in"><Crown size={48} className="text-primary drop-shadow-lg" fill="currentColor" /></div>
            </div>
          )}

          <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/85 via-black/40 to-transparent p-2">
            <div className="flex items-center gap-1.5 mb-0.5">
              <div className="w-5 h-5 rounded-full overflow-hidden bg-muted/40 border border-white/20 shrink-0">
                {profile?.profile_photo_url && <img loading="lazy" src={profile.profile_photo_url} alt="" className="w-full h-full object-cover" />}
              </div>
              <p className="text-[11px] font-bold text-white truncate">@{profile?.username || "—"}</p>
            </div>
            <div className="flex items-center justify-between text-[10px] text-white/90">
              <span className="font-bold">{votes}</span>
              <span>{Math.round(pct)}%</span>
            </div>
          </div>
        </button>
      );

      if (myVote) {
        return (
          <Tooltip>
            <TooltipTrigger asChild><span className="block">{btn}</span></TooltipTrigger>
            <TooltipContent side="top" className="text-[11px]">
              {iVoted ? `You voted for @${profile?.username}` : `Voted locked — you backed @${votedSideName}`}
            </TooltipContent>
          </Tooltip>
        );
      }
      return btn;
    };

    return (
      <div id={`battle-${b.id}`} className={`royal-card overflow-hidden animate-fade-in ${feat ? "border-primary/40 gold-shadow" : ""}`}>
        <div className="flex items-center justify-between px-3 py-2 border-b border-border/40 text-[10px]">
          <div className="flex items-center gap-2 min-w-0">
            {cat && (
              <span className="bg-secondary/40 text-secondary-foreground px-1.5 py-0.5 rounded-full font-semibold uppercase tracking-wider truncate max-w-[120px]">
                {CATEGORY_LABEL[cat]}
              </span>
            )}
            {b.challenger_post && (
              <span className="text-muted-foreground inline-flex items-center gap-0.5 truncate">
                <MapPin size={9} /> {locationLabel(b.challenger_post)}
              </span>
            )}
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {isPending && <span className="text-[10px] uppercase font-bold text-accent">Pending</span>}
            {b.status === "active" && b.ends_at && <CountdownPill endsAt={b.ends_at} />}
            <OfficialResultBadge
              battleId={b.id}
              enabled={!live}
              resolveUsername={(uid) =>
                uid === b.challenger_id ? b.challenger?.username : uid === b.opponent_id ? b.opponent?.username : null
              }
            />
          </div>
        </div>

        <div className="grid grid-cols-2 relative">
          <Side side="L" profile={b.challenger} post={b.challenger_post} votes={b.challenger_votes} userId={b.challenger_id} pct={cPct} won={isWinnerC} />
          <Side side="R" profile={b.opponent} post={b.opponent_post} votes={b.opponent_votes} userId={b.opponent_id} pct={oPct} won={isWinnerO} />
          <div className="absolute inset-y-0 left-1/2 -translate-x-1/2 flex items-center pointer-events-none">
            <div className="bg-gradient-gold text-primary-foreground font-display font-black text-sm w-9 h-9 rounded-full flex items-center justify-center gold-shadow border-2 border-background">
              VS
            </div>
          </div>

          {(() => {
            if (!isEnded(b)) return null;
            const isParticipantUser = !!user && (user.id === b.challenger_id || user.id === b.opponent_id);
            let label: "WON" | "LOST" | "DRAW";
            let toneClass: string;
            if (!b.winner_id) {
              label = "DRAW";
              toneClass = "bg-muted text-foreground border-border";
            } else if (isParticipantUser) {
              const won = b.winner_id === user?.id;
              label = won ? "WON" : "LOST";
              toneClass = won
                ? "bg-gradient-gold text-primary-foreground border-primary/60 gold-shadow"
                : "bg-destructive/90 text-destructive-foreground border-destructive";
            } else {
              label = "WON";
              toneClass = "bg-gradient-gold text-primary-foreground border-primary/60 gold-shadow";
            }
            return (
              <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-20">
                <div
                  className={`px-5 py-1.5 rounded-md font-display font-black text-base tracking-[0.35em] uppercase border-2 rotate-[-6deg] animate-scale-in ${toneClass}`}
                  aria-label={`Battle ${label.toLowerCase()}`}
                >
                  {label}
                </div>
              </div>
            );
          })()}
        </div>

        <div className="h-1.5 bg-muted/40 flex">
          <div className="bg-gradient-gold transition-all duration-500" style={{ width: `${cPct}%` }} />
          <div className="bg-accent/70 transition-all duration-500" style={{ width: `${oPct}%` }} />
        </div>

        <div className="p-2 flex items-center justify-between gap-2">
          <span className="text-[10px] text-muted-foreground inline-flex items-center gap-1">
            <Flame size={10} /> {b.challenger_votes + b.opponent_votes} votes
          </span>
          <div className="flex items-center gap-1">
            {isPending && b.opponent_id === user?.id && (
              <Button size="sm" variant="default" className="h-7 px-2 text-[11px] bg-gradient-gold text-primary-foreground"
                onClick={() => setAcceptBattle(b)}>
                <Check size={12} /> Respond
              </Button>
            )}
            {b.status === "completed" && b.winner_id && (
              <Button
                size="sm"
                variant="ghost"
                className="h-7 px-2 text-[11px] text-primary hover:text-primary"
                onClick={() => replayReveal(b.id)}
                title="Replay winner reveal"
              >
                <Play size={12} /> Replay
              </Button>
            )}
            <Button size="sm" variant="ghost" className="h-7 px-2" onClick={() => setShareBattle(b)} title="Share duel">
              <Share2 size={12} />
            </Button>
          </div>
        </div>
      </div>
    );
  };

  const EmptyState = ({ title, body, cta }: { title: string; body: string; cta?: React.ReactNode }) => (
    <div className="royal-card p-6 lg:p-10 text-center my-4 animate-fade-in">
      <div className="mx-auto w-12 h-12 rounded-full bg-gradient-gold flex items-center justify-center mb-3 gold-shadow">
        <Swords className="text-primary-foreground" size={20} />
      </div>
      <h3 className="font-display text-lg text-gold mb-1">{title}</h3>
      <p className="text-xs text-muted-foreground mb-4 max-w-sm mx-auto">{body}</p>
      {cta}
    </div>
  );

  /**
   * Bottom-of-list pagination controls: loading spinner, retry on failure,
   * or "No more battles". Layout reserves a fixed minimum height so the
   * page doesn't jump while loading more.
   */
  const PaginationFooter = ({ forTab }: { forTab: TabKey }) => {
    const t = perTab[forTab];
    const loading = tabLoading[forTab];
    const error = tabError[forTab];
    if (t.rows.length === 0) return null;
    return (
      <div className="min-h-[56px] flex items-center justify-center mt-4">
        {loading && (
          <div className="inline-flex items-center gap-2 text-xs text-muted-foreground">
            <Loader2 size={14} className="animate-spin" /> Loading more battles…
          </div>
        )}
        {!loading && error && (
          <Button
            size="sm"
            variant="outline"
            onClick={() => void loadTab(forTab)}
            className="text-xs"
            aria-label="Retry loading more battles"
          >
            <RotateCw size={12} /> Couldn't load — Retry
          </Button>
        )}
        {!loading && !error && t.exhausted && (
          <span className="text-[11px] text-muted-foreground uppercase tracking-wider">No more battles</span>
        )}
        {!loading && !error && !t.exhausted && (
          <Button
            size="sm"
            variant="outline"
            onClick={() => void loadTab(forTab)}
            className="text-xs"
          >
            Load more
          </Button>
        )}
      </div>
    );
  };

  const TabBody = ({ forTab, rows, live }: { forTab: TabKey; rows: Battle[]; live: boolean | ((b: Battle) => boolean) }) => {
    const t = perTab[forTab];
    const loading = tabLoading[forTab];
    const error = tabError[forTab];
    const firstLoad = loading && t.rows.length === 0;
    const liveFor = (b: Battle) => (typeof live === "function" ? (live as any)(b) : live);
    return (
      <>
        <div className="space-y-3 lg:space-y-0 lg:grid lg:grid-cols-2 lg:gap-4">
          {firstLoad
            ? Array.from({ length: 4 }).map((_, i) => <SkeletonCard key={i} />)
            : rows.map((b) => <Card key={b.id} b={b} live={liveFor(b)} />)}
        </div>
        {!loading && error && t.rows.length === 0 && (
          <div className="royal-card p-6 text-center my-4">
            <p className="text-sm text-muted-foreground mb-3">Couldn't load battles.</p>
            <Button size="sm" variant="outline" onClick={() => void loadTab(forTab, { reset: true })}>
              <RotateCw size={12} /> Retry
            </Button>
          </div>
        )}
        <PaginationFooter forTab={forTab} />
      </>
    );
  };

  return (
    <TooltipProvider delayDuration={150}>
    <AppShell title="BATTLES">
      <div className="px-4 lg:px-0 py-4 lg:grid lg:grid-cols-[1fr_280px] lg:gap-6">
        <div className="min-w-0">
          <div className="flex items-center justify-between mb-4 gap-2">
            <div className="min-w-0">
              <h1 className="font-display text-2xl text-gold flex items-center gap-2"><Swords size={22} /> Crown Battles</h1>
              <p className="hidden lg:block text-sm text-muted-foreground">Two royals enter. One walks away crowned.</p>
            </div>
            <Button size="sm" className="bg-gradient-gold text-primary-foreground font-bold gold-shadow shrink-0"
              onClick={() => setChallengeOpen(true)}>
              <Swords size={14} /> Challenge
            </Button>
          </div>

          <div className="space-y-2 mb-4">
            <div className="relative">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search by username, region, category…" className="pl-9 h-9" />
            </div>
            <div className="grid grid-cols-3 gap-2">
              <Select value={region} onValueChange={setRegion}>
                <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All regions</SelectItem>
                  <SelectItem value="city">City</SelectItem>
                  <SelectItem value="state">State</SelectItem>
                  <SelectItem value="country">Country</SelectItem>
                  <SelectItem value="global">Global</SelectItem>
                </SelectContent>
              </Select>
              <Select value={category} onValueChange={setCategory}>
                <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                <SelectContent className="max-h-60">
                  <SelectItem value="all">All categories</SelectItem>
                  {Object.entries(CATEGORY_LABEL).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}
                </SelectContent>
              </Select>
              <Select value={sort} onValueChange={setSort}>
                <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="hot">🔥 Trending</SelectItem>
                  <SelectItem value="newest">Newest</SelectItem>
                  <SelectItem value="ending">Ending soon</SelectItem>
                  <SelectItem value="votes">Most votes</SelectItem>
                  <SelectItem value="competitive">Most competitive</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="flex gap-2 overflow-x-auto pb-1 no-scrollbar">
              <button
                onClick={() => { setHub("all"); setTopic("all"); }}
                className={`px-3 py-1 rounded-full text-[11px] font-semibold whitespace-nowrap ${
                  hub === "all" ? "bg-foreground text-background" : "bg-muted text-foreground"
                }`}
              >All hubs</button>
              {mains.map((m) => {
                const IconCmp = m.icon ? (LucideIcons as any)[m.icon] : null;
                return (
                  <button
                    key={m.id}
                    onClick={() => { setHub(m.slug); setTopic("all"); }}
                    className={`px-3 py-1 rounded-full text-[11px] font-semibold whitespace-nowrap inline-flex items-center gap-1.5 ${
                      hub === m.slug ? "bg-foreground text-background" : "bg-muted text-foreground"
                    }`}
                  >
                    {IconCmp ? <IconCmp size={12} /> : <span aria-hidden>🏷️</span>}
                    <span>{m.label}</span>
                  </button>
                );
              })}
            </div>
            {hub !== "all" && (
              <div className="flex gap-2 overflow-x-auto pb-1 no-scrollbar">
                <button
                  onClick={() => setTopic("all")}
                  className={`px-2.5 py-1 rounded-full text-[10px] font-semibold whitespace-nowrap ${
                    topic === "all" ? "bg-primary text-primary-foreground" : "bg-muted/60 text-muted-foreground"
                  }`}
                >All topics</button>
                {subs.filter((s) => s.main_category_id === mains.find((m) => m.slug === hub)?.id).map((s) => (
                  <button
                    key={s.id}
                    onClick={() => setTopic(s.slug)}
                    className={`px-2.5 py-1 rounded-full text-[10px] font-semibold whitespace-nowrap ${
                      topic === s.slug ? "bg-primary text-primary-foreground" : "bg-muted/60 text-muted-foreground"
                    }`}
                  >{s.label}</button>
                ))}
              </div>
            )}
          </div>

          {/* Featured (Active tab only, no search) */}
          {featured && tab === "active" && !query && (
            <div className="mb-5">
              <div className="flex items-center gap-2 mb-2">
                <Sparkles size={12} className="text-primary" />
                <h2 className="font-display text-[10px] uppercase tracking-[0.3em] text-muted-foreground">Featured Duel</h2>
              </div>
              <Card b={featured} live featured />
            </div>
          )}

          <Tabs value={tab} onValueChange={(v) => setTab(v as TabKey)}>
            <TabsList className="w-full grid grid-cols-5 h-9">
              <TabsTrigger value="active" className="text-xs">Active</TabsTrigger>
              <TabsTrigger value="pending" className="text-xs relative">
                Pending
                {perTab.pending.rows.length > 0 && (
                  <span className="ml-1 inline-flex items-center justify-center min-w-[16px] h-4 px-1 rounded-full bg-destructive text-destructive-foreground text-[9px] font-bold">
                    {perTab.pending.rows.length}
                  </span>
                )}
              </TabsTrigger>
              <TabsTrigger value="mine" className="text-xs">Mine</TabsTrigger>
              <TabsTrigger value="done" className="text-xs">Past</TabsTrigger>
              <TabsTrigger value="declined" className="text-xs">Declined</TabsTrigger>
            </TabsList>

            <TabsContent value="active" className="mt-3">
              <TabBody forTab="active" rows={featured && !query ? activeRows.slice(1) : activeRows} live />
              {!tabLoading.active && !tabError.active && activeRows.length === 0 && (
                <EmptyState title="No active battles" body="You do not have any active battles right now."
                  cta={<Button onClick={() => setChallengeOpen(true)} className="bg-gradient-gold text-primary-foreground gold-shadow"><Swords size={14} /> Start a battle</Button>} />
              )}
            </TabsContent>

            <TabsContent value="pending" className="mt-3">
              <TabBody forTab="pending" rows={tab === "pending" ? filteredCurrent : []} live={false} />
              {!tabLoading.pending && !tabError.pending && perTab.pending.rows.length === 0 && (
                <EmptyState title="No pending battles" body="You do not have any pending battles." />
              )}
            </TabsContent>

            <TabsContent value="mine" className="mt-3">
              <TabBody
                forTab="mine"
                rows={tab === "mine" ? filteredCurrent.slice().sort((a, b) => {
                  const ta = a.ends_at ? new Date(a.ends_at).getTime() : new Date(a.created_at).getTime();
                  const tb = b.ends_at ? new Date(b.ends_at).getTime() : new Date(b.created_at).getTime();
                  return tb - ta;
                }) : []}
                live={(b) => b.status === "active" && !isEnded(b)}
              />
              {!tabLoading.mine && !tabError.mine && perTab.mine.rows.length === 0 && (
                <EmptyState title="Nothing in the last 30 days" body="You have not joined or created any battles in the last 30 days."
                  cta={<Button onClick={() => setChallengeOpen(true)} className="bg-gradient-gold text-primary-foreground gold-shadow"><Swords size={14} /> Challenge a royal</Button>} />
              )}
            </TabsContent>

            <TabsContent value="done" className="mt-3">
              <TabBody
                forTab="done"
                rows={tab === "done" ? filteredCurrent.slice().sort((a, b) => {
                  const ta = a.ends_at ? new Date(a.ends_at).getTime() : new Date(a.created_at).getTime();
                  const tb = b.ends_at ? new Date(b.ends_at).getTime() : new Date(b.created_at).getTime();
                  return tb - ta;
                }) : []}
                live={false}
              />
              {!tabLoading.done && !tabError.done && perTab.done.rows.length === 0 && (
                <EmptyState title="No past battles yet" body="Battles older than 30 days will appear here once you have some." />
              )}
            </TabsContent>
          </Tabs>
        </div>

        <aside className="hidden lg:block space-y-4">
          <TopBattlersWidget />
          <div className="royal-card p-4">
            <h3 className="font-display text-xs uppercase tracking-[0.2em] text-gold mb-2">How duels work</h3>
            <ul className="text-[11px] text-muted-foreground space-y-1.5 list-disc list-inside">
              <li>Pick an opponent + a post</li>
              <li>Set duration (30 min – 48h)</li>
              <li>Community votes for the winner</li>
              <li>Winner gets +5 crown score & a battle win</li>
            </ul>
          </div>
        </aside>
      </div>

      <ChallengeDialog open={challengeOpen} onOpenChange={setChallengeOpen} onCreated={() => void loadTab(tab, { reset: true })} />
      <AcceptBattleDialog
        open={!!acceptBattle}
        onOpenChange={(o) => !o && setAcceptBattle(null)}
        battle={acceptBattle ? {
          id: acceptBattle.id,
          challenger_post: acceptBattle.challenger_post as any,
          challenger: acceptBattle.challenger,
        } : null}
        onResolved={() => void loadTab(tab, { reset: true })}
      />
      {shareBattle && (
        <ShareBattleDialog
          open={!!shareBattle}
          onOpenChange={(o) => !o && setShareBattle(null)}
          battleId={shareBattle.id}
          challenger={shareBattle.challenger?.username || ""}
          opponent={shareBattle.opponent?.username || ""}
          challengerImage={shareBattle.challenger_post?.image_url ?? null}
          opponentImage={shareBattle.opponent_post?.image_url ?? null}
          challengerVotes={shareBattle.challenger_votes}
          opponentVotes={shareBattle.opponent_votes}
          filters={params}
        />
      )}
    </AppShell>
    </TooltipProvider>
  );
}
