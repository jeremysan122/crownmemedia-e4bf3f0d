import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import AppShell from "@/components/AppShell";
import { useSeoMeta } from "@/hooks/useSeoMeta";
import { useAuth } from "@/context/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { useIsRoyalPassUser } from "@/hooks/useIsRoyalPassUser";
import { Crown, TrendingUp, Users, MapPin, Coins, BarChart3, Lock, Heart, MessageCircle, Share2, Eye, Tag, Download } from "lucide-react";
import { toast } from "sonner";
import {
  ResponsiveContainer, LineChart, Line, XAxis, YAxis, Tooltip, CartesianGrid,
  BarChart, Bar, PieChart, Pie, Cell, Area, ComposedChart,
} from "recharts";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

type ReachPoint = { date: string; followers: number; gained: number; visits: number };
type PostRow = { id: string; caption: string | null; category: string | null; created_at: string; vote_count: number; comment_count: number; share_count: number; crown_score: number };
type PostRate = PostRow & { ageDays: number; votesPerDay: number; commentsPerDay: number; sharesPerDay: number };
type Bucket = { name: string; value: number };
type CategoryRow = { name: string; votes: number; comments: number; shares: number };

const ACCENT = "hsl(var(--primary))";
const SOFT = "hsl(var(--muted-foreground))";
const PIE_COLORS = ["hsl(var(--primary))", "#c9a84c", "#8b6f5e", "#5cbdb9", "#e85d3a", "#a78bfa", "#67e8f9"];

const fmtDate = (iso: string) => {
  const d = new Date(iso);
  return `${d.getMonth() + 1}/${d.getDate()}`;
};

function bucketize(rows: { created_at: string }[], days: number, granularity: "day" | "week") {
  const step = granularity === "week" ? 7 : 1;
  const buckets = new Map<string, number>();
  const start = new Date(Date.now() - days * 86400000);
  start.setHours(0, 0, 0, 0);
  for (let offset = 0; offset <= days; offset += step) {
    const d = new Date(start.getTime() + offset * 86400000);
    buckets.set(d.toISOString().slice(0, 10), 0);
  }
  rows.forEach((r) => {
    const t = new Date(r.created_at).getTime();
    const offset = Math.floor((t - start.getTime()) / 86400000);
    if (offset < 0) return;
    const bucketOffset = Math.floor(offset / step) * step;
    const key = new Date(start.getTime() + bucketOffset * 86400000).toISOString().slice(0, 10);
    if (buckets.has(key)) buckets.set(key, (buckets.get(key) || 0) + 1);
  });
  return buckets;
}

export default function Insights() {
  useSeoMeta({ title: "Insights · CrownMe", noIndex: true });
  const { user } = useAuth();
  const isRoyalPass = useIsRoyalPassUser(user?.id);
  const [verified, setVerified] = useState<boolean | null>(null);
  const [username, setUsername] = useState("");
  const [loading, setLoading] = useState(true);
  const [range, setRange] = useState<7 | 30 | 90>(30);
  const [granularity, setGranularity] = useState<"day" | "week">("day");
  const [exporting, setExporting] = useState(false);

  const [reachSeries, setReachSeries] = useState<ReachPoint[]>([]);
  const [posts, setPosts] = useState<PostRow[]>([]);
  const [categoryRows, setCategoryRows] = useState<CategoryRow[]>([]);
  const [cities, setCities] = useState<Bucket[]>([]);
  const [countries, setCountries] = useState<Bucket[]>([]);
  const [giftsTotal, setGiftsTotal] = useState(0);
  const [giftBreakdown, setGiftBreakdown] = useState<Bucket[]>([]);
  const [royalPassEarnings, setRoyalPassEarnings] = useState(0);
  const [totals, setTotals] = useState({ followers: 0, totalVotes: 0, totalComments: 0, totalShares: 0, totalVisits: 0 });

  useEffect(() => {
    if (!user) return;
    supabase.from("profiles").select("verified, followers_count, username").eq("id", user.id).maybeSingle().then(({ data }) => {
      setVerified(!!data?.verified);
      setUsername(data?.username ?? "");
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

      const [followsRes, visitsRes, postsRes, audienceRes, giftsRes, earningsRes] = await Promise.all([
        supabase.from("follows").select("created_at").eq("following_id", user.id).gte("created_at", since).order("created_at"),
        supabase.from("profile_visits").select("created_at").eq("profile_id", user.id).gte("created_at", since).order("created_at"),
        supabase.from("posts").select("id, caption, category, created_at, vote_count, comment_count, share_count, crown_score").eq("user_id", user.id).eq("is_removed", false).order("crown_score", { ascending: false }).limit(200),
        supabase.from("follows").select("follower_id, profiles!follows_follower_id_fkey(city, country)").eq("following_id", user.id).limit(1000),
        supabase.from("gift_transactions").select("gift_name, receiver_earnings_shekels, created_at").eq("receiver_id", user.id).gte("created_at", since),
        supabase.from("shekel_ledger").select("shekels_delta").eq("user_id", user.id).eq("kind", "royal_pass_bonus").gte("created_at", since),
      ]);

      if (cancelled) return;

      const followBuckets = bucketize(followsRes.data || [], range, granularity);
      const visitBuckets = bucketize(visitsRes.data || [], range, granularity);
      let running = Math.max(0, (totals.followers || 0) - (followsRes.data?.length || 0));
      const series: ReachPoint[] = [];
      for (const [date, gained] of followBuckets) {
        running += gained;
        series.push({ date, followers: running, gained, visits: visitBuckets.get(date) || 0 });
      }
      setReachSeries(series);

      const postsList = (postsRes.data || []) as PostRow[];
      setPosts(postsList);

      // Category aggregation
      const catMap = new Map<string, CategoryRow>();
      postsList.forEach((p) => {
        const key = p.category || "uncategorized";
        const r = catMap.get(key) || { name: key, votes: 0, comments: 0, shares: 0 };
        r.votes += p.vote_count || 0;
        r.comments += p.comment_count || 0;
        r.shares += p.share_count || 0;
        catMap.set(key, r);
      });
      setCategoryRows([...catMap.values()].sort((a, b) => (b.votes + b.comments + b.shares) - (a.votes + a.comments + a.shares)).slice(0, 8));

      setTotals((t) => ({
        ...t,
        totalVotes: postsList.reduce((s, p) => s + (p.vote_count || 0), 0),
        totalComments: postsList.reduce((s, p) => s + (p.comment_count || 0), 0),
        totalShares: postsList.reduce((s, p) => s + (p.share_count || 0), 0),
        totalVisits: (visitsRes.data || []).length,
      }));

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
  }, [user?.id, hasAccess, range, granularity, totals.followers]);

  const followerGain = useMemo(() => reachSeries.reduce((s, p) => s + p.gained, 0), [reachSeries]);
  const visitsGain = useMemo(() => reachSeries.reduce((s, p) => s + p.visits, 0), [reachSeries]);

  // Per-day normalized post rates
  const postRates: PostRate[] = useMemo(() => {
    return posts.map((p) => {
      const ageDays = Math.max(1, (Date.now() - new Date(p.created_at).getTime()) / 86400000);
      return {
        ...p,
        ageDays,
        votesPerDay: (p.vote_count || 0) / ageDays,
        commentsPerDay: (p.comment_count || 0) / ageDays,
        sharesPerDay: (p.share_count || 0) / ageDays,
      };
    }).sort((a, b) => b.votesPerDay - a.votesPerDay);
  }, [posts]);

  const exportPdf = () => {
    try {
      setExporting(true);
      const doc = new jsPDF({ unit: "pt", format: "letter" });
      const W = doc.internal.pageSize.getWidth();
      let y = 56;

      doc.setFont("helvetica", "bold");
      doc.setFontSize(20);
      doc.setTextColor(201, 168, 76);
      doc.text("CrownMe — Insights Report", 56, y);
      y += 22;

      doc.setFont("helvetica", "normal");
      doc.setFontSize(10);
      doc.setTextColor(80);
      doc.text(`@${username || "you"}  ·  Last ${range} days  ·  Generated ${new Date().toLocaleString()}`, 56, y);
      y += 20;

      // KPIs
      doc.setDrawColor(220);
      doc.line(56, y, W - 56, y);
      y += 18;
      doc.setFont("helvetica", "bold");
      doc.setFontSize(12);
      doc.setTextColor(30);
      doc.text("Summary", 56, y);
      y += 14;
      autoTable(doc, {
        startY: y,
        head: [["Metric", "Value"]],
        body: [
          ["Followers", totals.followers.toLocaleString()],
          [`Followers gained (${range}d)`, `+${followerGain.toLocaleString()}`],
          [`Profile visits (${range}d)`, visitsGain.toLocaleString()],
          ["Votes received", totals.totalVotes.toLocaleString()],
          ["Comments received", totals.totalComments.toLocaleString()],
          ["Shares received", totals.totalShares.toLocaleString()],
          ["Gift earnings (Shekels)", Math.round(giftsTotal).toLocaleString()],
          ["Royal Pass bonus (Shekels)", Math.round(royalPassEarnings).toLocaleString()],
        ],
        theme: "grid",
        headStyles: { fillColor: [201, 168, 76], textColor: 255 },
        styles: { fontSize: 10 },
        margin: { left: 56, right: 56 },
      });
      y = (doc as any).lastAutoTable.finalY + 24;

      // Reach series
      doc.setFont("helvetica", "bold"); doc.text("Reach & visits over time", 56, y); y += 8;
      autoTable(doc, {
        startY: y + 4,
        head: [["Date", "Followers", "Gained", "Visits"]],
        body: reachSeries.map((r) => [r.date, r.followers, r.gained, r.visits]),
        theme: "striped",
        styles: { fontSize: 9 },
        headStyles: { fillColor: [40, 40, 40], textColor: 255 },
        margin: { left: 56, right: 56 },
      });
      y = (doc as any).lastAutoTable.finalY + 20;

      // Top posts by per-day rate
      if (y > 680) { doc.addPage(); y = 56; }
      doc.setFont("helvetica", "bold"); doc.text("Top posts (normalized per day)", 56, y); y += 8;
      autoTable(doc, {
        startY: y + 4,
        head: [["Post", "Age (d)", "Votes/d", "Comments/d", "Shares/d", "Crown"]],
        body: postRates.slice(0, 15).map((p) => [
          (p.caption || "Untitled").slice(0, 40),
          p.ageDays.toFixed(1),
          p.votesPerDay.toFixed(2),
          p.commentsPerDay.toFixed(2),
          p.sharesPerDay.toFixed(2),
          Math.round(p.crown_score),
        ]),
        theme: "striped",
        styles: { fontSize: 9 },
        headStyles: { fillColor: [40, 40, 40], textColor: 255 },
        margin: { left: 56, right: 56 },
      });
      y = (doc as any).lastAutoTable.finalY + 20;

      // Category breakdown
      if (y > 680) { doc.addPage(); y = 56; }
      doc.setFont("helvetica", "bold"); doc.text("Category performance", 56, y); y += 8;
      autoTable(doc, {
        startY: y + 4,
        head: [["Category", "Votes", "Comments", "Shares"]],
        body: categoryRows.map((c) => [c.name, c.votes, c.comments, c.shares]),
        theme: "striped",
        styles: { fontSize: 10 },
        headStyles: { fillColor: [40, 40, 40], textColor: 255 },
        margin: { left: 56, right: 56 },
      });
      y = (doc as any).lastAutoTable.finalY + 20;

      // Audience
      if (y > 620) { doc.addPage(); y = 56; }
      doc.setFont("helvetica", "bold"); doc.text("Audience — top cities", 56, y); y += 8;
      autoTable(doc, {
        startY: y + 4,
        head: [["City", "Followers"]],
        body: cities.map((c) => [c.name, c.value]),
        theme: "striped", styles: { fontSize: 10 },
        headStyles: { fillColor: [40, 40, 40], textColor: 255 },
        margin: { left: 56, right: 56 },
      });

      doc.save(`crownme-insights-${username || "me"}-${range}d.pdf`);
      toast.success("Insights exported");
    } catch (e: any) {
      console.error(e);
      toast.error("Export failed");
    } finally {
      setExporting(false);
    }
  };

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
        <div className="flex items-start justify-between gap-2 flex-wrap">
          <div>
            <h1 className="font-display text-xl text-gold flex items-center gap-2"><BarChart3 size={20}/> Creator Insights</h1>
            <p className="text-xs text-muted-foreground">Track your royal court's growth and earnings.</p>
          </div>
          <div className="flex gap-2 items-center">
            <button
              onClick={exportPdf}
              disabled={exporting || loading}
              className="px-3 py-1.5 rounded-lg bg-gradient-to-r from-primary to-amber-500 text-primary-foreground text-xs font-bold flex items-center gap-1.5 disabled:opacity-50"
            >
              <Download size={12}/> {exporting ? "Exporting…" : "Export PDF"}
            </button>
            <div className="flex gap-1 bg-muted/40 p-1 rounded-lg text-xs font-bold">
              {[7, 30, 90].map((n) => (
                <button key={n} onClick={() => setRange(n as 7|30|90)}
                  className={`px-3 py-1 rounded ${range === n ? "bg-primary text-primary-foreground" : "text-muted-foreground"}`}>
                  {n}d
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* KPI tiles */}
        <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
          <Kpi icon={Users} label="Followers" value={totals.followers.toLocaleString()} delta={followerGain > 0 ? `+${followerGain}` : null} />
          <Kpi icon={Eye} label="Profile visits" value={visitsGain.toLocaleString()} />
          <Kpi icon={Heart} label="Votes" value={totals.totalVotes.toLocaleString()} />
          <Kpi icon={MessageCircle} label="Comments" value={totals.totalComments.toLocaleString()} />
          <Kpi icon={Coins} label="Shekels" value={Math.round(giftsTotal + royalPassEarnings).toLocaleString()} />
        </div>

        {/* Reach & Visits */}
        <Card
          title="Profile reach & visits"
          icon={TrendingUp}
          right={
            <div className="flex gap-1 bg-muted/40 p-0.5 rounded text-[10px] font-bold">
              {(["day","week"] as const).map((g) => (
                <button key={g} onClick={() => setGranularity(g)}
                  className={`px-2 py-0.5 rounded ${granularity === g ? "bg-primary text-primary-foreground" : "text-muted-foreground"}`}>
                  {g === "day" ? "Daily" : "Weekly"}
                </button>
              ))}
            </div>
          }
        >
          {loading ? <Skeleton /> : (
            <div className="h-64">
              <ResponsiveContainer>
                <ComposedChart data={reachSeries} margin={{ top: 5, right: 8, bottom: 0, left: -16 }}>
                  <defs>
                    <linearGradient id="visitsFill" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor={ACCENT} stopOpacity={0.4}/>
                      <stop offset="100%" stopColor={ACCENT} stopOpacity={0}/>
                    </linearGradient>
                  </defs>
                  <CartesianGrid stroke="hsl(var(--border))" strokeDasharray="3 3" vertical={false}/>
                  <XAxis dataKey="date" tickFormatter={fmtDate} stroke={SOFT} fontSize={10}/>
                  <YAxis yAxisId="left" stroke={SOFT} fontSize={10}/>
                  <YAxis yAxisId="right" orientation="right" stroke={SOFT} fontSize={10}/>
                  <Tooltip contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", fontSize: 12 }}/>
                  <Area yAxisId="right" type="monotone" dataKey="visits" stroke={ACCENT} fill="url(#visitsFill)" name="Visits"/>
                  <Line yAxisId="left" type="monotone" dataKey="followers" stroke="#c9a84c" strokeWidth={2} dot={false} name="Followers"/>
                </ComposedChart>
              </ResponsiveContainer>
            </div>
          )}
          <p className="text-[10px] text-muted-foreground mt-2">
            Gold line = total followers · Filled area = profile visits ({granularity === "day" ? "per day" : "per week"})
          </p>
        </Card>

        {/* Per-post performance rates */}
        <Card title="Post performance (per day)" icon={Crown}>
          {loading ? <Skeleton /> : postRates.length === 0 ? <Empty msg="No posts yet"/> : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead className="text-[10px] uppercase tracking-wider text-muted-foreground border-b border-border">
                  <tr>
                    <th className="text-left py-2 pl-1">#</th>
                    <th className="text-left">Post</th>
                    <th className="text-right">Age</th>
                    <th className="text-right">Votes/d</th>
                    <th className="text-right">Comments/d</th>
                    <th className="text-right">Shares/d</th>
                    <th className="text-right pr-1">Crown</th>
                  </tr>
                </thead>
                <tbody>
                  {postRates.slice(0, 10).map((p, idx) => (
                    <tr key={p.id} className="border-b border-border/40 hover:bg-muted/30">
                      <td className="py-2 pl-1 text-gold font-display">{idx + 1}</td>
                      <td className="max-w-[200px] truncate">
                        <Link to={`/post/${p.id}`} className="hover:text-primary">
                          {p.caption || "Untitled"}
                        </Link>
                      </td>
                      <td className="text-right text-muted-foreground">{p.ageDays.toFixed(1)}d</td>
                      <td className="text-right font-semibold">{p.votesPerDay.toFixed(2)}</td>
                      <td className="text-right">{p.commentsPerDay.toFixed(2)}</td>
                      <td className="text-right">{p.sharesPerDay.toFixed(2)}</td>
                      <td className="text-right pr-1 text-gold font-display">{Math.round(p.crown_score)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>

        {/* Category performance */}
        <Card title="Crown category performance" icon={Tag}>
          {loading ? <Skeleton /> : categoryRows.length === 0 ? <Empty msg="Post something to see breakdown"/> : (
            <div className="h-64">
              <ResponsiveContainer>
                <BarChart data={categoryRows} margin={{ left: -16, right: 8 }}>
                  <CartesianGrid stroke="hsl(var(--border))" strokeDasharray="3 3" vertical={false}/>
                  <XAxis dataKey="name" stroke={SOFT} fontSize={10}/>
                  <YAxis stroke={SOFT} fontSize={10}/>
                  <Tooltip contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", fontSize: 12 }}/>
                  <Bar dataKey="votes" stackId="a" fill="hsl(var(--primary))" name="Votes"/>
                  <Bar dataKey="comments" stackId="a" fill="#c9a84c" name="Comments"/>
                  <Bar dataKey="shares" stackId="a" fill="#5cbdb9" name="Shares" radius={[4,4,0,0]}/>
                </BarChart>
              </ResponsiveContainer>
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

function Card({ title, icon: Icon, children, right }: { title: string; icon: any; children: React.ReactNode; right?: React.ReactNode }) {
  return (
    <div className="royal-card p-4">
      <div className="flex items-center justify-between mb-3">
        <h2 className="font-display text-base text-gold flex items-center gap-2"><Icon size={16}/> {title}</h2>
        {right}
      </div>
      {children}
    </div>
  );
}

function Skeleton() { return <div className="h-40 animate-pulse rounded-lg bg-muted/30"/>; }
function Empty({ msg }: { msg: string }) { return <p className="text-center text-sm text-muted-foreground py-8">{msg}</p>; }
