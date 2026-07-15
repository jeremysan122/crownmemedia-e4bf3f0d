// Discover — premium category-driven discovery surface.
//
// Sections:
//   1. Search bar
//   2. Trending Hubs (with time filter)
//   3. Featured Topics
//   4. Trending Posts (top crown_score in window)
//   5. Live & Upcoming Battles
//   6. Suggested Creators to Follow (with inline follow/unfollow)
//   7. People Near You (CrownMap geo)
//   8. Top Gifters (this week)
//   9. Recently Crowned + Rising Stars
//  10. Royal Pass spotlight (non-members)
//  11. All Royal Hubs
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import PostPreviewTile from "@/components/PostPreviewTile";
import DiscoverSearchResults from "@/components/discover/DiscoverSearchResults";
import {
  TrendingUp, Crown, Flame, Sparkles, ArrowRight, Star, Zap, Trophy,
  Search, Swords, UserPlus, UserCheck, Gift, ShieldCheck, MapPin, RefreshCw, Loader2,
  LocateFixed,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useCategoryTree } from "@/lib/categories";
import TrendingHashtags from "@/components/TrendingHashtags";
import { useSeoMeta } from "@/hooks/useSeoMeta";
import { useAuth } from "@/context/AuthContext";
import { useIsRoyalPassUser } from "@/hooks/useIsRoyalPassUser";
import AppShell from "@/components/AppShell";
import { trackEvent } from "@/lib/analytics";
import { toast } from "@/hooks/use-toast";
import {
  type RadiusMiles, loadSavedRadius, saveRadius,
  withinRadius,
} from "@/lib/discoverGeo";
import { lookupGeo } from "@/lib/geoCoords";
import RadiusSelector from "@/components/discover/RadiusSelector";
import {
  makeKey as makeCacheKey, getCached, setCached, wireRealtimeInvalidation,
} from "@/lib/discoverCache";
import { useFeedFilters, isFilteredOut } from "@/hooks/useFeedFilters";


interface HubStat {
  slug: string;
  post_count: number;
  champion_username: string | null;
  champion_avatar: string | null;
  active_competitors: number;
}

interface RecentCrown {
  id: string;
  category: string;
  started_at: string;
  user: { username: string; profile_photo_url: string | null } | null;
}

interface RisingStar {
  user_id: string;
  username: string;
  profile_photo_url: string | null;
  gained: number;
}

interface TrendingPost {
  id: string;
  user_id?: string;
  image_url: string | null;
  image_urls: string[] | null;
  video_poster_url: string | null;
  media_type: string | null;
  content_type: string | null;
  aspect_ratio: string | null;
  filter: string | null;
  crown_score: number;
  caption: string | null;
  is_sensitive?: boolean | null;
  hashtags?: string[] | null;
  main_category_slug: string | null;
  subcategory_slug: string | null;
  profile: { username: string; profile_photo_url: string | null } | null;
}

interface LiveBattle {
  id: string;
  ends_at: string;
  challenger_votes: number;
  opponent_votes: number;
  challenger: { username: string; profile_photo_url: string | null } | null;
  opponent: { username: string; profile_photo_url: string | null } | null;
}

interface SuggestedUser {
  id: string;
  username: string;
  profile_photo_url: string | null;
  bio: string | null;
  crown_score: number;
}

interface NearbyUser {
  id: string;
  username: string;
  profile_photo_url: string | null;
  city: string | null;
  country: string | null;
  crown_score: number;
}

interface TopGifter {
  user_id: string;
  username: string;
  profile_photo_url: string | null;
  total: number;
}

type Window = "24h" | "7d" | "30d";
const WINDOW_HOURS: Record<Window, number> = { "24h": 24, "7d": 24 * 7, "30d": 24 * 30 };

function Skeleton({ className = "" }: { className?: string }) {
  return <div className={`animate-pulse bg-secondary/40 rounded-lg ${className}`} />;
}

export default function Discover() {
  useSeoMeta({
    title: "Discover — Trending hubs, creators & battles",
    description:
      "Explore CrownMe's trending royal hubs, rising creators, live battles, top gifters and featured topics.",
  });

  const { user } = useAuth();
  const isRoyal = useIsRoyalPassUser(user?.id);
  const nav = useNavigate();
  const { mains, subs, loading } = useCategoryTree();
  const feedFilters = useFeedFilters();

  const [windowSel, setWindowSel] = useState<Window>("7d");
  const [stats, setStats] = useState<Record<string, HubStat>>({});
  const [recent, setRecent] = useState<RecentCrown[]>([]);
  const [rising, setRising] = useState<RisingStar[]>([]);
  const [trendingPosts, setTrendingPosts] = useState<TrendingPost[]>([]);
  const [postsLoading, setPostsLoading] = useState(true);
  const [postsHasMore, setPostsHasMore] = useState(true);
  const [postsLoadingMore, setPostsLoadingMore] = useState(false);
  const [postsError, setPostsError] = useState(false);
  const [battles, setBattles] = useState<LiveBattle[]>([]);
  const [battlesLoading, setBattlesLoading] = useState(true);
  const [battlesHasMore, setBattlesHasMore] = useState(true);
  const [battlesLoadingMore, setBattlesLoadingMore] = useState(false);
  const [battlesError, setBattlesError] = useState(false);
  const [suggested, setSuggested] = useState<SuggestedUser[]>([]);
  const [following, setFollowing] = useState<Set<string>>(new Set());
  const [pendingFollow, setPendingFollow] = useState<Set<string>>(new Set());
  const [blockedIds, setBlockedIds] = useState<Set<string>>(new Set());
  const [nearby, setNearby] = useState<(NearbyUser & { _coord?: [number, number] | null })[]>([]);
  const [nearbyLoading, setNearbyLoading] = useState(false);
  const [radius, setRadius] = useState<RadiusMiles>(() => loadSavedRadius());
  const [originCoord, setOriginCoord] = useState<[number, number] | null>(null);
  const [geoSource, setGeoSource] = useState<"gps" | "city" | "state" | "country" | "none">("none");
  const [geoRequesting, setGeoRequesting] = useState(false);
  const [gifters, setGifters] = useState<TopGifter[]>([]);
  const [search, setSearch] = useState("");
  const [showSearch, setShowSearch] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
  const [isRefreshing, setIsRefreshing] = useState(false);

  // URL-driven hub/topic filter — /discover?hub=fashion-beauty&topic=makeup
  const [urlParams, setUrlParams] = useSearchParams();
  const hubFilter = urlParams.get("hub");
  const topicFilter = urlParams.get("topic");
  const hasFilter = !!(hubFilter || topicFilter);
  const clearFilter = () => {
    const next = new URLSearchParams(urlParams);
    next.delete("hub"); next.delete("topic");
    setUrlParams(next, { replace: true });
  };

  const POSTS_PAGE = 9;
  const BATTLES_PAGE = 4;

  // Cursor types for stable pagination — last item determines next page bounds.
  type PostsCursor = { score: number; id: string } | null;
  type BattlesCursor = { endsAt: string; id: string } | null;
  const [postsCursor, setPostsCursor] = useState<PostsCursor>(null);
  const [battlesCursor, setBattlesCursor] = useState<BattlesCursor>(null);

  // In-flight guards prevent duplicate fetches if the sentinel + button race.
  const postsFetchingRef = useRef(false);
  const battlesFetchingRef = useRef(false);

  // Fire once when Discover opens; wire realtime cache invalidation.
  useEffect(() => {
    void trackEvent("discover_opened");
    const unwire = wireRealtimeInvalidation();
    return () => { unwire(); };
  }, []);


  // Load + cache blocked-user ids so they never appear in suggestions / nearby
  useEffect(() => {
    if (!user) { setBlockedIds(new Set()); return; }
    (async () => {
      const { data } = await supabase.from("blocks").select("blocked_id").eq("blocker_id", user.id);
      setBlockedIds(new Set(((data as any[]) || []).map((r) => r.blocked_id).filter(Boolean)));
    })();
  }, [user?.id]);

  const featuredTopics = useMemo(
    () => subs.filter((s) => s.is_featured).slice(0, 8),
    [subs]
  );

  // Hub stats (varies with time window & refreshKey)
  useEffect(() => {
    if (mains.length === 0) return;
    let cancelled = false;
    (async () => {
      const since = new Date(Date.now() - WINDOW_HOURS[windowSel] * 60 * 60 * 1000).toISOString();
      const { data: rows } = await supabase
        .from("posts")
        .select("main_category_slug, user_id")
        .gte("created_at", since)
        .eq("is_removed", false)
        .not("main_category_slug", "is", null)
        .limit(5000);

      const counts = new Map<string, number>();
      const competitors = new Map<string, Set<string>>();
      ((rows as any[]) || []).forEach((r) => {
        counts.set(r.main_category_slug, (counts.get(r.main_category_slug) ?? 0) + 1);
        if (!competitors.has(r.main_category_slug)) competitors.set(r.main_category_slug, new Set());
        competitors.get(r.main_category_slug)!.add(r.user_id);
      });

      const champs = await Promise.all(
        mains.map(async (m) => {
          const { data } = await supabase
            .from("posts")
            .select("profile:profiles!posts_user_id_fkey(username, profile_photo_url)")
            .eq("main_category_slug", m.slug)
            .eq("is_removed", false)
            .order("crown_score", { ascending: false })
            .limit(1);
          const c = (data as any[])?.[0]?.profile;
          return [m.slug, c?.username ?? null, c?.profile_photo_url ?? null] as const;
        })
      );

      if (cancelled) return;
      const next: Record<string, HubStat> = {};
      mains.forEach((m, i) => {
        next[m.slug] = {
          slug: m.slug,
          post_count: counts.get(m.slug) ?? 0,
          champion_username: champs[i][1],
          champion_avatar: champs[i][2],
          active_competitors: competitors.get(m.slug)?.size ?? 0,
        };
      });
      setStats(next);
    })();
    return () => { cancelled = true; };
  }, [mains, windowSel, refreshKey]);

  // Recently crowned
  useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from("crowns")
        .select("id, category, started_at, user:profiles!crowns_user_id_fkey(username, profile_photo_url)")
        .eq("active", true)
        .order("started_at", { ascending: false })
        .limit(8);
      setRecent((data as any) || []);
    })();
  }, [refreshKey]);

  // Rising stars
  useEffect(() => {
    (async () => {
      const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
      const { data } = await supabase
        .from("posts")
        .select("user_id, crown_score, profile:profiles!posts_user_id_fkey(username, profile_photo_url)")
        .gte("created_at", since)
        .eq("is_removed", false)
        .order("crown_score", { ascending: false })
        .limit(200);
      const map = new Map<string, RisingStar>();
      ((data as any[]) || []).forEach((p) => {
        const cur = map.get(p.user_id);
        if (cur) cur.gained += Number(p.crown_score) || 0;
        else if (p.profile)
          map.set(p.user_id, {
            user_id: p.user_id,
            username: p.profile.username,
            profile_photo_url: p.profile.profile_photo_url,
            gained: Number(p.crown_score) || 0,
          });
      });
      setRising([...map.values()].sort((a, b) => b.gained - a.gained).slice(0, 6));
    })();
  }, [refreshKey]);

  // ---------- Trending posts (cursor pagination + short-lived cache) ----------
  const fetchTrendingPage = useCallback(
    async (cursor: PostsCursor): Promise<{ rows: TrendingPost[]; hasMore: boolean; nextCursor: PostsCursor }> => {
      const since = new Date(Date.now() - WINDOW_HOURS[windowSel] * 60 * 60 * 1000).toISOString();
      let q = supabase
        .from("posts")
        .select(
          "id, image_url, image_urls, video_poster_url, media_type, content_type, aspect_ratio, filter, crown_score, caption, hashtags, is_sensitive, user_id, main_category_slug, subcategory_slug, profile:profiles!posts_user_id_fkey(username, profile_photo_url)",
        )
        .gte("created_at", since)
        .eq("is_removed", false)
        .eq("is_archived", false)
        .order("crown_score", { ascending: false })
        .order("id", { ascending: true })
        .limit(POSTS_PAGE);
      // Apply hub/topic filter server-side so pagination cursors stay coherent
      // with what the user sees. Topic is more specific than hub.
      if (topicFilter) q = q.eq("subcategory_slug", topicFilter);
      else if (hubFilter) q = q.eq("main_category_slug", hubFilter);
      // Stable keyset cursor: rows AFTER (score, id) tuple.
      if (cursor) {
        q = q.or(`crown_score.lt.${cursor.score},and(crown_score.eq.${cursor.score},id.gt.${cursor.id})`);
      }
      const { data, error } = await q;
      if (error) throw error;
      const all = ((data as any[]) || []);
      const rows = all.filter((r) => !blockedIds.has(r.user_id)) as TrendingPost[];
      const last = all[all.length - 1];
      const nextCursor = last ? { score: Number(last.crown_score) || 0, id: String(last.id) } : null;
      return { rows, hasMore: all.length === POSTS_PAGE, nextCursor };
    },
    [windowSel, blockedIds, hubFilter, topicFilter],
  );

  useEffect(() => {
    let cancelled = false;
    setPostsLoading(true);
    setPostsError(false);
    setPostsHasMore(true);
    setPostsCursor(null);
    (async () => {
      try {
        const cacheKey = makeCacheKey("trending", { user: user?.id ?? "anon", window: windowSel, cursor: "0" });
        const cached = getCached<{ rows: TrendingPost[]; hasMore: boolean; nextCursor: PostsCursor }>(cacheKey);
        if (cached) {
          void trackEvent("discover_cache_hit", { metadata: { section: "trending" } });
          if (!cancelled) {
            setTrendingPosts(cached.rows);
            setPostsHasMore(cached.hasMore);
            setPostsCursor(cached.nextCursor);
            setPostsLoading(false);
            return;
          }
        }
        void trackEvent("discover_cache_miss", { metadata: { section: "trending" } });
        const r = await fetchTrendingPage(null);
        if (cancelled) return;
        setTrendingPosts(r.rows);
        setPostsHasMore(r.hasMore);
        setPostsCursor(r.nextCursor);
        setCached(cacheKey, "trending", r);
      } catch {
        if (!cancelled) setPostsError(true);
      } finally {
        if (!cancelled) setPostsLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [fetchTrendingPage, refreshKey, user?.id, windowSel]);

  const loadMorePosts = useCallback(async () => {
    if (postsFetchingRef.current || !postsHasMore || postsLoading) return;
    postsFetchingRef.current = true;
    setPostsLoadingMore(true);
    setPostsError(false);
    try {
      const r = await fetchTrendingPage(postsCursor);
      setTrendingPosts((prev) => {
        const seen = new Set(prev.map((p) => p.id));
        const fresh = r.rows.filter((x) => !seen.has(x.id));
        if (fresh.length !== r.rows.length) {
          void trackEvent("discover_duplicate_prevented", { metadata: { section: "trending", dropped: r.rows.length - fresh.length } });
        }
        return [...prev, ...fresh];
      });
      setPostsHasMore(r.hasMore);
      setPostsCursor(r.nextCursor);
      void trackEvent("discover_trending_pagination_loaded", { metadata: { count: r.rows.length } });
    } catch {
      setPostsError(true);
      void trackEvent("discover_pagination_failed", { metadata: { section: "trending" } });
    } finally {
      postsFetchingRef.current = false;
      setPostsLoadingMore(false);
    }
  }, [fetchTrendingPage, postsHasMore, postsLoading, postsCursor]);


  // Fire one impression event per trending-post id we render (deduped via ref)
  const impressed = useRef<Set<string>>(new Set());
  useEffect(() => {
    trendingPosts.forEach((p) => {
      if (impressed.current.has(p.id)) return;
      impressed.current.add(p.id);
      void trackEvent("discover_trending_post_impression", { postId: p.id });
    });
  }, [trendingPosts]);

  // ---------- Live battles (cursor pagination + cache) ----------
  const fetchBattlesPage = useCallback(
    async (cursor: BattlesCursor): Promise<{ rows: LiveBattle[]; hasMore: boolean; nextCursor: BattlesCursor }> => {
      const nowIso = new Date().toISOString();
      let q = supabase
        .from("battles")
        .select(
          "id, ends_at, challenger_votes, opponent_votes, challenger_id, opponent_id, challenger:profiles!battles_challenger_id_fkey(username, profile_photo_url), opponent:profiles!battles_opponent_id_fkey(username, profile_photo_url)",
        )
        .in("status", ["active", "pending"])
        .gt("ends_at", nowIso)
        .order("ends_at", { ascending: true })
        .order("id", { ascending: true })
        .limit(BATTLES_PAGE);
      if (cursor) {
        q = q.or(`ends_at.gt.${cursor.endsAt},and(ends_at.eq.${cursor.endsAt},id.gt.${cursor.id})`);
      }
      const { data, error } = await q;
      if (error) throw error;
      const all = ((data as any[]) || []);
      const rows = all.filter(
        (b) => !blockedIds.has(b.challenger_id) && !blockedIds.has(b.opponent_id),
      ) as LiveBattle[];
      const last = all[all.length - 1];
      const nextCursor = last ? { endsAt: String(last.ends_at), id: String(last.id) } : null;
      return { rows, hasMore: all.length === BATTLES_PAGE, nextCursor };
    },
    [blockedIds],
  );

  useEffect(() => {
    let cancelled = false;
    setBattlesLoading(true);
    setBattlesError(false);
    setBattlesHasMore(true);
    setBattlesCursor(null);
    (async () => {
      try {
        const cacheKey = makeCacheKey("battles", { user: user?.id ?? "anon", cursor: "0" });
        const cached = getCached<{ rows: LiveBattle[]; hasMore: boolean; nextCursor: BattlesCursor }>(cacheKey);
        if (cached) {
          void trackEvent("discover_cache_hit", { metadata: { section: "battles" } });
          if (!cancelled) {
            setBattles(cached.rows);
            setBattlesHasMore(cached.hasMore);
            setBattlesCursor(cached.nextCursor);
            setBattlesLoading(false);
            return;
          }
        }
        void trackEvent("discover_cache_miss", { metadata: { section: "battles" } });
        const r = await fetchBattlesPage(null);
        if (cancelled) return;
        setBattles(r.rows);
        setBattlesHasMore(r.hasMore);
        setBattlesCursor(r.nextCursor);
        setCached(cacheKey, "battles", r);
      } catch {
        if (!cancelled) setBattlesError(true);
      } finally {
        if (!cancelled) setBattlesLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [fetchBattlesPage, refreshKey, user?.id]);

  const loadMoreBattles = useCallback(async () => {
    if (battlesFetchingRef.current || !battlesHasMore || battlesLoading) return;
    battlesFetchingRef.current = true;
    setBattlesLoadingMore(true);
    setBattlesError(false);
    try {
      const r = await fetchBattlesPage(battlesCursor);
      setBattles((prev) => {
        const seen = new Set(prev.map((b) => b.id));
        const fresh = r.rows.filter((x) => !seen.has(x.id));
        if (fresh.length !== r.rows.length) {
          void trackEvent("discover_duplicate_prevented", { metadata: { section: "battles", dropped: r.rows.length - fresh.length } });
        }
        return [...prev, ...fresh];
      });
      setBattlesHasMore(r.hasMore);
      setBattlesCursor(r.nextCursor);
      void trackEvent("discover_battles_pagination_loaded", { metadata: { count: r.rows.length } });
    } catch {
      setBattlesError(true);
      void trackEvent("discover_pagination_failed", { metadata: { section: "battles" } });
    } finally {
      battlesFetchingRef.current = false;
      setBattlesLoadingMore(false);
    }
  }, [fetchBattlesPage, battlesHasMore, battlesLoading, battlesCursor]);


  // Suggested creators — exclude self, blocked, banned, suspended, private
  useEffect(() => {
    (async () => {
      let excludeIds: string[] = [];
      let followingIds: string[] = [];
      if (user) {
        const { data: f } = await supabase
          .from("follows")
          .select("following_id")
          .eq("follower_id", user.id);
        followingIds = ((f as any[]) || []).map((r) => r.following_id);
        excludeIds = [...followingIds, user.id, ...Array.from(blockedIds)];
      }
      setFollowing(new Set(followingIds));
      let q: any = supabase
        .from("profiles")
        .select("id, username, profile_photo_url, bio, crown_score")
        .not("username", "is", null)
        .eq("is_banned", false)
        .eq("is_suspended", false)
        .eq("is_private", false)
        .order("crown_score", { ascending: false })
        .limit(20);
      if (excludeIds.length > 0) q = q.not("id", "in", `(${excludeIds.join(",")})`);
      const { data } = await q;
      setSuggested(((data as any[]) || []).slice(0, 6));
    })();
  }, [user, refreshKey, blockedIds]);

  // ---------- People Near You (radius + geo fallback) ----------
  // Resolve a viewer origin coord from city/state/country (no precise GPS unless granted).
  const resolveProfileOrigin = useCallback(
    (city: string | null, state: string | null, country: string | null): {
      coord: [number, number] | null;
      source: "city" | "state" | "country" | "none";
    } => {
      if (city) {
        const c = lookupGeo(city, "city");
        if (c) return { coord: c, source: "city" };
      }
      if (state) {
        const s = lookupGeo(state, "state");
        if (s) return { coord: s, source: "state" };
      }
      if (country) {
        const co = lookupGeo(country, "country");
        if (co) return { coord: co, source: "country" };
      }
      return { coord: null, source: "none" };
    },
    [],
  );

  useEffect(() => {
    if (!user) { setNearby([]); setGeoSource("none"); return; }
    let cancelled = false;
    setNearbyLoading(true);
    (async () => {
      const { data: me } = await supabase
        .from("profiles")
        .select("city, state, country")
        .eq("id", user.id)
        .maybeSingle();
      const city = (me as any)?.city as string | null;
      const state = (me as any)?.state as string | null;
      const country = (me as any)?.country as string | null;

      // If GPS already granted, keep it; otherwise resolve from profile.
      let origin = originCoord;
      let source: typeof geoSource = geoSource;
      if (!origin || source === "none") {
        const r = resolveProfileOrigin(city, state, country);
        origin = r.coord;
        source = r.source;
        if (!cancelled) {
          setOriginCoord(origin);
          setGeoSource(source);
          if (source !== "none" && source !== "city") {
            void trackEvent("discover_people_near_you_geo_fallback_used", {
              metadata: { fallback: source },
            });
          }
        }
      }

      // Candidate pool: same country if known, else top creators globally.
      let q: any = supabase
        .from("profiles")
        .select("id, username, profile_photo_url, city, country, crown_score")
        .not("username", "is", null)
        .neq("id", user.id)
        .eq("is_banned", false)
        .eq("is_suspended", false)
        .eq("is_private", false)
        .order("crown_score", { ascending: false })
        .limit(60);
      if (country) q = q.eq("country", country);
      const { data } = await q;
      const blocked = blockedIds;
      const raw = ((data as any[]) || []).filter((r) => !blocked.has(r.id));

      const enriched = raw.map((r) => {
        const coord =
          (r.city && lookupGeo(r.city, "city")) ||
          (r.country && lookupGeo(r.country, "country")) ||
          null;
        return { ...r, _coord: coord } as NearbyUser & { _coord: [number, number] | null };
      });

      // Apply radius filter only when we know origin.
      const filtered = origin
        ? enriched.filter((r) => withinRadius(origin, r._coord, radius))
        : enriched;

      if (!cancelled) {
        setNearby(filtered.slice(0, 12));
        setNearbyLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [user, refreshKey, radius, originCoord, blockedIds, resolveProfileOrigin, geoSource]);

  const requestPreciseLocation = useCallback(() => {
    if (!("geolocation" in navigator)) {
      toast({ title: "Location unavailable", description: "Your browser doesn't support location. Showing people from your region instead." });
      return;
    }
    setGeoRequesting(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setGeoRequesting(false);
        setOriginCoord([pos.coords.latitude, pos.coords.longitude]);
        setGeoSource("gps");
        toast({ title: "Location enabled", description: "Showing people near you." });
      },
      () => {
        setGeoRequesting(false);
        toast({
          title: "Location permission off",
          description: "Showing popular people in your region instead.",
        });
        void trackEvent("discover_people_near_you_geo_fallback_used", { metadata: { fallback: "denied" } });
      },
      { enableHighAccuracy: false, timeout: 8000, maximumAge: 300_000 },
    );
  }, []);

  const handleRadiusChange = (r: RadiusMiles) => {
    if (r === radius) return;
    setRadius(r);
    saveRadius(r);
    void trackEvent("discover_people_near_you_radius_changed", {
      metadata: { radius_mi: r, geo_source: geoSource },
    });
  };

  // Top gifters (last 7d, by total_shekels sent)
  useEffect(() => {
    (async () => {
      const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
      const { data } = await supabase
        .from("gift_transactions")
        .select("sender_id, total_shekels, sender:profiles!gift_transactions_sender_id_fkey(username, profile_photo_url)")
        .gte("created_at", since)
        .eq("status", "completed")
        .limit(500);
      const map = new Map<string, TopGifter>();
      ((data as any[]) || []).forEach((g) => {
        if (!g.sender) return;
        const cur = map.get(g.sender_id);
        const add = Number(g.total_shekels) || 0;
        if (cur) cur.total += add;
        else map.set(g.sender_id, {
          user_id: g.sender_id,
          username: g.sender.username,
          profile_photo_url: g.sender.profile_photo_url,
          total: add,
        });
      });
      setGifters([...map.values()].sort((a, b) => b.total - a.total).slice(0, 5));
    })();
  }, [refreshKey]);

  const sortedMains = useMemo(
    () => [...mains].sort((a, b) => (stats[b.slug]?.post_count ?? 0) - (stats[a.slug]?.post_count ?? 0)),
    [mains, stats]
  );

  const onSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const q = search.trim();
    if (!q) return;
    void trackEvent("discover_search_submitted", { metadata: { kind: q.startsWith("#") ? "tag" : q.startsWith("@") ? "user" : "text" } });
    if (q.startsWith("#")) nav(`/feed?tag=${encodeURIComponent(q.slice(1))}`);
    else if (q.startsWith("@")) nav(`/${encodeURIComponent(q.slice(1))}`);
    else nav(`/feed?q=${encodeURIComponent(q)}`);
  };

  const postCover = (p: TrendingPost): string | null => {
    if (p.video_poster_url) return p.video_poster_url;
    if (p.image_urls && p.image_urls.length > 0) return p.image_urls[0];
    return p.image_url ?? null;
  };

  const handleWindowChange = (w: Window) => {
    if (w === windowSel) return;
    setWindowSel(w);
    void trackEvent("discover_window_changed", { metadata: { window: w } });
  };

  const refresh = useCallback(async () => {
    if (isRefreshing) return;
    setIsRefreshing(true);
    void trackEvent("discover_refreshed");
    impressed.current.clear();
    setRefreshKey((k) => k + 1);
    // Give the queued effects a moment to fire so the spinner feels real.
    await new Promise((r) => setTimeout(r, 600));
    setIsRefreshing(false);
  }, [isRefreshing]);

  // Toggle follow with instant UI feedback + rollback on error.
  const toggleFollow = async (targetId: string, username: string) => {
    if (!user) { nav("/auth"); return; }
    if (pendingFollow.has(targetId)) return;
    const isFollowing = following.has(targetId);
    setPendingFollow((s) => new Set(s).add(targetId));
    setFollowing((s) => {
      const next = new Set(s);
      if (isFollowing) next.delete(targetId); else next.add(targetId);
      return next;
    });
    try {
      if (isFollowing) {
        const { error } = await supabase.from("follows").delete().eq("follower_id", user.id).eq("following_id", targetId);
        if (error) throw error;
        void trackEvent("discover_creator_unfollowed", { metadata: { username } });
      } else {
        const { error } = await supabase.from("follows").insert({ follower_id: user.id, following_id: targetId });
        if (error) throw error;
        void trackEvent("discover_creator_followed", { metadata: { username } });
      }
    } catch (e: any) {
      // Rollback
      setFollowing((s) => {
        const next = new Set(s);
        if (isFollowing) next.add(targetId); else next.delete(targetId);
        return next;
      });
      toast({ title: "Couldn't update follow", description: e?.message ?? "Please try again.", variant: "destructive" });
    } finally {
      setPendingFollow((s) => { const n = new Set(s); n.delete(targetId); return n; });
    }
  };

  // --- Scroll-depth tracking (25/50/75/100), once per session ---------------
  const depthFired = useRef<Set<number>>(new Set());
  useEffect(() => {
    const milestones = [25, 50, 75, 100];
    const onScroll = () => {
      const h = document.documentElement;
      const max = (h.scrollHeight - h.clientHeight) || 1;
      const pct = Math.round((window.scrollY / max) * 100);
      for (const m of milestones) {
        if (pct >= m && !depthFired.current.has(m)) {
          depthFired.current.add(m);
          void trackEvent("discover_scroll_depth_reached", { metadata: { depth: m } });
        }
      }
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  // --- Section visibility tracking via IntersectionObserver ----------------
  const sectionRefs = {
    trending: useRef<HTMLElement>(null),
    battles: useRef<HTMLElement>(null),
    suggested: useRef<HTMLElement>(null),
    nearby: useRef<HTMLElement>(null),
    topics: useRef<HTMLElement>(null),
  };
  const sectionFired = useRef<Set<string>>(new Set());
  useEffect(() => {
    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((e) => {
          if (!e.isIntersecting) return;
          const name = (e.target as HTMLElement).dataset.section;
          if (!name || sectionFired.current.has(name)) return;
          sectionFired.current.add(name);
          void trackEvent("discover_section_viewed", { metadata: { section: name } });
        });
      },
      { threshold: 0.25 },
    );
    Object.values(sectionRefs).forEach((r) => { if (r.current) io.observe(r.current); });
    return () => io.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Sentinel-driven infinite loading for trending posts and battles
  const trendingSentinel = useRef<HTMLDivElement>(null);
  const battlesSentinel = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = trendingSentinel.current;
    if (!el) return;
    const io = new IntersectionObserver((entries) => {
      if (entries[0]?.isIntersecting) void loadMorePosts();
    }, { rootMargin: "200px" });
    io.observe(el);
    return () => io.disconnect();
  }, [loadMorePosts]);
  useEffect(() => {
    const el = battlesSentinel.current;
    if (!el) return;
    const io = new IntersectionObserver((entries) => {
      if (entries[0]?.isIntersecting) void loadMoreBattles();
    }, { rootMargin: "200px" });
    io.observe(el);
    return () => io.disconnect();
  }, [loadMoreBattles]);

  // --- Discover state preservation across back-navigation -------------------
  // We snapshot loaded items + cursor + scroll on unmount and restore on mount
  // so tapping a post/profile/battle and pressing Back returns the user to the
  // exact same Discover view. Cache TTL still applies — if data went stale we
  // refetch lazily, but the snapshot keeps the scroll position intact.
  const STATE_KEY = "crownme:discover:state:v1";
  const restoredRef = useRef(false);
  useEffect(() => {
    if (restoredRef.current) return;
    restoredRef.current = true;
    try {
      const raw = sessionStorage.getItem(STATE_KEY);
      if (!raw) return;
      const s = JSON.parse(raw) as {
        windowSel?: Window; radius?: RadiusMiles; scrollY?: number;
        trending?: TrendingPost[]; trendingCursor?: PostsCursor; trendingHasMore?: boolean;
        battles?: LiveBattle[]; battlesCursor?: BattlesCursor; battlesHasMore?: boolean;
      };
      if (s.windowSel) setWindowSel(s.windowSel);
      if (typeof s.radius === "number") setRadius(s.radius as RadiusMiles);
      if (Array.isArray(s.trending) && s.trending.length > 0) {
        setTrendingPosts(s.trending);
        setPostsCursor(s.trendingCursor ?? null);
        if (typeof s.trendingHasMore === "boolean") setPostsHasMore(s.trendingHasMore);
        setPostsLoading(false);
      }
      if (Array.isArray(s.battles) && s.battles.length > 0) {
        setBattles(s.battles);
        setBattlesCursor(s.battlesCursor ?? null);
        if (typeof s.battlesHasMore === "boolean") setBattlesHasMore(s.battlesHasMore);
        setBattlesLoading(false);
      }
      if (typeof s.scrollY === "number") {
        // Defer until after first paint so layout is correct.
        requestAnimationFrame(() => window.scrollTo(0, s.scrollY!));
      }
      void trackEvent("discover_state_restored");
    } catch { /* ignore */ }
  }, []);

  useEffect(() => {
    const save = () => {
      try {
        sessionStorage.setItem(STATE_KEY, JSON.stringify({
          windowSel, radius, scrollY: window.scrollY,
          trending: trendingPosts.slice(0, 60), trendingCursor: postsCursor, trendingHasMore: postsHasMore,
          battles: battles.slice(0, 30), battlesCursor: battlesCursor, battlesHasMore: battlesHasMore,
        }));
      } catch { /* quota — ignore */ }
    };
    window.addEventListener("pagehide", save);
    return () => { save(); window.removeEventListener("pagehide", save); };
  }, [windowSel, radius, trendingPosts, postsCursor, postsHasMore, battles, battlesCursor, battlesHasMore]);


  // --- Pull-to-refresh (touch only, top of scroll) ---------------------------
  const ptrRef = useRef<HTMLDivElement>(null);
  const [pullDist, setPullDist] = useState(0);
  const startY = useRef<number | null>(null);
  const PULL_TRIGGER = 70;

  const onTouchStart = (e: React.TouchEvent) => {
    if (window.scrollY > 0) { startY.current = null; return; }
    startY.current = e.touches[0].clientY;
  };
  const onTouchMove = (e: React.TouchEvent) => {
    if (startY.current === null) return;
    const dy = e.touches[0].clientY - startY.current;
    if (dy <= 0) { setPullDist(0); return; }
    // Dampen
    setPullDist(Math.min(120, dy * 0.55));
  };
  const onTouchEnd = () => {
    if (startY.current === null) return;
    const dist = pullDist;
    startY.current = null;
    setPullDist(0);
    if (dist >= PULL_TRIGGER) void refresh();
  };

  return (
    <AppShell title="Discover">
      <div
        ref={ptrRef}
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={onTouchEnd}
        className="relative"
      >
        {/* Pull-to-refresh indicator */}
        <div
          className="flex items-center justify-center overflow-hidden transition-[height] duration-150"
          style={{ height: isRefreshing ? 44 : pullDist }}
          aria-hidden={!isRefreshing && pullDist === 0}
        >
          {(isRefreshing || pullDist > 0) && (
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              {isRefreshing ? (
                <Loader2 size={14} className="animate-spin text-primary" />
              ) : (
                <RefreshCw
                  size={14}
                  className="text-primary transition-transform"
                  style={{ transform: `rotate(${Math.min(360, (pullDist / PULL_TRIGGER) * 270)}deg)` }}
                />
              )}
              <span>{isRefreshing ? "Refreshing…" : pullDist >= PULL_TRIGGER ? "Release to refresh" : "Pull to refresh"}</span>
            </div>
          )}
        </div>

        <main className="max-w-5xl mx-auto px-4 pb-24">
          <header className="pt-6 pb-4 flex items-start justify-between gap-3">
            <div>
              <h1 className="font-display text-3xl mb-1">Discover</h1>
              <p className="text-sm text-muted-foreground">Browse every kingdom. Crown a category.</p>
            </div>
            <button
              onClick={refresh}
              disabled={isRefreshing}
              className="shrink-0 inline-flex items-center gap-1.5 h-9 px-3 rounded-full border border-border hover:border-primary/50 text-xs font-medium text-muted-foreground hover:text-primary transition disabled:opacity-50"
              aria-label="Refresh Discover"
            >
              {isRefreshing ? <Loader2 size={13} className="animate-spin" /> : <RefreshCw size={13} />}
              Refresh
            </button>
          </header>

          {/* Search — inline debounced results dropdown */}
          <form
            onSubmit={(e) => { onSearchSubmit(e); setShowSearch(false); }}
            className="mb-5 relative"
            onBlur={(e) => {
              // Delay so click on a result registers before dropdown closes.
              if (!e.currentTarget.contains(e.relatedTarget as Node | null)) {
                setTimeout(() => setShowSearch(false), 150);
              }
            }}
          >
            <label className="relative block">
              <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <input
                value={search}
                onChange={(e) => { setSearch(e.target.value); setShowSearch(true); }}
                onFocus={() => setShowSearch(true)}
                placeholder="Search posts, @users or #tags…"
                className="w-full h-11 pl-10 pr-4 rounded-xl bg-card border border-border focus:border-primary/60 outline-none text-sm"
                aria-label="Search CrownMe"
              />
            </label>
            {showSearch && (
              <DiscoverSearchResults
                query={search}
                onNavigate={() => { setShowSearch(false); setSearch(""); }}
              />
            )}
          </form>

          {/* Active hub / topic filter chip */}
          {hasFilter && (
            <div className="mb-4 flex items-center gap-2 flex-wrap">
              <span className="text-[11px] text-muted-foreground">Filtered by</span>
              <span className="text-xs font-bold px-2 py-1 rounded-full bg-primary/15 text-primary border border-primary/40">
                {mains.find((m) => m.slug === hubFilter)?.label ?? hubFilter}
                {topicFilter && ` · ${subs.find((s) => s.slug === topicFilter)?.label ?? topicFilter}`}
              </span>
              <button
                type="button"
                onClick={clearFilter}
                className="text-[11px] px-2 py-1 rounded-full border border-border text-muted-foreground hover:text-primary hover:border-primary/40"
              >
                Clear filter
              </button>
            </div>
          )}

          <section className="mb-6">
            <TrendingHashtags />
          </section>

          {/* Trending Hubs + time filter */}
          <section className="mb-8">
            <div className="flex items-center justify-between mb-3 gap-3">
              <h2 className="font-display text-lg flex items-center gap-2">
                <Flame size={16} className="text-primary" />Trending Hubs
              </h2>
              <div className="flex items-center gap-1 text-[11px]">
                {(["24h", "7d", "30d"] as Window[]).map((w) => (
                  <button
                    key={w}
                    onClick={() => handleWindowChange(w)}
                    className={`px-2 py-1 rounded-full border transition ${
                      windowSel === w
                        ? "bg-primary/15 border-primary/50 text-primary font-bold"
                        : "border-border text-muted-foreground hover:border-primary/30"
                    }`}
                  >
                    {w}
                  </button>
                ))}
              </div>
            </div>
            {loading && (
              <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-24" />)}
              </div>
            )}
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
              {sortedMains.slice(0, 6).map((m) => {
                const stat = stats[m.slug];
                const isActive = hubFilter === m.slug;
                return (
                  <Link
                    key={m.id}
                    // Selecting a hub filters Discover inline instead of leaving.
                    to={`/discover?hub=${m.slug}`}
                    replace
                    className={`relative rounded-2xl overflow-hidden p-4 bg-gradient-to-br ${m.gradient ?? "from-amber-400 to-yellow-600"} text-white shadow group hover:scale-[1.02] transition ${
                      isActive ? "ring-2 ring-white/80 outline outline-2 outline-primary" : ""
                    }`}
                  >
                    <div className="absolute inset-0 bg-black/25" />
                    <div className="relative">
                      <div className="flex items-center justify-between mb-1">
                        <p className="text-[10px] uppercase tracking-widest opacity-80">{isActive ? "Selected" : "Hub"}</p>
                        {(stat?.post_count ?? 0) > 0 && (
                          <span className="inline-flex items-center gap-1 text-[10px] font-bold bg-white/20 px-1.5 py-0.5 rounded-full backdrop-blur">
                            <TrendingUp size={9} />Hot
                          </span>
                        )}
                      </div>
                      <p className="font-display text-lg leading-tight mb-2">{m.label}</p>
                      <div className="flex items-center justify-between text-[11px] opacity-95">
                        <span>{stat?.post_count ?? 0} posts · {stat?.active_competitors ?? 0} 👥</span>
                        {stat?.champion_username && (
                          <span className="truncate max-w-[7rem]">👑 @{stat.champion_username}</span>
                        )}
                      </div>
                    </div>
                  </Link>
                );
              })}
            </div>
          </section>

          {/* Featured Topics */}
          {featuredTopics.length > 0 && (
            <section ref={sectionRefs.topics} data-section="topics" className="mb-8">
              <h2 className="font-display text-lg mb-3 flex items-center gap-2">
                <Star size={16} className="text-primary" />Featured Topics
              </h2>
              <div className="flex gap-2 overflow-x-auto scrollbar-none pb-1">
                {featuredTopics.map((t) => {
                  const m = mains.find((mm) => mm.id === t.main_category_id);
                  return (
                    <Link
                      key={t.id}
                      to={`/c/${m?.slug ?? ""}/${t.slug}`}
                      className="shrink-0 royal-card px-3 py-2 hover:border-primary/40 transition flex items-center gap-2"
                    >
                      <div className={`size-7 rounded-lg bg-gradient-to-br ${m?.gradient ?? "from-amber-400 to-yellow-600"} text-white flex items-center justify-center`}>
                        <Crown size={11} fill="currentColor" />
                      </div>
                      <div className="min-w-0">
                        <p className="text-xs font-bold leading-tight truncate">{t.label}</p>
                        <p className="text-[10px] text-muted-foreground truncate">{m?.label}</p>
                      </div>
                    </Link>
                  );
                })}
              </div>
            </section>
          )}

          {/* Trending Posts */}
          <section ref={sectionRefs.trending} data-section="trending_posts" className="mb-8">
            <div className="flex items-center justify-between mb-3">
              <h2 className="font-display text-lg flex items-center gap-2">
                <TrendingUp size={16} className="text-primary" />Trending Posts
                <span className="text-[10px] text-muted-foreground font-normal normal-case">last {windowSel}</span>
              </h2>
              <Link to="/feed" className="text-[11px] text-muted-foreground hover:text-primary">See feed</Link>
            </div>
            {postsLoading ? (
              <div className="grid grid-cols-3 gap-2">
                {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="aspect-square" />)}
              </div>
            ) : (() => {
              const visibleTrending = trendingPosts.filter((p) => !isFilteredOut(p as any, feedFilters));
              return visibleTrending.length === 0 ? (
                <p className="text-xs text-muted-foreground">No trending posts yet in this window.</p>
              ) : (
                <>
                  <div className="grid grid-cols-3 gap-2">
                    {visibleTrending.map((p) => (
                      <PostPreviewTile
                        key={p.id}
                        post={p}
                        // Handler tracks the impression + open events but
                        // navigation is owned by PostPreviewTile's <Link>.
                      />
                    ))}
                  {postsLoadingMore && Array.from({ length: 3 }).map((_, i) => (
                    <Skeleton key={`pm-${i}`} className="aspect-square" />
                  ))}
                </div>
                <div ref={trendingSentinel} aria-hidden className="h-1" />
                <div className="flex justify-center mt-3">
                  {postsError ? (
                    <button
                      onClick={loadMorePosts}
                      className="text-xs px-3 h-8 rounded-full border border-destructive/40 text-destructive hover:bg-destructive/10"
                    >
                      Couldn't load more — retry
                    </button>
                  ) : postsHasMore ? (
                    <button
                      onClick={loadMorePosts}
                      disabled={postsLoadingMore}
                      className="text-xs px-3 h-8 rounded-full border border-border text-muted-foreground hover:text-primary hover:border-primary/40 inline-flex items-center gap-1.5 disabled:opacity-60"
                    >
                      {postsLoadingMore && <Loader2 size={12} className="animate-spin" />}
                      Load more
                    </button>
                  ) : (
                    <span className="text-[11px] text-muted-foreground">No more results</span>
                  )}
                </div>
                </>
              );
            })()}
          </section>

          {/* Live Battles */}
          <section ref={sectionRefs.battles} data-section="live_battles" className="mb-8">
            <div className="flex items-center justify-between mb-3">
              <h2 className="font-display text-lg flex items-center gap-2">
                <Swords size={16} className="text-primary" />Live Battles
              </h2>
              <Link to="/battles" className="text-[11px] text-muted-foreground hover:text-primary">All battles</Link>
            </div>
            {battlesLoading ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {Array.from({ length: 2 }).map((_, i) => <Skeleton key={i} className="h-24" />)}
              </div>
            ) : battles.length === 0 ? (
              <p className="text-xs text-muted-foreground">No active battles right now.</p>
            ) : (
              <>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {battles.map((b) => {
                    const total = (b.challenger_votes ?? 0) + (b.opponent_votes ?? 0);
                    const cPct = total > 0 ? Math.round(((b.challenger_votes ?? 0) / total) * 100) : 50;
                    return (
                      <Link
                        key={b.id}
                        to={`/battles?b=${b.id}`}
                        onClick={() => {
                          void trackEvent("discover_battle_preview_opened", { metadata: { battle_id: b.id } });
                          void trackEvent("discover_battle_preview_clicked", { metadata: { battle_id: b.id } });
                        }}
                        className="royal-card p-3 hover:border-primary/40 transition"
                      >
                        <div className="flex items-center justify-between gap-2 mb-2">
                          <div className="flex items-center gap-2 min-w-0">
                            <div className="size-8 rounded-full bg-muted overflow-hidden shrink-0">
                              {b.challenger?.profile_photo_url && <img src={b.challenger.profile_photo_url} alt="" className="w-full h-full object-cover" />}
                            </div>
                            <span className="text-xs font-bold truncate">@{b.challenger?.username ?? "?"}</span>
                          </div>
                          <span className="text-[10px] uppercase tracking-widest text-primary font-bold">VS</span>
                          <div className="flex items-center gap-2 min-w-0 justify-end">
                            <span className="text-xs font-bold truncate">@{b.opponent?.username ?? "?"}</span>
                            <div className="size-8 rounded-full bg-muted overflow-hidden shrink-0">
                              {b.opponent?.profile_photo_url && <img src={b.opponent.profile_photo_url} alt="" className="w-full h-full object-cover" />}
                            </div>
                          </div>
                        </div>
                        <div className="h-1.5 rounded-full bg-secondary/50 overflow-hidden flex">
                          <div className="bg-primary" style={{ width: `${cPct}%` }} />
                          <div className="bg-accent flex-1" />
                        </div>
                        <p className="text-[10px] text-muted-foreground mt-1.5">{total} votes · ends {new Date(b.ends_at).toLocaleString()}</p>
                      </Link>
                    );
                  })}
                  {battlesLoadingMore && Array.from({ length: 2 }).map((_, i) => (
                    <Skeleton key={`bm-${i}`} className="h-24" />
                  ))}
                </div>
                <div ref={battlesSentinel} aria-hidden className="h-1" />
                <div className="flex justify-center mt-3">
                  {battlesError ? (
                    <button
                      onClick={loadMoreBattles}
                      className="text-xs px-3 h-8 rounded-full border border-destructive/40 text-destructive hover:bg-destructive/10"
                    >
                      Couldn't load more — retry
                    </button>
                  ) : battlesHasMore ? (
                    <button
                      onClick={loadMoreBattles}
                      disabled={battlesLoadingMore}
                      className="text-xs px-3 h-8 rounded-full border border-border text-muted-foreground hover:text-primary hover:border-primary/40 inline-flex items-center gap-1.5 disabled:opacity-60"
                    >
                      {battlesLoadingMore && <Loader2 size={12} className="animate-spin" />}
                      Load more
                    </button>
                  ) : (
                    <span className="text-[11px] text-muted-foreground">No more battles</span>
                  )}
                </div>
              </>
            )}
          </section>


          {/* Suggested Creators */}
          {suggested.length > 0 && (
            <section ref={sectionRefs.suggested} data-section="suggested_creators" className="mb-8">
              <h2 className="font-display text-lg mb-3 flex items-center gap-2">
                <UserPlus size={16} className="text-primary" />Suggested Creators
              </h2>
              <div className="flex gap-3 overflow-x-auto scrollbar-none pb-1">
                {suggested.map((s) => {
                  const isFollowing = following.has(s.id);
                  const isPending = pendingFollow.has(s.id);
                  return (
                    <div
                      key={s.id}
                      className="shrink-0 w-40 royal-card p-3 text-center hover:border-primary/40 transition flex flex-col"
                    >
                      <Link to={`/${s.username}`} className="block">
                        <div className="size-14 rounded-full bg-muted overflow-hidden mx-auto mb-2">
                          {s.profile_photo_url && <img src={s.profile_photo_url} alt="" className="w-full h-full object-cover" />}
                        </div>
                        <p className="text-xs font-bold truncate">@{s.username}</p>
                        <p className="text-[10px] text-muted-foreground truncate mb-2">{s.bio || `${s.crown_score} crown score`}</p>
                      </Link>
                      <button
                        onClick={() => toggleFollow(s.id, s.username)}
                        disabled={isPending}
                        aria-pressed={isFollowing}
                        className={`mt-auto inline-flex items-center justify-center gap-1 h-7 rounded-full text-[11px] font-bold transition disabled:opacity-60 ${
                          isFollowing
                            ? "bg-secondary/60 text-foreground border border-border hover:border-destructive/50 hover:text-destructive"
                            : "bg-gradient-gold text-primary-foreground gold-shadow hover:opacity-95"
                        }`}
                      >
                        {isPending ? (
                          <Loader2 size={11} className="animate-spin" />
                        ) : isFollowing ? (
                          <><UserCheck size={11} /> Following</>
                        ) : (
                          <><UserPlus size={11} /> Follow</>
                        )}
                      </button>
                    </div>
                  );
                })}
              </div>
            </section>
          )}

          {/* People Near You */}
          {user && (
            <section ref={sectionRefs.nearby} data-section="people_near_you" className="mb-8">
              <div className="flex items-center justify-between gap-2 mb-3 flex-wrap">
                <h2 className="font-display text-lg flex items-center gap-2">
                  <MapPin size={16} className="text-primary" />People Near You
                  {geoSource !== "none" && geoSource !== "gps" && (
                    <span className="text-[10px] text-muted-foreground font-normal normal-case">
                      (from your {geoSource})
                    </span>
                  )}
                </h2>
                <div className="flex items-center gap-2">
                  <RadiusSelector value={radius} onChange={handleRadiusChange} geoSource={geoSource} />

                  <button
                    type="button"
                    onClick={requestPreciseLocation}
                    disabled={geoRequesting}
                    aria-label="Use my current location"
                    className="h-8 px-2 inline-flex items-center gap-1 rounded-full border border-border text-[11px] text-muted-foreground hover:text-primary hover:border-primary/40 disabled:opacity-60"
                  >
                    {geoRequesting ? <Loader2 size={11} className="animate-spin" /> : <LocateFixed size={11} />}
                    {geoSource === "gps" ? "Precise" : "Use location"}
                  </button>
                  <Link to="/map" className="text-[11px] text-muted-foreground hover:text-primary">Open map</Link>
                </div>
              </div>
              {nearbyLoading ? (
                <div className="flex gap-3 overflow-x-auto scrollbar-none pb-1">
                  {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="shrink-0 w-40 h-40" />)}
                </div>
              ) : nearby.length === 0 ? (
                <div className="royal-card p-4 text-center">
                  <p className="text-xs text-muted-foreground mb-2">
                    No nearby creators found{radius !== 0 ? ` within ${radius} mi` : ""}.
                  </p>
                  <div className="flex justify-center gap-2">
                    {radius !== 0 && (
                      <button
                        onClick={() => handleRadiusChange(0)}
                        className="text-[11px] h-7 px-3 rounded-full border border-border hover:border-primary/40 hover:text-primary"
                      >
                        Try Anywhere nearby
                      </button>
                    )}
                    <button
                      onClick={requestPreciseLocation}
                      className="text-[11px] h-7 px-3 rounded-full border border-border hover:border-primary/40 hover:text-primary"
                    >
                      Retry location
                    </button>
                  </div>
                </div>
              ) : (
                <div className="flex gap-3 overflow-x-auto scrollbar-none pb-1">
                  {nearby.map((n) => {
                    const isFollowing = following.has(n.id);
                    const isPending = pendingFollow.has(n.id);
                    return (
                      <div key={n.id} className="shrink-0 w-40 royal-card p-3 text-center flex flex-col">
                        <Link
                          to={`/${n.username}`}
                          onClick={() => {
                            void trackEvent("discover_nearby_creator_opened", { metadata: { username: n.username } });
                            void trackEvent("discover_people_near_you_profile_clicked", { metadata: { radius_mi: radius, geo_source: geoSource } });
                          }}
                          className="block"
                        >
                          <div className="size-14 rounded-full bg-muted overflow-hidden mx-auto mb-2">
                            {n.profile_photo_url && <img src={n.profile_photo_url} alt="" className="w-full h-full object-cover" />}
                          </div>
                          <p className="text-xs font-bold truncate">@{n.username}</p>
                          <p className="text-[10px] text-muted-foreground truncate mb-2">
                            {[n.city, n.country].filter(Boolean).join(", ") || "Nearby"}
                          </p>
                        </Link>
                        <button
                          onClick={() => toggleFollow(n.id, n.username)}
                          disabled={isPending}
                          aria-pressed={isFollowing}
                          className={`mt-auto inline-flex items-center justify-center gap-1 h-7 rounded-full text-[11px] font-bold transition disabled:opacity-60 ${
                            isFollowing
                              ? "bg-secondary/60 text-foreground border border-border hover:border-destructive/50 hover:text-destructive"
                              : "bg-gradient-gold text-primary-foreground gold-shadow hover:opacity-95"
                          }`}
                        >
                          {isPending ? (
                            <Loader2 size={11} className="animate-spin" />
                          ) : isFollowing ? (
                            <><UserCheck size={11} /> Following</>
                          ) : (
                            <><UserPlus size={11} /> Follow</>
                          )}
                        </button>
                      </div>
                    );
                  })}
                </div>
              )}
            </section>
          )}


          {/* Top Gifters + Recently Crowned + Rising Stars */}
          <section className="mb-8 grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="royal-card p-4">
              <h2 className="font-display text-base mb-3 flex items-center gap-2">
                <Gift size={14} className="text-primary" />Top Gifters (7d)
              </h2>
              {gifters.length === 0 && <p className="text-xs text-muted-foreground">No gifters yet this week.</p>}
              <ul className="space-y-2">
                {gifters.map((g, i) => (
                  <li key={g.user_id} className="flex items-center gap-2">
                    <span className="text-[10px] font-bold w-4 text-muted-foreground">#{i + 1}</span>
                    <div className="size-8 rounded-full bg-muted overflow-hidden">
                      {g.profile_photo_url && <img src={g.profile_photo_url} alt="" className="w-full h-full object-cover" />}
                    </div>
                    <Link to={`/${g.username}`} className="min-w-0 flex-1 hover:text-primary">
                      <p className="text-xs font-bold truncate">@{g.username}</p>
                      <p className="text-[10px] text-muted-foreground tabular-nums">{g.total.toLocaleString()} ₪</p>
                    </Link>
                  </li>
                ))}
              </ul>
            </div>

            <div className="royal-card p-4">
              <h2 className="font-display text-base mb-3 flex items-center gap-2">
                <Trophy size={14} className="text-primary" />Recently Crowned
              </h2>
              {recent.length === 0 && <p className="text-xs text-muted-foreground">No crowns awarded yet.</p>}
              <ul className="space-y-2">
                {recent.slice(0, 5).map((c) => (
                  <li key={c.id} className="flex items-center gap-2">
                    <div className="size-8 rounded-full bg-muted overflow-hidden">
                      {c.user?.profile_photo_url && (
                        <img src={c.user.profile_photo_url} alt="" className="w-full h-full object-cover" />
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-xs font-bold truncate">@{c.user?.username ?? "unknown"}</p>
                      <p className="text-[10px] text-muted-foreground truncate">{c.category.replace(/_/g, " ")}</p>
                    </div>
                    <Crown size={12} className="text-gold shrink-0" fill="currentColor" />
                  </li>
                ))}
              </ul>
            </div>

            <div className="royal-card p-4">
              <h2 className="font-display text-base mb-3 flex items-center gap-2">
                <Zap size={14} className="text-primary" />Rising Stars (7d)
              </h2>
              {rising.length === 0 && <p className="text-xs text-muted-foreground">No risers yet this week.</p>}
              <ul className="space-y-2">
                {rising.map((r, i) => (
                  <li key={r.user_id} className="flex items-center gap-2">
                    <span className="text-[10px] font-bold w-4 text-muted-foreground">#{i + 1}</span>
                    <div className="size-8 rounded-full bg-muted overflow-hidden">
                      {r.profile_photo_url && (
                        <img src={r.profile_photo_url} alt="" className="w-full h-full object-cover" />
                      )}
                    </div>
                    <Link to={`/${r.username}`} className="min-w-0 flex-1 hover:text-primary">
                      <p className="text-xs font-bold truncate">@{r.username}</p>
                      <p className="text-[10px] text-muted-foreground">+{r.gained} crown score</p>
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          </section>

          {/* Royal Pass spotlight — only for non-members */}
          {user && !isRoyal && (
            <section className="mb-8">
              <Link
                to="/royal-pass"
                className="block relative overflow-hidden rounded-2xl p-5 bg-gradient-to-br from-amber-500 via-yellow-600 to-amber-700 text-white shadow group hover:scale-[1.01] transition"
              >
                <div className="absolute inset-0 bg-black/15" />
                <div className="relative flex items-center gap-4">
                  <ShieldCheck size={32} className="shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="font-display text-lg">Unlock Royal Pass</p>
                    <p className="text-xs opacity-90">Boosts, vote multipliers, custom flair & priority support.</p>
                  </div>
                  <ArrowRight size={18} className="shrink-0 group-hover:translate-x-1 transition" />
                </div>
              </Link>
            </section>
          )}

          {/* All Royal Hubs */}
          <section id="all-hubs">
            <h2 className="font-display text-lg mb-3 flex items-center gap-2">
              <Sparkles size={16} className="text-primary" />All Royal Hubs
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
              {mains.map((m) => {
                const stat = stats[m.slug];
                return (
                  <Link
                    key={m.id}
                    to={`/c/${m.slug}`}
                    className="royal-card p-3 flex items-center gap-3 hover:border-primary/40 transition group"
                  >
                    <div className={`size-10 rounded-xl bg-gradient-to-br ${m.gradient ?? "from-amber-400 to-yellow-600"} flex items-center justify-center text-white shadow`}>
                      <Crown size={16} fill="currentColor" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-bold text-sm">{m.label}</p>
                      <p className="text-[11px] text-muted-foreground truncate">
                        {stat?.post_count ?? 0} posts · {stat?.active_competitors ?? 0} competing
                      </p>
                    </div>
                    <ArrowRight size={14} className="text-muted-foreground group-hover:text-primary transition" />
                  </Link>
                );
              })}
            </div>
          </section>
        </main>
      </div>
    </AppShell>
  );
}
