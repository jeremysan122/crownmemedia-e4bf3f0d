import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import AppShell from "@/components/AppShell";
import { useSeoMeta } from "@/hooks/useSeoMeta";
import { useAuth } from "@/context/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { useIsRoyalPassUser } from "@/hooks/useIsRoyalPassUser";
import { Crown, TrendingUp, Users, MapPin, Coins, BarChart3, Lock, Heart, MessageCircle, Share2 } from "lucide-react";
import {
  ResponsiveContainer, LineChart, Line, XAxis, YAxis, Tooltip, CartesianGrid,
  BarChart, Bar, PieChart, Pie, Cell, Legend,
} from "recharts";

type FollowerPoint = { date: string; followers: number; gained: number };
type PostRow = { id: string; caption: string | null; created_at: string; vote_count: number; comment_count: number; share_count: number; crown_score: number };
type GeoBucket = { name: string; value: number };

const ACCENT = "hsl(var(--primary))";
const SOFT = "hsl(var(--muted-foreground))";
const PIE_COLORS = ["hsl(var(--primary))", "hsl(var(--gold, var(--primary)))", "#c9a84c", "#8b6f5e", "#5cbdb9", "#e85d3a", "#a78bfa"];

function fmtDate(iso: string) {
  const d = new Date(iso);
  return `${d.getMonth() + 1}/${d.getDate()}`;
}

export default function Insights() {
  useSeoMeta({ title: "Insights · CrownMe", noIndex: true });
  const { user } = useAuth();
  const { isRoyalPass } = useIsRoyalPassUser();
  const [verified, setVerified] = useState<boolean | null>(null);
  const [loading, setLoading] = useState(true);
  const [range, setRange] = useState<7 | 30 | 90>(30);

  const [followerSeries, setFollowerSeries] = useState<FollowerPoint[]>([]);
  const [posts, setPosts] = useState<PostRow[]>([]);
  const [cities, setCities] = useState<GeoBucket[]>([]);
  const [countries, setCountries] = useState<GeoBucket[]>([]);
  const [giftsTotal, setGiftsTotal] = useState(0);
  const [giftBreakdown, setGiftBreakdown] = useState<GeoBucket[]>([]);
  const [royalPassEarnings, setRoyalPassEarnings] = useState(0);
  const [totals, setTotals] = useState({ followers: 0, totalVotes: 0, totalComments: 0, totalShares: 0 });

  // Gate
  useEffect(() => {
    if (!user) return;
    supabase.from("profiles").select("verified, followers_count").eq("id", user.id).maybeSingle().then(({ data }) => {
      setVerified(!!data?.verified);
      setTotals((t) => ({ ...t, followers: data?.followers_count ?? 0 }));
    });
  }, [user?.id]);

  const hasAccess = verified === true || isRoyalPass;

  useEffect(() => {
    if (!user || !hasAccess) { setLoading(false); return; }
    let cancelled = false;
    (async () => {
      setLoading(true);
      const since = new Date(Date.now() - range * 86400000).toISOString();

      const [followsRes, postsRes, audienceRes, giftsRes, earningsRes] = await Promise.all([
        supabase.from("follows").select("created_at").eq("following_id", user.id).gte("created_at", since).order("created_at"),
        supabase.from("posts").select("id, caption, created_at, vote_count, comment_count, share_count, crown_score").eq("user_id", user.id).eq("is_removed", false).order("crown_score", { ascending: false }).limit(50),
        supabase.from("follows").select("follower_id, profiles!follows_follower_id_fkey(city, country)").eq("following_id", user.id).limit(1000),
        supabase.from("gift_transactions").select("gift_name, receiver_earnings_shekels, created_at").eq("receiver_id", user.id).gte("created_at", since),
        supabase.from("shekel_ledger").select("shekels_delta").eq("user_id", user.id).eq("kind", "royal_pass_bonus").gte("created_at", since),
      ]);

      if (cancelled) return;

      // Follower growth bucketed by day
      const buckets = new Map<string, number>();
      for (let i = range - 1; i >= 0; i--) {
        const d = new Date(Date.now() - i * 86400000);
        buckets.set(d.toISOString().slice(0, 10), 0);
      }
      (followsRes.data || []).forEach((f: any) => {
        const key = f.created_at.slice(0, 10);
        if (buckets.has(key)) buckets.set(key, (buckets.get(key) || 0) + 1);
      });
      let running = Math.max(0, (totals.followers || 0) - (followsRes.data?.length || 0));
      const series: FollowerPoint[] = [];
      for (const [date, gained] of buckets) {
        running += gained;
        series.push({ date, followers: running, gained });
      }
      setFollowerSeries(series);

      // Posts
      const postsList = (postsRes.data || []) as PostRow[];
      setPosts(postsList);
      setTotals((t) => ({
        ...t,
        totalVotes: postsList.reduce((s, p) => s + (p.vote_count || 0), 0),
        totalComments: postsList.reduce((s, p) => s + (p.comment_count || 0), 0),
        totalShares: postsList.reduce((s, p) => s + (p.share_count || 0), 0),
      }));

      // Audience demographics
      const cityCount = new Map<string, number>();
      const countryCount = new Map<string, number>();
      (audienceRes.data || []).forEach((row: any) => {
        const c = row.profiles?.city?.trim();
        const co = row.profiles?.country?.trim();
        if (c) cityCount.set(c, (cityCount.get(c) || 0) + 1);
        if (co) countryCount.set(co, (countryCount.get(co) || 0) + 1);
      });
      setCities([...cityCount.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8).map(([name, value]) => ({ name, value })));
      setCountries([...countryCount.entries()].sort((a, b) => b[1] - a[1]).slice(0, 6).map(([name, value]) => ({ name, value })));

      // Earnings & gifts
      const giftMap = new Map<string, number>();
      let total = 0;
      (giftsRes.data || []).forEach((g: any) => {
        const earned = Number(g.receiver_earnings_shekels || 0);
        total += earned;
        giftMap.set(g.gift_name, (giftMap.get(g.gift_name) || 0) + earned);
      });
      setGiftsTotal(total);
      setGiftBreakdown([...giftMap.entries()].sort((a, b) => b[1] - a[1]).slice(0, 6).map(([name, value]) => ({ name, value: Math.round(value) })));

      const rpTotal = (earningsRes.data || []).reduce((s: number, r: any) => s + Number(r.shekels_delta || 0), 0);
      setRoyalPassEarnings(rpTotal);

      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [user?.id, hasAccess, range, totals.followers]);

  const followerGain = useMemo(() => followerSeries.reduce((s, p) => s + p.gained, 0), [followerSeries]);

  if (verified === null) {
    return <AppShell title="INSIGHTS"><div className="p-10 text-center text-muted-foreground text-sm">Loading…</div></AppShell>;
  }

  if (!hasAccess) {
    return (
      <AppShell title="INSIGHTS">
        <div className="px-4 py-8">
          <div className="royal-card p-8 text-center max-w-md mx-auto">
            <Lock size={32} className="mx-auto mb-3 text-gold" />
            <h1 className="font-display text-2xl text-gold mb-2">Royal Insights</h1>
            <p className="text-sm text-muted-foreground mb-5">
              Deep analytics on your reach, audience, top posts, and earnings.
              Unlock with Royal Pass or a verified badge.
            </p>
            <div className="flex flex-col gap-2">
              <Link to="/royal-pass" className="px-4 py-2 rounded-lg bg-primary text-primary-foreground font-bold text-sm">Get Royal Pass</Link>
              <Link to="/verification" className="px-4 py-2 rounded-lg border border-border text-sm font-semibold">Apply for verification</Link>
            </div>
          </div>
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell title="INSIGHTS">
      <div className="px-4 py-3 space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="font-display text-xl text-gold flex items-center gap-2"><BarChart3 size={20}/> Creator Insights</h1>
            <p className="text-xs text-muted-foreground">Track your royal court's growth and earnings.</p>
          </div>
          <div className="flex gap-1 bg-muted/40 p-1 rounded-lg text-xs font-bold">
            {[7, 30, 90].map((n) => (
              <button key={n} onClick={() => setRange(n as 7|30|90)}
                className={`px-3 py-1 rounded ${range === n ? "bg-primary text-primary-foreground" : "text-muted-foreground"}`}>
                {n}d
              </button>
            ))}
          </div>
        </div>

        {/* KPI tiles */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
          <Kpi icon={Users} label="Followers" value={totals.followers.toLocaleString()} delta={followerGain > 0 ? `+${followerGain}` : null} />
          <Kpi icon={Heart} label="Votes" value={totals.totalVotes.toLocaleString()} />
          <Kpi icon={MessageCircle} label="Comments" value={totals.totalComments.toLocaleString()} />
          <Kpi icon={Coins} label="Shekels earned" value={Math.round(giftsTotal + royalPassEarnings).toLocaleString()} />
        </div>

        {/* Follower growth */}
        <Card title="Follower growth" icon={TrendingUp}>
          {loading ? <Skeleton /> : (
            <div className="h-56">
              <ResponsiveContainer>
                <LineChart data={followerSeries} margin={{ top: 5, right: 8, bottom: 0, left: -16 }}>
                  <CartesianGrid stroke="hsl(var(--border))" strokeDasharray="3 3" vertical={false}/>
                  <XAxis dataKey="date" tickFormatter={fmtDate} stroke={SOFT} fontSize={10}/>
                  <YAxis stroke={SOFT} fontSize={10}/>
                  <Tooltip contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", fontSize: 12 }}/>
                  <Line type="monotone" dataKey="followers" stroke={ACCENT} strokeWidth={2} dot={false}/>
                </LineChart>
              </ResponsiveContainer>
            </div>
          )}
        </Card>

        {/* Top posts */}
        <Card title="Top performing posts" icon={Crown}>
          {loading ? <Skeleton /> : posts.length === 0 ? <Empty msg="No posts yet"/> : (
            <div className="space-y-2">
              {posts.slice(0, 8).map((p, idx) => (
                <Link to={`/feed?post=${p.id}`} key={p.id} className="flex items-center gap-3 p-2 rounded-lg hover:bg-muted/40 transition">
                  <span className="text-gold font-display text-lg w-6 text-center">{idx + 1}</span>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold truncate">{p.caption || "Untitled post"}</p>
                    <div className="flex gap-3 text-[11px] text-muted-foreground mt-0.5">
                      <span className="flex items-center gap-1"><Heart size={10}/>{p.vote_count}</span>
                      <span className="flex items-center gap-1"><MessageCircle size={10}/>{p.comment_count}</span>
                      <span className="flex items-center gap-1"><Share2 size={10}/>{p.share_count}</span>
                      <span className="flex items-center gap-1"><Crown size={10}/>{Math.round(p.crown_score)}</span>
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </Card>

        {/* Audience */}
        <div className="grid md:grid-cols-2 gap-3">
          <Card title="Top cities" icon={MapPin}>
            {loading ? <Skeleton /> : cities.length === 0 ? <Empty msg="No location data"/> : (
              <div className="h-56">
                <ResponsiveContainer>
                  <BarChart data={cities} layout="vertical" margin={{ left: 0, right: 8 }}>
                    <CartesianGrid stroke="hsl(var(--border))" strokeDasharray="3 3" horizontal={false}/>
                    <XAxis type="number" stroke={SOFT} fontSize={10}/>
                    <YAxis type="category" dataKey="name" stroke={SOFT} fontSize={10} width={80}/>
                    <Tooltip contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", fontSize: 12 }}/>
                    <Bar dataKey="value" fill={ACCENT} radius={[0, 4, 4, 0]}/>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
          </Card>
          <Card title="Top countries" icon={MapPin}>
            {loading ? <Skeleton /> : countries.length === 0 ? <Empty msg="No location data"/> : (
              <div className="h-56">
                <ResponsiveContainer>
                  <PieChart>
                    <Pie data={countries} dataKey="value" nameKey="name" outerRadius={70} label={(e) => e.name}>
                      {countries.map((_, i) => <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]}/>)}
                    </Pie>
                    <Tooltip contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", fontSize: 12 }}/>
                  </PieChart>
                </ResponsiveContainer>
              </div>
            )}
          </Card>
        </div>

        {/* Earnings */}
        <Card title="Earnings breakdown" icon={Coins}>
          {loading ? <Skeleton /> : (
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-2">
                <div className="rounded-lg border border-border p-3">
                  <p className="text-[11px] text-muted-foreground uppercase tracking-wider">Gift earnings</p>
                  <p className="font-display text-xl text-gold">{Math.round(giftsTotal).toLocaleString()} <span className="text-xs">₪</span></p>
                </div>
                <div className="rounded-lg border border-border p-3">
                  <p className="text-[11px] text-muted-foreground uppercase tracking-wider">Royal Pass bonus</p>
                  <p className="font-display text-xl text-gold">{Math.round(royalPassEarnings).toLocaleString()} <span className="text-xs">₪</span></p>
                </div>
              </div>
              {giftBreakdown.length > 0 && (
                <div className="h-48">
                  <ResponsiveContainer>
                    <BarChart data={giftBreakdown} margin={{ left: -16, right: 8 }}>
                      <CartesianGrid stroke="hsl(var(--border))" strokeDasharray="3 3" vertical={false}/>
                      <XAxis dataKey="name" stroke={SOFT} fontSize={10}/>
                      <YAxis stroke={SOFT} fontSize={10}/>
                      <Tooltip contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", fontSize: 12 }}/>
                      <Bar dataKey="value" fill={ACCENT} radius={[4, 4, 0, 0]}/>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              )}
            </div>
          )}
        </Card>
      </div>
    </AppShell>
  );
}

function Kpi({ icon: Icon, label, value, delta }: { icon: any; label: string; value: string; delta?: string | null }) {
  return (
    <div className="royal-card p-3">
      <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground uppercase tracking-wider">
        <Icon size={12}/> {label}
      </div>
      <div className="flex items-baseline gap-2 mt-1">
        <p className="font-display text-xl text-foreground">{value}</p>
        {delta && <span className="text-[11px] font-bold text-emerald-500">{delta}</span>}
      </div>
    </div>
  );
}

function Card({ title, icon: Icon, children }: { title: string; icon: any; children: React.ReactNode }) {
  return (
    <div className="royal-card p-4">
      <h2 className="font-display text-base text-gold flex items-center gap-2 mb-3"><Icon size={16}/> {title}</h2>
      {children}
    </div>
  );
}

function Skeleton() {
  return <div className="h-40 animate-pulse rounded-lg bg-muted/30"/>;
}

function Empty({ msg }: { msg: string }) {
  return <p className="text-center text-sm text-muted-foreground py-8">{msg}</p>;
}
