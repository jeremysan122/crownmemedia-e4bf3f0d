import { useEffect, useState } from "react";
import { SectionCard, PillBadge } from "@/components/admin/cc/CommandCenterUI";
import {
  fetchUserGrowthSummary,
  GROWTH_MILESTONES,
  EMPTY_GROWTH,
  type UserGrowthSummary,
} from "@/lib/userGrowthQueries";

function fmt(n: number): string {
  return Number.isFinite(n) ? n.toLocaleString() : "—";
}

export default function UserGrowthCard() {
  const [data, setData] = useState<UserGrowthSummary>(EMPTY_GROWTH);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      const res = await fetchUserGrowthSummary();
      if (cancelled) return;
      setData(res.data);
      setErr(res.error);
      setLoading(false);
    };
    load();
    const t = window.setInterval(load, 60_000);
    return () => {
      cancelled = true;
      window.clearInterval(t);
    };
  }, []);

  const pct = Math.max(0, Math.min(100, data.percent_complete));
  const eta =
    data.estimated_days_to_goal === null
      ? "Need more signup data"
      : data.estimated_days_to_goal === 0
      ? "Goal reached 🎉"
      : `${fmt(data.estimated_days_to_goal)} days at current pace`;

  return (
    <SectionCard title="Road to 1,000,000 Users">
      <p className="text-[11px] text-muted-foreground -mt-1">
        Track CrownMe's signup growth and launch momentum.
      </p>

      {loading ? (
        <div className="py-6 text-center text-xs text-muted-foreground">Loading growth…</div>
      ) : err ? (
        <div className="py-3 text-[11px] text-amber-300">
          Growth summary unavailable — admin access required.
        </div>
      ) : (
        <>
          <div className="flex items-baseline justify-between gap-2 flex-wrap">
            <div className="font-display text-2xl">
              {fmt(data.total_users)}{" "}
              <span className="text-muted-foreground text-sm">/ {fmt(data.goal_users)} users</span>
            </div>
            <div className="text-xs text-muted-foreground">
              {pct.toFixed(pct < 1 ? 4 : 2)}% complete · {fmt(data.users_remaining)} remaining
            </div>
          </div>

          <div
            className="mt-2 h-3 w-full rounded-full bg-muted/40 overflow-hidden border border-border/60"
            role="progressbar"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={pct}
            aria-label="Progress toward 1,000,000 users"
          >
            <div
              className="h-full bg-gradient-to-r from-amber-400 to-rose-400 transition-all"
              style={{ width: `${Math.max(pct, 0.25)}%` }}
            />
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mt-3 text-xs">
            <div className="rounded border border-border/60 bg-card/30 p-2">
              <div className="text-[10px] uppercase tracking-wider text-muted-foreground">New (24h)</div>
              <div className="font-display text-lg">{fmt(data.signups_24h)}</div>
            </div>
            <div className="rounded border border-border/60 bg-card/30 p-2">
              <div className="text-[10px] uppercase tracking-wider text-muted-foreground">New (7d)</div>
              <div className="font-display text-lg">{fmt(data.signups_7d)}</div>
            </div>
            <div className="rounded border border-border/60 bg-card/30 p-2">
              <div className="text-[10px] uppercase tracking-wider text-muted-foreground">New (30d)</div>
              <div className="font-display text-lg">{fmt(data.signups_30d)}</div>
            </div>
            <div className="rounded border border-border/60 bg-card/30 p-2">
              <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Avg / day (7d)</div>
              <div className="font-display text-lg">{fmt(data.avg_daily_signups_7d)}</div>
            </div>
          </div>

          <div className="mt-2 text-[11px] text-muted-foreground">
            Estimated time to 1,000,000: <span className="text-foreground">{eta}</span>
          </div>

          <div className="mt-3">
            <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1.5">
              Milestones
            </div>
            <div className="flex flex-wrap gap-1.5">
              {GROWTH_MILESTONES.map((m) => {
                const reached = data.total_users >= m;
                return (
                  <PillBadge key={m} tone={reached ? "good" : "default"}>
                    {reached ? "✓ " : ""}
                    {m.toLocaleString()}
                  </PillBadge>
                );
              })}
            </div>
          </div>
        </>
      )}
    </SectionCard>
  );
}
