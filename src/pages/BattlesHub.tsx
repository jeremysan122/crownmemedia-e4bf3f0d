// Battles Hub — launch-day entry point.
// Live battles are always surfaced here; the server RPC still enforces the
// feature flag when someone tries to create one, so we don't hide the mode.

import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import AppShell from "@/components/AppShell";
import { useSeoMeta } from "@/hooks/useSeoMeta";
import { useAuth } from "@/context/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import {
  Swords, Radio, ChevronRight, History, Plus, Trophy,
  Users, Sparkles, Flame,
} from "lucide-react";
import LiveNowStrip from "@/components/battles/LiveNowStrip";
import PendingInvitesList from "@/components/battles/PendingInvitesList";
import BattleHistoryList from "@/components/battles/BattleHistoryList";
import TopBattlersWidget from "@/components/battles/TopBattlersWidget";
import CreateLiveBattleDialog from "@/components/battles/CreateLiveBattleDialog";
import ChallengeDialog from "@/components/battles/ChallengeDialog";
import { Button } from "@/components/ui/button";

interface Stats { wins: number; total: number; liveNow: number }

export default function BattlesHub() {
  useSeoMeta({
    title: "Battles — CrownMe",
    description: "Live head-to-head battles, post challenges, and your full history.",
  });
  const { user } = useAuth();
  const nav = useNavigate();
  const [openLive, setOpenLive] = useState(false);
  const [openPost, setOpenPost] = useState(false);
  const [stats, setStats] = useState<Stats>({ wins: 0, total: 0, liveNow: 0 });

  useEffect(() => {
    let alive = true;
    (async () => {
      const liveNowP = supabase.from("live_battles")
        .select("id", { count: "exact", head: true }).eq("status", "live");
      const winsP = user?.id ? supabase.from("profiles")
        .select("battle_wins,battle_losses").eq("id", user.id).maybeSingle() : null;

      const [live, wins] = await Promise.all([liveNowP, winsP as any]);
      if (!alive) return;
      const w = (wins?.data?.battle_wins as number) ?? 0;
      const l = (wins?.data?.battle_losses as number) ?? 0;
      setStats({ wins: w, total: w + l, liveNow: live.count ?? 0 });
    })();
    return () => { alive = false; };
  }, [user?.id]);

  const winRate = useMemo(
    () => (stats.total ? Math.round((stats.wins / stats.total) * 100) : 0),
    [stats],
  );

  return (
    <AppShell>
      <div className="mx-auto max-w-lg px-4 pt-6 pb-24">
        {/* Hero */}
        <header className="relative overflow-hidden rounded-3xl border border-border/60 bg-card p-5 mb-5">
          <div className="absolute -top-16 -right-16 w-56 h-56 rounded-full bg-primary/20 blur-3xl pointer-events-none" />
          <div className="absolute -bottom-20 -left-10 w-52 h-52 rounded-full bg-destructive/15 blur-3xl pointer-events-none" />
          <div className="relative">
            <h1 className="text-2xl font-black tracking-tight flex items-center gap-2">
              <Swords className="text-primary" size={22} /> Battles
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
              Compete, vote, and take crowns.
            </p>
            <div className="mt-4 grid grid-cols-3 gap-2">
              <Stat label="Live now" value={stats.liveNow} icon={<Radio size={12} className="text-red-500" />} pulse={stats.liveNow > 0} />
              <Stat label="Your wins" value={stats.wins} icon={<Trophy size={12} className="text-primary" />} />
              <Stat label="Win rate" value={stats.total ? `${winRate}%` : "—"} icon={<Flame size={12} className="text-orange-500" />} />
            </div>
          </div>
        </header>

        {/* Quick actions */}
        <div className="grid grid-cols-2 gap-2 mb-5">
          <Button size="lg" className="h-auto py-3 flex-col gap-0.5" onClick={() => setOpenLive(true)}>
            <span className="flex items-center gap-1.5 font-bold"><Radio size={14} /> New Live</span>
            <span className="text-[10px] font-normal opacity-80">1v1 real-time</span>
          </Button>
          <Button size="lg" variant="secondary" className="h-auto py-3 flex-col gap-0.5" onClick={() => setOpenPost(true)}>
            <span className="flex items-center gap-1.5 font-bold"><Plus size={14} /> New Post Battle</span>
            <span className="text-[10px] font-normal opacity-80">24h community vote</span>
          </Button>
        </div>

        {/* Live now */}
        <LiveNowStrip />

        {/* Pending invitations */}
        <PendingInvitesList />

        {/* Mode picker */}
        <div className="grid gap-3 mb-6">
          <ModeCard
            to="/battles/posts"
            title="Post Battle"
            description="Challenge with a post. Community votes for 24 hours."
            icon={<Swords size={22} />}
            badge="Classic"
            gradient="from-primary/25 via-primary/10 to-transparent"
          />
          <ModeCard
            to="/battles/live"
            title="Live Battle"
            description="Real-time 1v1 head-to-head with audience voting."
            icon={<Radio size={22} />}
            badge="Live"
            gradient="from-destructive/25 via-destructive/10 to-transparent"
          />
        </div>

        {/* Explore row */}
        <div className="grid grid-cols-3 gap-2 mb-6">
          <TileLink to="/battles/live" icon={<Users size={16} />} label="Live lobby" />
          <TileLink to="/battles/history" icon={<History size={16} />} label="History" />
          <TileLink to="/leaderboard" icon={<Sparkles size={16} />} label="Leaders" />
        </div>

        {/* Top battlers */}
        <section className="mb-6">
          <TopBattlersWidget />
        </section>

        {/* Recent battles */}
        <section>
          <div className="flex items-center justify-between mb-2">
            <h2 className="text-xs font-bold uppercase tracking-wider">Recent battles</h2>
            <Link to="/battles/history" className="text-xs text-primary hover:underline inline-flex items-center gap-1">
              <History size={12} /> View all
            </Link>
          </div>
          <BattleHistoryList limit={5} />
        </section>
      </div>

      <CreateLiveBattleDialog open={openLive} onOpenChange={setOpenLive} />
      <ChallengeDialog open={openPost} onOpenChange={setOpenPost} />
    </AppShell>
  );
}

function Stat({ label, value, icon, pulse }: {
  label: string; value: number | string; icon: React.ReactNode; pulse?: boolean;
}) {
  return (
    <div className="rounded-xl bg-background/60 border border-border/50 p-2.5">
      <div className="flex items-center gap-1 text-[10px] uppercase tracking-wider text-muted-foreground">
        <span className={pulse ? "animate-pulse" : ""}>{icon}</span>
        <span className="truncate">{label}</span>
      </div>
      <div className="mt-1 text-lg font-black leading-none">{value}</div>
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
      <span className="text-[11px] font-semibold">{label}</span>
    </Link>
  );
}

function ModeCard({
  to, title, description, icon, badge, gradient,
}: {
  to: string; title: string; description: string;
  icon: React.ReactNode; badge: string; gradient: string;
}) {
  return (
    <Link to={to} aria-label={title}>
      <div className="relative overflow-hidden rounded-2xl border border-border/60 bg-card p-5 transition hover:border-primary/50 hover:-translate-y-0.5 active:scale-[0.99]">
        <div className={`absolute inset-0 bg-gradient-to-br ${gradient} pointer-events-none`} />
        <div className="relative flex items-center gap-4">
          <div className="w-12 h-12 rounded-xl bg-background/70 border border-border/60 flex items-center justify-center text-primary">
            {icon}
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <h2 className="font-bold text-base">{title}</h2>
              <span className="text-[10px] uppercase tracking-wider font-bold px-2 py-0.5 rounded-full bg-primary/15 text-primary">
                {badge}
              </span>
            </div>
            <p className="text-xs text-muted-foreground mt-1 leading-relaxed">{description}</p>
          </div>
          <ChevronRight size={18} className="text-muted-foreground shrink-0" />
        </div>
      </div>
    </Link>
  );
}
