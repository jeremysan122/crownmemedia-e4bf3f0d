// Battles Hub — the CrownMe arena.
// Hero + game-mode cards + live now strip + invites + history + tips.
// Respects the `live_battles_enabled` feature flag: when off, the Live
// surfaces (Go Live CTA, Live mode card, Live lobby tile) are hidden —
// we never show "Coming Soon". Post battles are always available.

import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import AppShell from "@/components/AppShell";
import { useSeoMeta } from "@/hooks/useSeoMeta";
import { useAuth } from "@/context/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { isFeatureEnabled } from "@/lib/featureFlags";
import {
  Swords, Radio, ChevronRight, History, Plus, Trophy, Users, Sparkles, Flame,
  Crown, Vote, Info, Zap, Timer, ArrowRight, CalendarClock,
} from "lucide-react";
import LiveNowStrip from "@/components/battles/LiveNowStrip";
import PendingInvitesList from "@/components/battles/PendingInvitesList";
import BattleHistoryList from "@/components/battles/BattleHistoryList";
import TopBattlersWidget from "@/components/battles/TopBattlersWidget";
import CreateLiveBattleDialog from "@/components/battles/CreateLiveBattleDialog";
import ChallengeDialog from "@/components/battles/ChallengeDialog";
import BattleFilterBar from "@/components/battles/BattleFilterBar";
import ScheduleBattleSheet from "@/components/battles/ScheduleBattleSheet";
import UpcomingBattlesStrip from "@/components/battles/UpcomingBattlesStrip";
import { Button } from "@/components/ui/button";

interface Stats { wins: number; total: number; liveNow: number; invites: number }

export default function BattlesHub() {
  useSeoMeta({
    title: "Battle Arena — CrownMe",
    description: "Challenge creators. Win votes. Take the crown. Live and post battles on CrownMe.",
  });
  const { user } = useAuth();
  const [openLive, setOpenLive] = useState(false);
  const [openPost, setOpenPost] = useState(false);
  const [openSchedule, setOpenSchedule] = useState(false);
  const [liveEnabled, setLiveEnabled] = useState<boolean | null>(null);
  const [stats, setStats] = useState<Stats>({ wins: 0, total: 0, liveNow: 0, invites: 0 });

  useEffect(() => {
    isFeatureEnabled("live_battles_enabled").then(setLiveEnabled).catch(() => setLiveEnabled(false));
  }, []);

  useEffect(() => {
    let alive = true;
    (async () => {
      const liveNowP = supabase.from("live_battles")
        .select("id", { count: "exact", head: true }).eq("status", "live");
      const invitesP = user?.id ? supabase.from("live_battles")
        .select("id", { count: "exact", head: true })
        .eq("opponent_id", user.id).eq("status", "pending") : null;
      const winsP = user?.id ? supabase.from("profiles")
        .select("battle_wins").eq("id", user.id).maybeSingle() : null;
      // profiles.battle_losses doesn't exist — derive losses from ended battles the user was in but didn't win.
      const totalP = user?.id ? supabase.from("live_battles")
        .select("id", { count: "exact", head: true })
        .or(`host_id.eq.${user.id},opponent_id.eq.${user.id}`)
        .eq("status", "ended") : null;

      const [live, invites, wins, total] = await Promise.all([liveNowP, invitesP as any, winsP as any, totalP as any]);
      if (!alive) return;
      const w = (wins?.data?.battle_wins as number) ?? 0;
      const t = (total?.count as number) ?? w;
      setStats({
        wins: w, total: Math.max(w, t),
        liveNow: live.count ?? 0,
        invites: invites?.count ?? 0,
      });
    })();
    return () => { alive = false; };
  }, [user?.id]);

  const winRate = useMemo(
    () => (stats.total ? Math.round((stats.wins / stats.total) * 100) : 0),
    [stats],
  );

  return (
    <AppShell>
      <div className="mx-auto w-full max-w-6xl px-4 sm:px-6 lg:px-8 pt-5 pb-28">
        {/* ─── HERO ARENA ─── */}
        <header
          className="relative overflow-hidden rounded-[28px] border border-primary/30 p-6 mb-5
                     bg-[radial-gradient(120%_140%_at_0%_0%,hsl(var(--primary)/0.30),transparent_60%),radial-gradient(120%_140%_at_100%_100%,hsl(var(--destructive)/0.25),transparent_55%),linear-gradient(180deg,hsl(var(--card)),hsl(var(--card)))]
                     shadow-[0_0_60px_-20px_hsl(var(--primary)/0.6)]"
        >
          {/* crown pattern glow */}
          <Crown
            aria-hidden
            className="absolute -top-8 -right-6 text-primary/10 rotate-12"
            size={180}
            strokeWidth={1.2}
          />
          <Swords
            aria-hidden
            className="absolute -bottom-8 -left-6 text-destructive/10 -rotate-12"
            size={160}
            strokeWidth={1.2}
          />

          <div className="relative">
            <div className="inline-flex items-center gap-2 px-2.5 py-1 rounded-full border border-primary/40 bg-primary/10 backdrop-blur">
              <span className="relative flex h-2 w-2">
                <span className="absolute inline-flex h-full w-full rounded-full bg-red-500/70 animate-ping" />
                <span className="relative inline-flex h-2 w-2 rounded-full bg-red-500" />
              </span>
              <span className="text-[10px] font-black tracking-[0.15em] uppercase text-primary">
                Arena Live
              </span>
            </div>

            <h1 className="mt-3 text-3xl leading-[1.05] font-black tracking-tight">
              Battle{" "}
              <span className="bg-gradient-to-r from-primary via-amber-300 to-primary bg-clip-text text-transparent">
                Arena
              </span>
            </h1>
            <p className="text-sm text-muted-foreground mt-1.5 max-w-[92%]">
              Challenge creators. Win votes. <span className="text-primary font-semibold">Take the crown.</span>
            </p>

            {/* stat grid */}
            <div className="mt-5 grid grid-cols-4 gap-2">
              <ArenaStat label="Live" value={stats.liveNow} icon={<Radio size={11} className="text-red-500" />} pulse={stats.liveNow > 0} accent="red" />
              <ArenaStat label="Wins" value={stats.wins} icon={<Trophy size={11} className="text-primary" />} accent="gold" />
              <ArenaStat label="Rate" value={stats.total ? `${winRate}%` : "—"} icon={<Flame size={11} className="text-orange-500" />} accent="orange" />
              <ArenaStat label="Invites" value={stats.invites} icon={<Zap size={11} className="text-violet-400" />} accent="violet" pulse={stats.invites > 0} />
            </div>
          </div>
        </header>

        {/* ─── BIG ACTIONS ─── */}
        <div className={`grid gap-2.5 mb-6 ${liveEnabled ? "grid-cols-2" : "grid-cols-1"}`}>
          {liveEnabled && (
            <button
              onClick={() => setOpenLive(true)}
              className="group relative overflow-hidden rounded-2xl p-4 text-left
                         bg-gradient-to-br from-amber-500 via-red-500 to-rose-600
                         shadow-[0_10px_40px_-12px_rgba(244,63,94,0.6)]
                         active:scale-[0.98] transition"
            >
              <div className="absolute inset-0 opacity-20 bg-[radial-gradient(circle_at_top_right,white,transparent_60%)]" />
              <div className="relative">
                <div className="flex items-center gap-1.5 text-white">
                  <span className="relative flex h-2 w-2">
                    <span className="absolute inline-flex h-full w-full rounded-full bg-white/80 animate-ping" />
                    <span className="relative inline-flex h-2 w-2 rounded-full bg-white" />
                  </span>
                  <Radio size={14} />
                  <span className="text-[10px] font-black uppercase tracking-widest">Live now</span>
                </div>
                <div className="mt-2 text-white font-black text-lg leading-tight">Go Live Battle</div>
                <div className="text-white/85 text-[11px] mt-0.5">Start a real-time 1v1</div>
              </div>
            </button>
          )}

          <button
            onClick={() => setOpenPost(true)}
            className="group relative overflow-hidden rounded-2xl p-4 text-left
                       bg-gradient-to-br from-violet-600 via-fuchsia-600 to-amber-500
                       shadow-[0_10px_40px_-12px_rgba(139,92,246,0.6)]
                       active:scale-[0.98] transition"
          >
            <div className="absolute inset-0 opacity-20 bg-[radial-gradient(circle_at_top_left,white,transparent_60%)]" />
            <div className="relative">
              <div className="flex items-center gap-1.5 text-white">
                <Crown size={14} />
                <span className="text-[10px] font-black uppercase tracking-widest">Classic</span>
              </div>
              <div className="mt-2 text-white font-black text-lg leading-tight">Start Post Battle</div>
              <div className="text-white/85 text-[11px] mt-0.5">24h vote challenge</div>
            </div>
          </button>
        </div>

        {/* ─── MODE CARDS ─── */}
        <div className="grid gap-3 mb-6">
          <ModeCard
            to="/battles/posts"
            title="Post Battle"
            badge="Classic"
            description="Challenge with a post. Community votes for 24 hours."
            icon={<Swords size={22} />}
            accent="primary"
            preview={
              <div className="space-y-1.5">
                <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                  <div className="h-full w-[62%] bg-gradient-to-r from-primary to-amber-400" />
                </div>
                <div className="flex items-center justify-between text-[10px] text-muted-foreground">
                  <span className="inline-flex items-center gap-1"><Vote size={10} /> 620 vs 380</span>
                  <span className="inline-flex items-center gap-1"><Timer size={10} /> 12h left</span>
                </div>
              </div>
            }
          />

          {liveEnabled && (
            <ModeCard
              to="/battles/live"
              title="Live Battle"
              badge="Live"
              description="Real-time 1v1 head-to-head with audience voting."
              icon={<Radio size={22} />}
              accent="destructive"
              preview={
                <div className="flex items-center gap-2">
                  <div className="flex -space-x-2">
                    <div className="w-6 h-6 rounded-full bg-gradient-to-br from-primary to-amber-400 border-2 border-card" />
                    <div className="w-6 h-6 rounded-full bg-gradient-to-br from-destructive to-rose-400 border-2 border-card" />
                  </div>
                  <span className="text-[10px] font-bold text-red-500 flex items-center gap-1">
                    <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" /> LIVE
                  </span>
                  <span className="text-[10px] text-muted-foreground ml-auto inline-flex items-center gap-1">
                    <Users size={10} /> 1.2k watching
                  </span>
                </div>
              }
            />
          )}
        </div>

        {/* ─── FILTERS ─── */}
        <BattleFilterBar />

        {/* ─── LIVE NOW ─── */}
        {liveEnabled && (
          <LiveNowStrip />
        )}

        {/* ─── UPCOMING (SCHEDULED) ─── */}
        {liveEnabled && (
          <UpcomingBattlesStrip />
        )}

        {/* Schedule for later CTA */}
        {liveEnabled && (
          <div className="mb-6">
            <Button variant="outline" size="sm" onClick={() => setOpenSchedule(true)}>
              <CalendarClock size={14} className="mr-1.5" /> Schedule for later
            </Button>
          </div>
        )}


        {/* ─── PENDING INVITES ─── */}
        <PendingInvitesList />

        {/* ─── EXPLORE ─── */}
        <div className={`grid gap-2 mb-6 ${liveEnabled ? "grid-cols-4" : "grid-cols-3"}`}>
          {liveEnabled && <TileLink to="/battles/live" icon={<Users size={16} />} label="Live lobby" />}
          <TileLink to="/tournaments" icon={<Trophy size={16} />} label="Tournaments" />
          <TileLink to="/battles/history" icon={<History size={16} />} label="History" />
          <TileLink to="/leaderboard" icon={<Sparkles size={16} />} label="Leaders" />
        </div>

        {/* ─── TOP BATTLERS ─── */}
        <section className="mb-6">
          <TopBattlersWidget />
        </section>

        {/* ─── YOUR HISTORY ─── */}
        <section className="mb-6">
          <div className="flex items-center justify-between mb-2">
            <h2 className="text-xs font-black uppercase tracking-wider inline-flex items-center gap-1.5">
              <Trophy size={12} className="text-primary" /> Your recent battles
            </h2>
            <Link to="/battles/history" className="text-xs text-primary hover:underline inline-flex items-center gap-1">
              View all <ArrowRight size={11} />
            </Link>
          </div>
          <BattleHistoryList limit={5} />
        </section>

        {/* ─── NEW HERE TIP ─── */}
        <section className="mb-2">
          <div className="rounded-2xl border border-border/60 bg-gradient-to-br from-primary/5 via-card to-card p-4">
            <div className="flex items-center gap-2 mb-1.5">
              <div className="w-7 h-7 rounded-full bg-primary/15 flex items-center justify-center">
                <Info size={13} className="text-primary" />
              </div>
              <h3 className="text-sm font-black">New to battles?</h3>
            </div>
            <p className="text-xs text-muted-foreground leading-relaxed">
              Post Battles run for 24 hours. Live Battles happen in real time. The crowd votes.
              The winner takes the crown.
            </p>
            <div className="mt-3 flex items-center gap-3 text-[11px] font-bold text-muted-foreground">
              <TipStep icon={<Plus size={11} />} label="Post" />
              <span className="text-border">•</span>
              <TipStep icon={<Vote size={11} />} label="Vote" />
              <span className="text-border">•</span>
              <TipStep icon={<Trophy size={11} />} label="Win" />
              <span className="text-border">•</span>
              <TipStep icon={<Crown size={11} className="text-primary" />} label="Crown" />
            </div>
          </div>
        </section>
      </div>

      {liveEnabled && <CreateLiveBattleDialog open={openLive} onOpenChange={setOpenLive} />}
      {liveEnabled && <ScheduleBattleSheet open={openSchedule} onOpenChange={setOpenSchedule} />}
      <ChallengeDialog open={openPost} onOpenChange={setOpenPost} />
    </AppShell>
  );
}

function ArenaStat({
  label, value, icon, pulse, accent,
}: {
  label: string; value: number | string; icon: React.ReactNode; pulse?: boolean;
  accent: "red" | "gold" | "orange" | "violet";
}) {
  const ring = {
    red: "border-red-500/30 shadow-[inset_0_0_0_1px_hsl(0_84%_60%/0.15)]",
    gold: "border-primary/30 shadow-[inset_0_0_0_1px_hsl(var(--primary)/0.15)]",
    orange: "border-orange-500/30 shadow-[inset_0_0_0_1px_rgba(249,115,22,0.15)]",
    violet: "border-violet-500/30 shadow-[inset_0_0_0_1px_rgba(139,92,246,0.15)]",
  }[accent];
  return (
    <div className={`rounded-xl bg-background/50 backdrop-blur border ${ring} p-2`}>
      <div className="flex items-center gap-1 text-[9px] uppercase tracking-wider text-muted-foreground">
        <span className={pulse ? "animate-pulse" : ""}>{icon}</span>
        <span className="truncate">{label}</span>
      </div>
      <div className="mt-0.5 text-lg font-black leading-none">{value}</div>
    </div>
  );
}

function TileLink({ to, icon, label }: { to: string; icon: React.ReactNode; label: string }) {
  return (
    <Link
      to={to}
      className="rounded-xl border border-border/60 bg-card px-3 py-3 flex flex-col items-center justify-center gap-1 text-center hover:border-primary/50 hover:-translate-y-0.5 transition"
    >
      <span className="text-primary">{icon}</span>
      <span className="text-[11px] font-bold">{label}</span>
    </Link>
  );
}

function TipStep({ icon, label }: { icon: React.ReactNode; label: string }) {
  return (
    <span className="inline-flex items-center gap-1">
      <span className="w-5 h-5 rounded-full bg-background border border-border/60 flex items-center justify-center">
        {icon}
      </span>
      {label}
    </span>
  );
}

function ModeCard({
  to, title, badge, description, icon, accent, preview,
}: {
  to: string; title: string; badge: string; description: string;
  icon: React.ReactNode; accent: "primary" | "destructive"; preview?: React.ReactNode;
}) {
  const glow = accent === "destructive"
    ? "from-destructive/25 via-destructive/5 to-transparent hover:border-destructive/50 hover:shadow-[0_0_30px_-10px_hsl(var(--destructive)/0.6)]"
    : "from-primary/25 via-primary/5 to-transparent hover:border-primary/50 hover:shadow-[0_0_30px_-10px_hsl(var(--primary)/0.6)]";
  const badgeCls = accent === "destructive"
    ? "bg-destructive/15 text-destructive"
    : "bg-primary/15 text-primary";

  return (
    <Link to={to} aria-label={title}>
      <div className={`relative overflow-hidden rounded-2xl border border-border/60 bg-card p-4 transition hover:-translate-y-0.5 active:scale-[0.99] ${glow.split(" ").slice(-2).join(" ")}`}>
        <div className={`absolute inset-0 bg-gradient-to-br ${glow.split(" ").slice(0, 3).join(" ")} pointer-events-none`} />
        <div className="relative flex items-start gap-3">
          <div className={`w-11 h-11 rounded-xl bg-background/70 border border-border/60 flex items-center justify-center shrink-0 ${accent === "destructive" ? "text-destructive" : "text-primary"}`}>
            {icon}
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <h2 className="font-black text-base">{title}</h2>
              <span className={`text-[10px] uppercase tracking-wider font-black px-2 py-0.5 rounded-full ${badgeCls}`}>
                {badge}
              </span>
            </div>
            <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">{description}</p>
            {preview && <div className="mt-3">{preview}</div>}
          </div>
          <ChevronRight size={18} className="text-muted-foreground shrink-0 mt-1" />
        </div>
      </div>
    </Link>
  );
}
