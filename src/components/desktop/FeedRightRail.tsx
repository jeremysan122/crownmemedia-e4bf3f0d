import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Crown, Swords, Gift, UserPlus, Store } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { formatScore, locationLabel } from "@/lib/crown";
import { useAuth } from "@/context/AuthContext";
import RoyalShieldBalanceCard from "@/components/store/RoyalShieldBalanceCard";


type CrownHolder = { region_name: string; region_type: string; profile: { username: string; profile_photo_url: string | null } | null };
type TopUser = { id: string; username: string; profile_photo_url: string | null; crown_score: number; city: string | null; state: string | null; country: string | null; crowns_held: number };
type Battle = { id: string; challenger: { username: string } | null; opponent: { username: string } | null; challenger_votes: number; opponent_votes: number };
type Suggestion = { id: string; username: string; profile_photo_url: string | null; crowns_held: number };
type Gifter = { user_id: string; total: number; profile: { username: string; profile_photo_url: string | null } | null };

function Card({ title, icon: Icon, children, action }: { title: string; icon: typeof Crown; children: React.ReactNode; action?: React.ReactNode }) {
  return (
    <section className="royal-card p-4">
      <header className="flex items-center justify-between mb-3">
        <h3 className="font-display text-sm tracking-widest text-gold flex items-center gap-2">
          <Icon size={14} /> {title}
        </h3>
        {action}
      </header>
      {children}
    </section>
  );
}

function Row({ to, avatar, primary, secondary, trailing }: { to: string; avatar?: string | null; primary: string; secondary?: string; trailing?: React.ReactNode }) {
  return (
    <Link to={to} className="flex items-center gap-2.5 py-1.5 hover:bg-secondary/20 rounded-lg px-1 -mx-1 transition">
      <div className="size-8 rounded-full bg-muted overflow-hidden ring-1 ring-border shrink-0">
        {avatar ? <img loading="lazy" src={avatar} alt="" className="w-full h-full object-cover" /> : <div className="w-full h-full flex items-center justify-center text-[10px] font-bold text-muted-foreground">{primary[1]?.toUpperCase()}</div>}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold truncate">{primary}</p>
        {secondary && <p className="text-[11px] text-muted-foreground truncate">{secondary}</p>}
      </div>
      {trailing}
    </Link>
  );
}

export default function FeedRightRail() {
  const { user, profile } = useAuth();
  const [holders, setHolders] = useState<CrownHolder[]>([]);
  const [top, setTop] = useState<TopUser[]>([]);
  const [battles, setBattles] = useState<Battle[]>([]);
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [gifters, setGifters] = useState<Gifter[]>([]);
  const [following, setFollowing] = useState<Set<string>>(new Set());

  // Initial load of who I'm following so we can hide them from suggestions.
  useEffect(() => {
    if (!user?.id) { setFollowing(new Set()); return; }
    (async () => {
      const { data } = await supabase.from("follows").select("following_id").eq("follower_id", user.id);
      setFollowing(new Set(((data as any[]) || []).map((r) => r.following_id)));
    })();
    const ch = supabase
      .channel(`rail-follows-${user.id}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "follows", filter: `follower_id=eq.${user.id}` }, (payload) => {
        if (payload.eventType === "INSERT") {
          const n: any = payload.new;
          setFollowing((s) => new Set(s).add(n.following_id));
        } else if (payload.eventType === "DELETE") {
          const o: any = payload.old;
          setFollowing((s) => { const n = new Set(s); n.delete(o.following_id); return n; });
        }
      })
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [user?.id]);

  const toggleFollow = async (id: string) => {
    if (!user) return;
    if (following.has(id)) {
      setFollowing((s) => { const n = new Set(s); n.delete(id); return n; });
      await supabase.from("follows").delete().eq("follower_id", user.id).eq("following_id", id);
    } else {
      setFollowing((s) => new Set(s).add(id));
      await supabase.from("follows").insert({ follower_id: user.id, following_id: id });
    }
  };

  useEffect(() => {
    (async () => {
      const [h, t, b, s, g] = await Promise.all([
        supabase.from("crowns").select("region_name, region_type, profile:profiles!crowns_user_id_fkey(username, profile_photo_url)").eq("active", true).eq("category", "overall").order("crown_score", { ascending: false }).limit(5),
        supabase.from("posts").select("id, user_id, crown_score, city, state, country, profile:profiles!posts_user_id_fkey(username, profile_photo_url, crowns_held)").eq("is_removed", false).order("crown_score", { ascending: false }).limit(10),
        supabase.from("battles").select("id, challenger_votes, opponent_votes, challenger:profiles!battles_challenger_id_fkey(username), opponent:profiles!battles_opponent_id_fkey(username)").eq("status", "active").order("created_at", { ascending: false }).limit(4),
        supabase.from("profiles").select("id, username, profile_photo_url, crowns_held").eq("is_suspended", false).neq("id", user?.id || "00000000-0000-0000-0000-000000000000").order("votes_received", { ascending: false }).limit(20),
        supabase.from("gift_transactions_public" as any).select("receiver_id, total_shekels, profile:profiles!gift_transactions_receiver_id_fkey(username, profile_photo_url)").gte("created_at", new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()).limit(50),
      ]);
      setHolders((h.data as any) || []);
      const topRows: TopUser[] = ((t.data as any[]) || []).map((r) => ({
        id: r.user_id,
        username: r.profile?.username ?? "—",
        profile_photo_url: r.profile?.profile_photo_url ?? null,
        crown_score: r.crown_score,
        city: r.city, state: r.state, country: r.country,
        crowns_held: r.profile?.crowns_held ?? 0,
      }));
      setTop(topRows);
      setBattles((b.data as any) || []);
      setSuggestions((s.data as any) || []);

      // aggregate top gifters last 24h
      const agg = new Map<string, Gifter>();
      ((g.data as any[]) || []).forEach((r) => {
        const cur = agg.get(r.receiver_id) || { user_id: r.receiver_id, total: 0, profile: r.profile };
        cur.total += Number(r.total_shekels) || 0;
        agg.set(r.receiver_id, cur);
      });
      setGifters([...agg.values()].sort((a, b) => b.total - a.total).slice(0, 5));
    })();
  }, [user?.id]);

  return (
    <aside className="hidden xl:flex sticky top-[84px] h-[calc(100vh-100px)] w-[320px] shrink-0 flex-col gap-4 overflow-y-auto pl-2 pb-6 scrollbar-none">

      <Card title="Current Crown Holders" icon={Crown} action={<Link to="/map" className="text-[11px] text-primary hover:underline">Map</Link>}>
        <div className="space-y-0.5">
          {holders.length === 0 && <p className="text-xs text-muted-foreground">No crowns claimed yet.</p>}
          {holders.map((h, i) => (
            <Row
              key={`${h.region_name}-${i}`}
              to={`/leaderboard?scope=${h.region_type}&region=${encodeURIComponent(h.region_name)}`}
              avatar={h.profile?.profile_photo_url ?? null}
              primary={`@${h.profile?.username ?? "vacant"}`}
              secondary={`${h.region_type} · ${h.region_name}`}
              trailing={<Crown size={12} className="text-primary" fill="currentColor" />}
            />
          ))}
        </div>
      </Card>

      <Card title="Top 10 Global" icon={Crown} action={<Link to="/leaderboard?scope=global" className="text-[11px] text-primary hover:underline">View</Link>}>
        <div className="space-y-0.5">
          {top.map((t, i) => (
            <Row
              key={t.id + i}
              to={`/${t.username}`}
              avatar={t.profile_photo_url}
              primary={`#${i + 1}  @${t.username}`}
              secondary={locationLabel(t)}
              trailing={<span className="text-xs font-bold tabular-nums text-gold">{formatScore(t.crown_score)}</span>}
            />
          ))}
          {top.length === 0 && <p className="text-xs text-muted-foreground">No contenders yet.</p>}
        </div>
      </Card>

      <Card title="Active Battles" icon={Swords} action={<Link to="/battles" className="text-[11px] text-primary hover:underline">All</Link>}>
        <div className="space-y-2">
          {battles.map((b) => (
            <Link key={b.id} to="/battles" className="block p-2 rounded-lg bg-muted/30 hover:bg-muted/50 transition">
              <div className="flex items-center justify-between text-xs font-semibold">
                <span className="truncate">@{b.challenger?.username}</span>
                <span className="text-muted-foreground mx-2">vs</span>
                <span className="truncate">@{b.opponent?.username}</span>
              </div>
              <div className="mt-1.5 h-1 rounded-full bg-secondary overflow-hidden">
                <div className="h-full bg-gradient-gold" style={{ width: `${(b.challenger_votes / Math.max(1, b.challenger_votes + b.opponent_votes)) * 100}%` }} />
              </div>
            </Link>
          ))}
          {battles.length === 0 && <p className="text-xs text-muted-foreground">No live battles.</p>}
        </div>
      </Card>

      <Card title="Top Gifters Today" icon={Gift}>
        <div className="space-y-0.5">
          {gifters.map((g) => (
            <Row
              key={g.user_id}
              to={`/${g.profile?.username}`}
              avatar={g.profile?.profile_photo_url ?? null}
              primary={`@${g.profile?.username}`}
              secondary="received gifts"
              trailing={<span className="text-xs font-bold tabular-nums text-gold">₪{formatScore(g.total)}</span>}
            />
          ))}
          {gifters.length === 0 && <p className="text-xs text-muted-foreground">No gifts in the last 24h.</p>}
        </div>
      </Card>

      <Card title="Suggested Royals" icon={UserPlus}>
        <div className="space-y-0.5">
          {suggestions.filter((s) => !following.has(s.id)).slice(0, 5).map((s) => (
            <Row
              key={s.id}
              to={`/${s.username}`}
              avatar={s.profile_photo_url}
              primary={`@${s.username}`}
              secondary={s.crowns_held > 0 ? `${s.crowns_held} crowns` : "Rising royal"}
              trailing={
                <button
                  onClick={(e) => { e.preventDefault(); e.stopPropagation(); toggleFollow(s.id); }}
                  className={`text-[11px] font-semibold px-2 py-0.5 rounded-full transition ${following.has(s.id) ? "bg-secondary text-foreground" : "bg-primary/10 text-primary hover:bg-primary/20"}`}
                >
                  {following.has(s.id) ? "Following" : "Follow"}
                </button>
              }
            />
          ))}
          {suggestions.filter((s) => !following.has(s.id)).length === 0 && (
            <p className="text-xs text-muted-foreground">You're following every rising royal.</p>
          )}
        </div>
      </Card>

      <Card title="Royal Store" icon={Store} action={<Link to="/store" className="text-[11px] text-primary hover:underline">Visit</Link>}>
        <p className="text-xs text-muted-foreground mb-2">Boost your reign with Royal Boosts and Crown Shields.</p>
        <Link to="/store" className="block text-center w-full py-2 rounded-xl bg-gradient-gold text-primary-foreground text-xs font-bold tracking-wider">Open Store</Link>
      </Card>
    </aside>
  );
}
