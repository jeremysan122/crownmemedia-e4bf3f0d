// Battle detail page (/battles/:id).
//
// Scope of this file: present a single battle and, when it is ENDED,
// surface the authoritative server result via the same
// `get_battle_official_result` RPC + <OfficialResultBadge /> states used
// on the Crown Battles list. This guarantees the detail page and the
// list page can never disagree about who won (or whether it was a tie /
// no-result), because both go through the same pure component.
//
// Safety: this page applies `isSafeBattleForList` defence-in-depth on
// the loaded row and refuses to render battles that are removed,
// hidden, declined, cancelled, or involve a user the viewer has
// blocked. Server RLS is still the source of truth.

import { useEffect, useMemo, useState } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import AppShell from "@/components/AppShell";
import { useSeoMeta } from "@/hooks/useSeoMeta";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/context/AuthContext";
import { Crown, MapPin, ArrowLeft, Flame, Loader2, Clock } from "lucide-react";
import { CATEGORY_LABEL, type CrownCategory, locationLabel, timeUntil } from "@/lib/crown";
import { useCountdown } from "@/hooks/useCountdown";
import { OfficialResultBadge } from "@/components/battles/OfficialResultBadge";
import { deriveBattleStatus, isSafeBattleForList, type BattleLike } from "@/lib/battlesLogic";
import { invalidateOfficialResult } from "@/hooks/useOfficialBattleResult";
import { trackEvent } from "@/lib/analytics";

interface BattleRow extends BattleLike {
  challenger: { username: string; profile_photo_url: string | null } | null;
  opponent: { username: string; profile_photo_url: string | null } | null;
  challenger_post: {
    image_url: string; category: CrownCategory;
    city: string | null; state: string | null; country: string | null;
  } | null;
  opponent_post: { image_url: string; category: CrownCategory } | null;
}

function CountdownPill({ endsAt }: { endsAt: string }) {
  const remaining = useCountdown(new Date(endsAt).getTime());
  if (remaining <= 0) return <span className="text-[10px] uppercase font-bold text-muted-foreground">Ended</span>;
  const urgent = remaining < 3600;
  return (
    <span
      className={`inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider ${
        urgent ? "text-destructive animate-pulse" : "text-primary"
      }`}
    >
      <Clock size={10} /> {timeUntil(endsAt)}
    </span>
  );
}

export default function BattleDetail() {
  const { id } = useParams<{ id: string }>();
  const nav = useNavigate();
  const { user } = useAuth();
  const [battle, setBattle] = useState<BattleRow | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [blockedIds, setBlockedIds] = useState<Set<string>>(new Set());

  useSeoMeta({
    title: battle
      ? `${battle.challenger?.username ?? "—"} vs ${battle.opponent?.username ?? "—"} · CrownMe`
      : "Battle · CrownMe",
    description: "Crown battle on CrownMe — vote and see the official result.",
  });

  useEffect(() => {
    if (!user) { setBlockedIds(new Set()); return; }
    (async () => {
      const { data } = await supabase.from("blocks").select("blocked_id").eq("blocker_id", user.id);
      setBlockedIds(new Set(((data as any[]) || []).map((r) => r.blocked_id)));
    })();
  }, [user?.id]);

  useEffect(() => {
    let cancelled = false;
    if (!id) return;
    setLoading(true);
    setNotFound(false);
    (async () => {
      const { data, error } = await supabase
        .from("battles")
        .select(
          `*,
          challenger:profiles!battles_challenger_id_fkey(username, profile_photo_url),
          opponent:profiles!battles_opponent_id_fkey(username, profile_photo_url),
          challenger_post:posts!battles_challenger_post_id_fkey(image_url, category, city, state, country),
          opponent_post:posts!battles_opponent_post_id_fkey(image_url, category)`
        )
        .eq("id", id)
        .maybeSingle();
      if (cancelled) return;
      if (error || !data || !isSafeBattleForList(data as any, { blockedIds })) {
        setBattle(null);
        setNotFound(true);
      } else {
        setBattle(data as any);
        // Refresh the authoritative result if we're landing on an ended battle.
        if (deriveBattleStatus(data as any) === "ended") invalidateOfficialResult((data as any).id);
        void trackEvent("battle_detail_view", { metadata: { battle_id: (data as any).id } });
      }
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [id, blockedIds]);

  const status = useMemo(() => (battle ? deriveBattleStatus(battle) : null), [battle]);
  const totalVotes = battle ? battle.challenger_votes + battle.opponent_votes : 0;
  const cPct = battle && totalVotes > 0 ? (battle.challenger_votes / totalVotes) * 100 : 50;
  const oPct = 100 - cPct;

  return (
    <AppShell>
      <div className="max-w-2xl mx-auto px-3 sm:px-4 py-4">
        <button
          onClick={() => (window.history.length > 1 ? nav(-1) : nav("/battles"))}
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground mb-3"
        >
          <ArrowLeft size={14} /> Back
        </button>

        {loading && (
          <div className="royal-card p-10 text-center">
            <Loader2 className="mx-auto animate-spin text-muted-foreground" />
          </div>
        )}

        {!loading && notFound && (
          <div className="royal-card p-8 text-center animate-fade-in">
            <h2 className="font-display text-xl text-gold mb-1">Battle not available</h2>
            <p className="text-sm text-muted-foreground mb-4">
              This battle may have been removed, hidden, or is no longer accessible.
            </p>
            <Link to="/battles" className="text-sm text-primary hover:underline">Browse all battles</Link>
          </div>
        )}

        {!loading && battle && status && (
          <div className="royal-card overflow-hidden animate-fade-in">
            {/* Top meta strip */}
            <div className="flex items-center justify-between px-3 py-2 border-b border-border/40 text-[10px]">
              <div className="flex items-center gap-2 min-w-0">
                {battle.challenger_post?.category && (
                  <span className="bg-secondary/40 text-secondary-foreground px-1.5 py-0.5 rounded-full font-semibold uppercase tracking-wider truncate max-w-[140px]">
                    {CATEGORY_LABEL[battle.challenger_post.category as CrownCategory]}
                  </span>
                )}
                {battle.challenger_post && (
                  <span className="text-muted-foreground inline-flex items-center gap-0.5 truncate">
                    <MapPin size={9} /> {locationLabel(battle.challenger_post)}
                  </span>
                )}
              </div>
              <div className="flex items-center gap-2 shrink-0">
                {status === "upcoming" && (
                  <span className="text-[10px] uppercase font-bold text-accent">Upcoming</span>
                )}
                {status === "live" && battle.ends_at && <CountdownPill endsAt={battle.ends_at} />}
                {/* Authoritative ended-battle result — same component & states as list cards. */}
                <OfficialResultBadge
                  battleId={battle.id}
                  enabled={status === "ended"}
                  resolveUsername={(uid) =>
                    uid === battle.challenger_id
                      ? battle.challenger?.username
                      : uid === battle.opponent_id
                      ? battle.opponent?.username
                      : null
                  }
                />
              </div>
            </div>

            {/* Sides */}
            <div className="grid grid-cols-2 relative">
              {(["L", "R"] as const).map((side) => {
                const isC = side === "L";
                const profile = isC ? battle.challenger : battle.opponent;
                const post = isC ? battle.challenger_post : battle.opponent_post;
                const votes = isC ? battle.challenger_votes : battle.opponent_votes;
                const pct = isC ? cPct : oPct;
                const won = status === "ended" && battle.winner_id && battle.winner_id === (isC ? battle.challenger_id : battle.opponent_id);
                return (
                  <div key={side} className="relative aspect-square bg-muted/30">
                    {post?.image_url && (
                      <img src={post.image_url} alt="" className="w-full h-full object-cover" loading="lazy" />
                    )}
                    {won && (
                      <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                        <Crown size={56} className="text-primary drop-shadow-lg" fill="currentColor" />
                      </div>
                    )}
                    <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/85 via-black/40 to-transparent p-2">
                      <div className="flex items-center gap-1.5 mb-0.5">
                        <div className="w-6 h-6 rounded-full overflow-hidden bg-muted/40 border border-white/20 shrink-0">
                          {profile?.profile_photo_url && (
                            <img loading="lazy" src={profile.profile_photo_url} alt="" className="w-full h-full object-cover" />
                          )}
                        </div>
                        <Link
                          to={profile?.username ? `/${profile.username}` : "#"}
                          className="text-xs font-bold text-white truncate hover:underline"
                        >
                          @{profile?.username || "—"}
                        </Link>
                      </div>
                      <div className="flex items-center justify-between text-[11px] text-white/90">
                        <span className="font-bold">{votes}</span>
                        <span>{Math.round(pct)}%</span>
                      </div>
                    </div>
                  </div>
                );
              })}
              <div className="absolute inset-y-0 left-1/2 -translate-x-1/2 flex items-center pointer-events-none">
                <div className="bg-gradient-gold text-primary-foreground font-display font-black text-sm w-10 h-10 rounded-full flex items-center justify-center gold-shadow border-2 border-background">
                  VS
                </div>
              </div>
            </div>

            {/* Vote bar */}
            <div className="h-1.5 bg-muted/40 flex">
              <div className="bg-gradient-gold transition-all duration-500" style={{ width: `${cPct}%` }} />
              <div className="bg-accent/70 transition-all duration-500" style={{ width: `${oPct}%` }} />
            </div>

            <div className="p-3 flex items-center justify-between gap-2 text-xs text-muted-foreground">
              <span className="inline-flex items-center gap-1">
                <Flame size={12} /> {totalVotes} votes
              </span>
              <Link to="/battles" className="text-primary hover:underline">All battles</Link>
            </div>
          </div>
        )}
      </div>
    </AppShell>
  );
}
