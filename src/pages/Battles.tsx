import { useEffect, useMemo, useRef, useState } from "react";
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
  Swords, Crown, Search, Share2, Trophy, Sparkles, Clock, MapPin, Check, X, Loader2, Flame, Lock,
} from "lucide-react";
import * as LucideIcons from "lucide-react";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { CATEGORY_LABEL, CrownCategory, timeUntil, locationLabel } from "@/lib/crown";
import { useCountdown } from "@/hooks/useCountdown";
import { toast } from "sonner";
import ChallengeDialog from "@/components/battles/ChallengeDialog";
import AcceptBattleDialog from "@/components/battles/AcceptBattleDialog";
import ShareBattleDialog from "@/components/battles/ShareBattleDialog";
import TopBattlersWidget from "@/components/battles/TopBattlersWidget";
import WinnerReveal from "@/components/battles/WinnerReveal";
import { haptic } from "@/lib/haptics";
import { trackEvent } from "@/lib/analytics";
import { isSafeBattleForList } from "@/lib/battlesLogic";
import { invalidateOfficialResult } from "@/hooks/useOfficialBattleResult";
import { Play } from "lucide-react";
import { fetchMainCategories, fetchSubcategories, type MainCategory, type Subcategory } from "@/lib/categories";

interface Battle {
  id: string;
  challenger_id: string; opponent_id: string;
  challenger_post_id: string; opponent_post_id: string | null;
  challenger_votes: number; opponent_votes: number;
  status: string; ends_at: string | null; winner_id: string | null;
  created_at: string;
  challenger: { username: string; profile_photo_url: string | null } | null;
  opponent: { username: string; profile_photo_url: string | null } | null;
  challenger_post: { image_url: string; category: CrownCategory; city: string | null; state: string | null; country: string | null; main_category_slug: string | null; subcategory_slug: string | null } | null;
  opponent_post: { image_url: string; category: CrownCategory } | null;
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

export default function Battles() {
  useSeoMeta({
    title: "Battles · CrownMe",
    description:
      "Head-to-head crown battles. Challenge rivals, vote for the best, and watch who takes the throne.",
  });
  const { user } = useAuth();
  const nav = useNavigate();
  const [params, setParams] = useSearchParams();
  const [battles, setBattles] = useState<Battle[]>([]);
  const [loading, setLoading] = useState(true);
  const [myVotes, setMyVotes] = useState<Record<string, string>>({}); // battleId -> votedFor
  const [query, setQuery] = useState(params.get("q") || "");
  const [region, setRegion] = useState<string>(params.get("region") || "all");
  const [category, setCategory] = useState<string>(params.get("category") || "all");
  const [sort, setSort] = useState<string>(params.get("sort") || "hot");
  const [tab, setTab] = useState(params.get("tab") || "active");
  const [hub, setHub] = useState<string>(params.get("hub") || "all");
  const [topic, setTopic] = useState<string>(params.get("topic") || "all");
  const [mains, setMains] = useState<MainCategory[]>([]);
  const [subs, setSubs] = useState<Subcategory[]>([]);
  const [challengeOpen, setChallengeOpen] = useState(false);
  const [acceptBattle, setAcceptBattle] = useState<Battle | null>(null);
  const [shareBattle, setShareBattle] = useState<Battle | null>(null);
  const [burstMap, setBurstMap] = useState<Record<string, string>>({}); // battleId -> side voted
  const burstTimers = useRef<Record<string, any>>({});
  const [freshWins, setFreshWins] = useState<Set<string>>(new Set()); // battles that just completed in this session
  const prevStatusRef = useRef<Record<string, { status: string; winner: string | null }>>({});
  /** Prevents a rapid double-tap from optimistically incrementing twice before the insert resolves. */
  const inFlightVotes = useRef<Set<string>>(new Set());
  /** Battles currently submitting a vote — drives the spinner + disabled state on the vote button. */
  const [submittingVotes, setSubmittingVotes] = useState<Set<string>>(new Set());

  const load = async () => {
    setLoading(true);
    const { data } = await supabase.from("battles").select(`*,
      challenger:profiles!battles_challenger_id_fkey(username, profile_photo_url),
      opponent:profiles!battles_opponent_id_fkey(username, profile_photo_url),
      challenger_post:posts!battles_challenger_post_id_fkey(image_url, category, city, state, country, main_category_slug, subcategory_slug),
      opponent_post:posts!battles_opponent_post_id_fkey(image_url, category)
    `).order("created_at", { ascending: false }).limit(80);
    const arr = (data as any[]) || [];

    // Detect freshly-completed battles (compared to last snapshot)
    const newly = new Set(freshWins);
    arr.forEach((b: any) => {
      const prev = prevStatusRef.current[b.id];
      if (prev && prev.status !== "completed" && b.status === "completed" && b.winner_id) {
        newly.add(b.id);
      }
      prevStatusRef.current[b.id] = { status: b.status, winner: b.winner_id };
    });
    if (newly.size !== freshWins.size) setFreshWins(newly);

    setBattles(arr);
    setLoading(false);

    if (user) {
      const ids = arr.map((b: any) => b.id);
      if (ids.length) {
        const { data: votes } = await supabase.from("battle_votes")
          .select("battle_id, voted_for_user_id").eq("user_id", user.id).in("battle_id", ids);
        const map: Record<string, string> = {};
        (votes || []).forEach((v: any) => { map[v.battle_id] = v.voted_for_user_id; });
        setMyVotes(map);
      }
    }
  };

  useEffect(() => { load(); }, [user?.id]);
  useEffect(() => { fetchMainCategories().then(setMains); fetchSubcategories().then(setSubs); }, []);

  // Sync filters to URL (shareable deep links)
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

  // Realtime subscription on battles + battle_votes.
  // - battles UPDATE: surgical merge of payload.new into the existing row (no full reload),
  //   and detect a fresh status transition into "completed" so WinnerReveal fires confetti live.
  // - battles INSERT: prepend the new row (kept light — full hydration of related profiles/posts
  //   comes from a background load so the row is not stuck without media).
  // - battles DELETE: remove the row.
  // - battle_votes INSERT: merge +1 onto the relevant side, but ignore the voter's own event
  //   because vote() already applied the optimistic increment (avoids +2 double-count).
  useEffect(() => {
    const ch = supabase.channel("battles-live")
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "battles" }, (payload: any) => {
        const row = payload.new as Battle;
        setBattles((prev) => prev.map((b) => b.id === row.id ? { ...b, ...row } : b));
        const prev = prevStatusRef.current[row.id];
        if (prev && prev.status !== "completed" && row.status === "completed" && row.winner_id) {
          setFreshWins((s) => { const n = new Set(s); n.add(row.id); return n; });
        }
        prevStatusRef.current[row.id] = { status: row.status, winner: row.winner_id };
      })
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "battles" }, () => {
        // New battles need related profiles/posts joined — a single targeted reload is cheaper
        // and rarer than an UPDATE flood, and it avoids rendering a row with null relations.
        load();
      })
      .on("postgres_changes", { event: "DELETE", schema: "public", table: "battles" }, (payload: any) => {
        const id = (payload.old as { id?: string } | null)?.id;
        if (id) setBattles((prev) => prev.filter((b) => b.id !== id));
      })
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "battle_votes" }, (payload: any) => {
        // Skip the voter's own event — vote() already applied an optimistic increment.
        if (user && payload.new.user_id === user.id) return;
        setBattles((prev) => prev.map((b) => {
          if (b.id !== payload.new.battle_id) return b;
          const isC = payload.new.voted_for_user_id === b.challenger_id;
          return {
            ...b,
            challenger_votes: b.challenger_votes + (isC ? 1 : 0),
            opponent_votes: b.opponent_votes + (isC ? 0 : 1),
          };
        }));
      })
      .subscribe();
    return () => { supabase.removeChannel(ch); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

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

    // Guard against rapid double-tap / multi-tab race: drop subsequent calls
    // until this vote resolves. The server-side UNIQUE(battle_id, user_id) is
    // the source of truth — this is just to keep the UI from racing itself.
    if (inFlightVotes.current.has(b.id)) return;
    inFlightVotes.current.add(b.id);
    setSubmittingVotes((s) => { const n = new Set(s); n.add(b.id); return n; });
    void trackEvent("battle_vote_started", { metadata: { battle_id: b.id } });

    // optimistic + haptic confirm
    haptic("success");
    const isC = forUserId === b.challenger_id;
    setMyVotes((m) => ({ ...m, [b.id]: forUserId }));
    setBattles((prev) => prev.map((x) => x.id === b.id ? {
      ...x,
      challenger_votes: x.challenger_votes + (isC ? 1 : 0),
      opponent_votes: x.opponent_votes + (isC ? 0 : 1),
    } : x));
    triggerBurst(b.id, isC ? "L" : "R");

    // Idempotent insert: if a concurrent tab already wrote the same vote,
    // the unique-key conflict is silently ignored instead of surfacing as
    // a duplicate-key error. The optimistic UI stays in place.
    const { error } = await supabase
      .from("battle_votes")
      .upsert(
        { battle_id: b.id, user_id: user.id, voted_for_user_id: forUserId },
        { onConflict: "battle_id,user_id", ignoreDuplicates: true },
      );
    inFlightVotes.current.delete(b.id);
    setSubmittingVotes((s) => { const n = new Set(s); n.delete(b.id); return n; });

    if (error) {
      // True failure (network, RLS, etc.) — rollback optimistic state.
      haptic("error");
      setMyVotes((m) => { const { [b.id]: _, ...rest } = m; return rest; });
      setBattles((prev) => prev.map((x) => x.id === b.id ? {
        ...x,
        challenger_votes: x.challenger_votes - (isC ? 1 : 0),
        opponent_votes: x.opponent_votes - (isC ? 0 : 1),
      } : x));
      void trackEvent("battle_vote_failed", { metadata: { battle_id: b.id } });
      // Never surface raw SQL/RLS text to the user.
      toast.error("Couldn't record your vote. Tap to retry.", {
        action: { label: "Retry", onClick: () => void vote(b, forUserId) },
      });
    } else {
      void trackEvent("battle_vote_success", { metadata: { battle_id: b.id, side: isC ? "challenger" : "opponent" } });
      toast.success("Vote cast 👑");
    }
  };

  /** Replays the winner reveal animation (confetti + glow) for a completed battle. */
  const replayReveal = (battleId: string) => {
    haptic("medium");
    // Remove first so React unmounts WinnerReveal, then re-add to retrigger fresh=true effect.
    setFreshWins((s) => { const next = new Set(s); next.delete(battleId); return next; });
    setTimeout(() => {
      setFreshWins((s) => { const next = new Set(s); next.add(battleId); return next; });
    }, 60);
  };

  // Filtering + sorting
  const filteredAll = useMemo(() => {
    let arr = battles.slice();
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
    if (sort === "competitive") {
      arr.sort((a, b) => {
        const ta = a.challenger_votes + a.opponent_votes;
        const tb = b.challenger_votes + b.opponent_votes;
        const ma = Math.abs(a.challenger_votes - a.opponent_votes) / Math.max(ta, 1);
        const mb = Math.abs(b.challenger_votes - b.opponent_votes) / Math.max(tb, 1);
        // Smaller margin first, then more votes
        return ma - mb || tb - ta;
      });
    }
    if (region !== "all") {
      arr = arr.filter((b) => {
        const p = b.challenger_post;
        if (!p) return false;
        if (region === "global") return true;
        const f = (region === "city" ? p.city : region === "state" ? p.state : p.country);
        return !!f;
      });
    }
    if (sort === "hot") arr.sort((a, b) => (b.challenger_votes + b.opponent_votes) - (a.challenger_votes + a.opponent_votes));
    else if (sort === "newest") arr.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
    else if (sort === "ending") arr.sort((a, b) => (new Date(a.ends_at || 0).getTime() || Infinity) - (new Date(b.ends_at || 0).getTime() || Infinity));
    else if (sort === "votes") arr.sort((a, b) => (b.challenger_votes + b.opponent_votes) - (a.challenger_votes + a.opponent_votes));
    return arr;
  }, [battles, query, category, region, sort, user, hub, topic]);

  // A battle is "done" if it's marked completed OR its end time has passed
  // (covers the small window before the backend flips status).
  const now = Date.now();
  const isEnded = (b: Battle) =>
    b.status === "completed" || (!!b.ends_at && new Date(b.ends_at).getTime() <= now);
  const active = filteredAll.filter((b) => b.status === "active" && !isEnded(b));
  const pendingForMe = filteredAll.filter((b) => b.status === "pending" && b.opponent_id === user?.id);
  const mine = filteredAll.filter((b) => b.challenger_id === user?.id || b.opponent_id === user?.id);
  const done = filteredAll.filter(isEnded);

  const featured = active[0];

  // Deep link ?b=xxx → scroll/highlight
  useEffect(() => {
    const id = params.get("b");
    if (id && battles.some((b) => b.id === id)) {
      setTimeout(() => {
        document.getElementById(`battle-${id}`)?.scrollIntoView({ behavior: "smooth", block: "center" });
      }, 200);
    }
  }, [params, battles]);

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
            ? <img loading="lazy" src={post.image_url} alt="" className="w-full h-full object-cover transition-transform group-hover:scale-105" />
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

      // Wrap in tooltip when user already voted, to show which side they backed
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
        {/* Top meta strip */}
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
            {b.status === "completed" && b.winner_id && (
              <span className="inline-flex items-center gap-1 text-[10px] uppercase font-bold text-primary"><Trophy size={10} /> {margin}% margin</span>
            )}
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

          {/* WON / LOST / DRAW banner — only for ended battles */}
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


        {/* Vote bar */}
        <div className="h-1.5 bg-muted/40 flex">
          <div className="bg-gradient-gold transition-all duration-500" style={{ width: `${cPct}%` }} />
          <div className="bg-accent/70 transition-all duration-500" style={{ width: `${oPct}%` }} />
        </div>

        {/* Action row */}
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

          {/* Search & filters */}
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

            {/* Hub + Topic chips (Phase 4) */}
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

          {/* Featured */}
          {featured && tab === "active" && !query && (
            <div className="mb-5">
              <div className="flex items-center gap-2 mb-2">
                <Sparkles size={12} className="text-primary" />
                <h2 className="font-display text-[10px] uppercase tracking-[0.3em] text-muted-foreground">Featured Duel</h2>
              </div>
              <Card b={featured} live featured />
            </div>
          )}

          <Tabs value={tab} onValueChange={setTab}>
            <TabsList className="w-full grid grid-cols-4 h-9">
              <TabsTrigger value="active" className="text-xs">Active</TabsTrigger>
              <TabsTrigger value="pending" className="text-xs relative">
                Pending
                {pendingForMe.length > 0 && (
                  <span className="ml-1 inline-flex items-center justify-center min-w-[16px] h-4 px-1 rounded-full bg-destructive text-destructive-foreground text-[9px] font-bold">{pendingForMe.length}</span>
                )}
              </TabsTrigger>
              <TabsTrigger value="mine" className="text-xs">Mine</TabsTrigger>
              <TabsTrigger value="done" className="text-xs">Past</TabsTrigger>
            </TabsList>

            <TabsContent value="active" className="mt-3">
              <div className="space-y-3 lg:space-y-0 lg:grid lg:grid-cols-2 lg:gap-4">
                {loading ? Array.from({ length: 4 }).map((_, i) => <SkeletonCard key={i} />) :
                  (featured && !query ? active.slice(1) : active).map((b) => <Card key={b.id} b={b} live />)}
              </div>
              {!loading && !active.length && (
                <EmptyState title="No active duels" body="The arena is quiet. Be the first to throw down a challenge."
                  cta={<Button onClick={() => setChallengeOpen(true)} className="bg-gradient-gold text-primary-foreground gold-shadow"><Swords size={14} /> Start a battle</Button>} />
              )}
            </TabsContent>

            <TabsContent value="pending" className="mt-3">
              <div className="space-y-3 lg:space-y-0 lg:grid lg:grid-cols-2 lg:gap-4">
                {pendingForMe.map((b) => <Card key={b.id} b={b} live={false} />)}
              </div>
              {!pendingForMe.length && (
                <EmptyState title="No pending invites" body="When someone challenges you, you can accept and pick your weapon here." />
              )}
            </TabsContent>

            <TabsContent value="mine" className="mt-3">
              <div className="space-y-3 lg:space-y-0 lg:grid lg:grid-cols-2 lg:gap-4">
                {mine.map((b) => <Card key={b.id} b={b} live={b.status === "active"} />)}
              </div>
              {!mine.length && (
                <EmptyState title="You haven't fought yet" body="Throw down a challenge and start building your reign."
                  cta={<Button onClick={() => setChallengeOpen(true)} className="bg-gradient-gold text-primary-foreground gold-shadow"><Swords size={14} /> Challenge a royal</Button>} />
              )}
            </TabsContent>

            <TabsContent value="done" className="mt-3">
              <div className="space-y-3 lg:space-y-0 lg:grid lg:grid-cols-2 lg:gap-4">
                {done.map((b) => <Card key={b.id} b={b} live={false} />)}
              </div>
              {!done.length && (
                <EmptyState title="No completed battles yet" body="Crown wins will appear here once duels end." />
              )}
            </TabsContent>
          </Tabs>
        </div>

        {/* Right rail (desktop) */}
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

      <ChallengeDialog open={challengeOpen} onOpenChange={setChallengeOpen} onCreated={load} />
      <AcceptBattleDialog
        open={!!acceptBattle}
        onOpenChange={(o) => !o && setAcceptBattle(null)}
        battle={acceptBattle ? {
          id: acceptBattle.id,
          challenger_post: acceptBattle.challenger_post as any,
          challenger: acceptBattle.challenger,
        } : null}
        onResolved={load}
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
