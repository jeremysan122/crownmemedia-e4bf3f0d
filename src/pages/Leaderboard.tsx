import { useEffect, useMemo, useState } from "react";
import AppShell from "@/components/AppShell";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { CATEGORIES, CATEGORY_LABEL, CrownCategory, formatScore, locationLabel } from "@/lib/crown";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/context/AuthContext";
import { Crown, MapPin, Users, Globe2, Building2 } from "lucide-react";
import { Link, useSearchParams } from "react-router-dom";
import MyRankCard from "@/components/MyRankCard";
import { rankBadgeLabel } from "@/lib/rankTitle";
import { canSeeLikes } from "@/lib/privacyVisibility";
import HiddenCountLock from "@/components/HiddenCountLock";
import { useSeoMeta } from "@/hooks/useSeoMeta";
import { POST_SELECT } from "@/lib/postQuery";

type Scope = "nearby" | "city" | "state" | "country" | "global" | "following";

interface Row {
  id: string;
  user_id: string;
  image_url: string;
  city: string | null; state: string | null; country: string | null;
  category: CrownCategory;
  crown_score: number;
  vote_count: number;
  profile: { username: string; profile_photo_url: string | null; crowns_held: number; gender: import("@/lib/rankTitle").GenderValue; hide_likes?: boolean | null };
}

const SCOPE_META: Record<Scope, { label: string; icon: typeof Crown; needsRegion: boolean }> = {
  nearby: { label: "Nearby", icon: MapPin, needsRegion: true },
  city: { label: "City", icon: Building2, needsRegion: true },
  state: { label: "State", icon: MapPin, needsRegion: true },
  country: { label: "Country", icon: Globe2, needsRegion: true },
  global: { label: "Global", icon: Globe2, needsRegion: false },
  following: { label: "Following", icon: Users, needsRegion: false },
};

export default function Leaderboard() {
  const { profile, user } = useAuth();
  useSeoMeta({
    title: "Leaderboard — CrownMe Media",
    description: "See who holds the crown. CrownMe city, country, and global photo competition rankings, updated live.",
  });
  const [params, setParams] = useSearchParams();
  const initialScope = (params.get("scope") as Scope) || "global";
  const [scope, setScope] = useState<Scope>(initialScope);
  const [region, setRegion] = useState<string>(
    params.get("region") ||
      (initialScope === "city" || initialScope === "nearby"
        ? profile?.city ?? ""
        : initialScope === "state"
          ? profile?.state ?? ""
          : initialScope === "country"
            ? profile?.country ?? ""
            : ""),
  );
  const [category, setCategory] = useState<CrownCategory>("overall");
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [followingIds, setFollowingIds] = useState<string[]>([]);

  // Load follow list once when scope=following
  useEffect(() => {
    if (scope !== "following" || !user) return;
    supabase
      .from("follows")
      .select("following_id")
      .eq("follower_id", user.id)
      .then(({ data }) => setFollowingIds((data ?? []).map((f: { following_id: string }) => f.following_id)));
  }, [scope, user]);

  // Default region when switching scopes
  useEffect(() => {
    if (scope === "city" || scope === "nearby") setRegion(profile?.city ?? "");
    else if (scope === "state") setRegion(profile?.state ?? "");
    else if (scope === "country") setRegion(profile?.country ?? "");
    else setRegion("");
  }, [scope, profile?.city, profile?.state, profile?.country]);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      setLoading(true);
      let q = supabase
        .from("posts")
        // Canonical post shape — see src/lib/postQuery.ts
        .select(POST_SELECT)
        .eq("is_removed", false)
        .eq("category", category)
        .order("crown_score", { ascending: false })
        .limit(50);

      if (scope === "city" || scope === "nearby") {
        if (!region) { setRows([]); setLoading(false); return; }
        q = q.eq("city", region);
      } else if (scope === "state") {
        if (!region) { setRows([]); setLoading(false); return; }
        q = q.eq("state", region);
      } else if (scope === "country") {
        if (!region) { setRows([]); setLoading(false); return; }
        q = q.eq("country", region);
      } else if (scope === "following") {
        if (!user) { setRows([]); setLoading(false); return; }
        if (followingIds.length === 0) { setRows([]); setLoading(false); return; }
        q = q.in("user_id", followingIds);
      }

      const { data } = await q;
      if (cancelled) return;
      setRows((data as any) ?? []);
      setLoading(false);
    };
    load();
    return () => { cancelled = true; };
  }, [scope, region, category, user, followingIds]);

  useEffect(() => {
    setParams(region ? { scope, region } : { scope });
  }, [scope, region, setParams]);

  // Realtime refresh trigger for MyRankCard — bumps on vote/post/battle changes
  const [refreshKey, setRefreshKey] = useState(0);
  useEffect(() => {
    const ch = supabase
      .channel(`leaderboard-myrank-${crypto.randomUUID()}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "votes" }, () => setRefreshKey((k) => k + 1))
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "posts" }, () => setRefreshKey((k) => k + 1))
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "battles" }, () => setRefreshKey((k) => k + 1))
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, []);

  // My rank in current visible rows (used to optionally hide the inline duplicate row)
  const myRank = useMemo(() => {
    if (!user) return null;
    const idx = rows.findIndex((r) => r.user_id === user.id);
    return idx === -1 ? null : { rank: idx + 1, row: rows[idx] };
  }, [rows, user]);

  const king = rows[0];
  const queen = rows[1];
  const rest = rows.slice(2);

  const ScopeIcon = SCOPE_META[scope].icon;
  const headerLabel =
    scope === "global"
      ? "Global"
      : scope === "following"
        ? "People You Follow"
        : region || `Set your ${scope}`;

  return (
    <AppShell title="LEADERBOARD">
      <div className="px-4 pt-3 space-y-3 pb-6">
        <Tabs value={scope} onValueChange={(v) => setScope(v as Scope)}>
          <TabsList className="w-full grid grid-cols-6 bg-muted/40">
            <TabsTrigger value="nearby" className="text-[10px] lg:text-xs">Nearby</TabsTrigger>
            <TabsTrigger value="city" className="text-[10px] lg:text-xs">City</TabsTrigger>
            <TabsTrigger value="state" className="text-[10px] lg:text-xs">State</TabsTrigger>
            <TabsTrigger value="country" className="text-[10px] lg:text-xs">Country</TabsTrigger>
            <TabsTrigger value="global" className="text-[10px] lg:text-xs">Global</TabsTrigger>
            <TabsTrigger value="following" className="text-[10px] lg:text-xs">Following</TabsTrigger>
          </TabsList>
        </Tabs>

        <h1 className="sr-only">CrownMe Leaderboard</h1>
        <div className="grid grid-cols-2 gap-2">
          {SCOPE_META[scope].needsRegion ? (
            <>
              <label htmlFor="leaderboard-region" className="sr-only">{`Enter ${scope}`}</label>
              <input
                id="leaderboard-region"
                name="leaderboard-region"
                value={region}
                onChange={(e) => setRegion(e.target.value)}
                placeholder={`Enter ${scope}`}
                aria-label={`Enter ${scope}`}
                className="h-10 rounded-md bg-input px-3 text-sm border border-border"
              />
            </>
          ) : (
            <div className="h-10 flex items-center gap-2 rounded-md bg-muted/40 px-3 text-xs text-muted-foreground">
              <ScopeIcon size={14} /> {SCOPE_META[scope].label} ranking
            </div>
          )}
          <Select value={category} onValueChange={(v) => setCategory(v as CrownCategory)}>
            <SelectTrigger className="h-10 bg-input" aria-label="Category"><SelectValue /></SelectTrigger>
            <SelectContent>{CATEGORIES.map((c) => <SelectItem key={c} value={c}>{CATEGORY_LABEL[c]}</SelectItem>)}</SelectContent>
          </Select>
        </div>

        <div className="flex items-center justify-between">
          <h2 className="font-display text-xl text-gold flex items-center gap-2">
            <ScopeIcon size={18} /> {headerLabel} · {CATEGORY_LABEL[category]}
          </h2>
        </div>

        {/* Always-visible My Rank card — auto-refreshes on vote/battle realtime events */}
        {user && (
          <MyRankCard
            scope={scope}
            region={region}
            category={category}
            followingIds={followingIds}
            userId={user.id}
            username={profile?.username ?? null}
            refreshKey={refreshKey}
          />
        )}

        {/* Loading skeleton */}
        {loading && (
          <div className="space-y-2">
            <div className="grid grid-cols-2 gap-3">
              <div className="royal-card aspect-square animate-pulse" />
              <div className="royal-card aspect-square animate-pulse" />
            </div>
            {[1, 2, 3].map((i) => <div key={i} className="royal-card h-14 animate-pulse" />)}
          </div>
        )}

        {/* Empty states */}
        {!loading && rows.length === 0 && (
          <div className="royal-card p-8 text-center">
            {scope === "following" ? (
              <>
                <p className="font-display text-gold text-lg mb-2">No royals yet</p>
                <p className="text-sm text-muted-foreground">
                  Follow people to see how they rank against the throne.
                </p>
              </>
            ) : SCOPE_META[scope].needsRegion && !region ? (
              <>
                <p className="font-display text-gold text-lg mb-2">Set your {scope}</p>
                <p className="text-sm text-muted-foreground">Enter a {scope} above to see the local crown.</p>
              </>
            ) : (
              <>
                <p className="font-display text-gold text-lg mb-2">The throne is vacant</p>
                <p className="text-sm text-muted-foreground">No contenders yet — claim this throne.</p>
              </>
            )}
          </div>
        )}

        {!loading && rows.length > 0 && (
          <>
            {/* King + Queen */}
            <div className="grid grid-cols-2 gap-3">
              {[
                { p: king, rank: 1, color: "from-amber-400 to-yellow-700" },
                { p: queen, rank: 2, color: "from-rose-400 to-purple-700" },
              ].map(({ p, rank, color }) => {
                const label = p ? rankBadgeLabel(p.profile?.gender, rank).toUpperCase() : (rank === 1 ? "1ST" : "2ND");
                return (
                <div key={rank} className="royal-card overflow-hidden border-gold">
                  {p ? (
                    <Link to={`/u/${p.profile.username}`}>
                      <div className="aspect-square relative">
                        <img loading="lazy" src={p.image_url} alt={`${label} of ${headerLabel}`} className="w-full h-full object-cover" />
                        <div className={`absolute inset-x-0 top-0 bg-gradient-to-b ${color} text-white text-center text-xs font-bold py-1 tracking-widest overflow-hidden`}>
                          <span key={label} className="inline-block animate-fade-in">{label}</span>
                        </div>
                      </div>
                      <div className="p-2 text-center">
                        <div className="flex items-center justify-center gap-1">
                          <Crown size={12} className="text-primary" fill="currentColor" />
                          <span className="text-xs font-bold tabular-nums">{formatScore(p.crown_score)}</span>
                        </div>
                        <p className="text-xs truncate">@{p.profile.username}</p>
                      </div>
                    </Link>
                  ) : (
                    <div className="aspect-square flex items-center justify-center text-xs text-muted-foreground">Vacant</div>
                  )}
                </div>
                );
              })}
            </div>

            {/* My rank card if I'm not in top 2 */}
            {myRank && myRank.rank > 2 && (
              <div className="royal-card p-3 border-primary/40 flex items-center gap-3">
                <span className="font-display text-xl w-8 text-center text-gold">#{myRank.rank}</span>
                <div className="size-10 rounded-full overflow-hidden bg-muted shrink-0 crown-ring">
                  {myRank.row.profile.profile_photo_url && (
                    <img loading="lazy" src={myRank.row.profile.profile_photo_url} alt="" className="w-full h-full object-cover" />
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-bold truncate">@{myRank.row.profile.username} <span className="text-[10px] text-muted-foreground font-normal">(you)</span></p>
                  <p className="text-xs text-muted-foreground truncate">{locationLabel(myRank.row)}</p>
                </div>
                <div className="text-right">
                  <div className="flex items-center gap-1 justify-end">
                    <Crown size={12} className="text-primary" fill="currentColor" />
                    <span className="text-sm font-bold tabular-nums">{formatScore(myRank.row.crown_score)}</span>
                  </div>
                  {canSeeLikes(myRank.row.profile, { isOwner: user?.id === myRank.row.user_id }) ? (
                    <p className="text-[10px] text-muted-foreground">{myRank.row.vote_count} votes</p>
                  ) : (
                    <p className="text-[10px] text-muted-foreground flex items-center justify-end gap-1"><HiddenCountLock kind="likes" size={9} /> hidden</p>
                  )}
                </div>
              </div>
            )}

            <h3 className="font-display text-sm text-muted-foreground tracking-wider uppercase mt-3">Top Contenders</h3>
            <div className="space-y-2">
              {rest.map((r, i) => {
                const isMe = user?.id === r.user_id;
                return (
                  <Link
                    key={r.id}
                    to={`/u/${r.profile.username}`}
                    className={`flex items-center gap-3 royal-card p-2.5 ${isMe ? "border-primary/60" : ""}`}
                  >
                    <span className="font-display text-lg w-6 text-center text-muted-foreground">{i + 3}</span>
                    <div className="size-10 rounded-full overflow-hidden bg-muted shrink-0">
                      {r.profile.profile_photo_url && <img loading="lazy" src={r.profile.profile_photo_url} alt="" className="w-full h-full object-cover" />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-bold truncate">
                        @{r.profile.username}
                        {isMe && <span className="text-[10px] text-muted-foreground font-normal ml-1">(you)</span>}
                      </p>
                      <p className="text-xs text-muted-foreground truncate">{locationLabel(r)}</p>
                    </div>
                    <div className="text-right">
                      <div className="flex items-center gap-1 justify-end"><Crown size={12} className="text-primary" fill="currentColor" /><span className="text-sm font-bold tabular-nums">{formatScore(r.crown_score)}</span></div>
                      {canSeeLikes(r.profile, { isOwner: isMe }) ? (
                        <p className="text-[10px] text-muted-foreground">{r.vote_count} votes</p>
                      ) : (
                        <p className="text-[10px] text-muted-foreground flex items-center justify-end gap-1"><HiddenCountLock kind="likes" size={9} /> hidden</p>
                      )}
                    </div>
                  </Link>
                );
              })}
            </div>
          </>
        )}
      </div>
    </AppShell>
  );
}
