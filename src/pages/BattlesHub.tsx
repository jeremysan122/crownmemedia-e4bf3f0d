// Redesigned Battles Hub — the launch-day entry point.
// - Live Now strip (real live rooms)
// - Pending invitations (accept/decline/cancel)
// - Mode picker (Post vs Live)
// - Recent battles preview + link to full history

import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import AppShell from "@/components/AppShell";
import { useSeoMeta } from "@/hooks/useSeoMeta";
import { Swords, Radio, ChevronRight, History } from "lucide-react";
import { isFeatureEnabled } from "@/lib/featureFlags";
import LiveNowStrip from "@/components/battles/LiveNowStrip";
import PendingInvitesList from "@/components/battles/PendingInvitesList";
import BattleHistoryList from "@/components/battles/BattleHistoryList";

export default function BattlesHub() {
  useSeoMeta({
    title: "Battles — CrownMe",
    description: "Live head-to-head battles, post challenges, and your full history.",
  });
  const [liveEnabled, setLiveEnabled] = useState<boolean | null>(null);
  useEffect(() => {
    isFeatureEnabled("live_battles_enabled").then(setLiveEnabled).catch(() => setLiveEnabled(false));
  }, []);

  return (
    <AppShell>
      <div className="mx-auto max-w-lg px-4 pt-6 pb-24">
        <header className="mb-6">
          <h1 className="text-2xl font-black tracking-tight flex items-center gap-2">
            <Swords className="text-primary" size={22} /> Battles
          </h1>
          <p className="text-sm text-muted-foreground mt-1">Compete, vote, and take crowns.</p>
        </header>

        {liveEnabled && <LiveNowStrip />}
        {liveEnabled && <PendingInvitesList />}

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
            to={liveEnabled ? "/battles/live" : "#"}
            title="Live Battle"
            description="Real-time 1v1 head-to-head with audience voting."
            icon={<Radio size={22} />}
            badge={liveEnabled === false ? "Coming Soon" : "Live"}
            gradient="from-destructive/25 via-destructive/10 to-transparent"
            disabled={liveEnabled === false}
          />
        </div>

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
    </AppShell>
  );
}

function ModeCard({
  to, title, description, icon, badge, gradient, disabled,
}: {
  to: string; title: string; description: string;
  icon: React.ReactNode; badge: string; gradient: string; disabled?: boolean;
}) {
  const inner = (
    <div className={`relative overflow-hidden rounded-2xl border border-border/60 bg-card p-5 transition ${
      disabled ? "opacity-60 cursor-not-allowed" : "hover:border-primary/50 hover:-translate-y-0.5 active:scale-[0.99]"
    }`}>
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
        {!disabled && <ChevronRight size={18} className="text-muted-foreground shrink-0" />}
      </div>
    </div>
  );
  if (disabled) return inner;
  return <Link to={to} aria-label={title}>{inner}</Link>;
}
