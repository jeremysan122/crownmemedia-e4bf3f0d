// Wave 6 — Battler performance analytics page. Self-service dashboard for
// hosts/opponents: last 25 ended battles with peak viewers, votes, gift
// revenue, and top supporter. Data comes from the security-definer RPC
// `get_battler_battle_analytics` which enforces self-only access.

import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "@/context/AuthContext";
import {
  fetchBattlerAnalytics, highlightErrorMessage,
  type BattlerAnalytics,
} from "@/lib/battleHighlight";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { BarChart3, Crown, Eye, Gift, Loader2, Trophy, type LucideIcon } from "lucide-react";
import { useSeoMeta } from "@/hooks/useSeoMeta";
import { humanizeSlug } from "@/lib/textLabels";

function Stat({ icon: Icon, label, value }: {
  icon: LucideIcon;
  label: string;
  value: string | number;
}) {
  return (
    <div className="rounded-xl border border-border/60 bg-card/60 p-4">
      <div className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
        <Icon size={12} className="text-primary" /> {label}
      </div>
      <div className="mt-1 text-2xl font-black tabular-nums">{value}</div>
    </div>
  );
}

export default function BattlerAnalytics() {
  const { user } = useAuth();
  const [data, setData] = useState<BattlerAnalytics | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useSeoMeta({
    title: "Battle analytics · CrownMe",
    description: "Your last live battles: peak viewers, votes, gifts, and top supporters.",
  });

  useEffect(() => {
    if (!user?.id) return;
    let alive = true;
    setLoading(true);
    fetchBattlerAnalytics(user.id, 25)
      .then((d) => { if (alive) { setData(d); setError(null); } })
      .catch((e) => { if (alive) setError(highlightErrorMessage(e, "Couldn't load your analytics.")); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [user?.id]);

  if (!user) {
    return (
      <div className="min-h-[70dvh] flex items-center justify-center p-6 text-sm text-muted-foreground">
        Please sign in to view your analytics.
      </div>
    );
  }

  return (
    <main className="mx-auto w-full max-w-3xl p-4 md:p-6 space-y-4">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-black flex items-center gap-2">
            <BarChart3 className="text-primary" size={22} /> Battle analytics
          </h1>
          <p className="text-xs text-muted-foreground mt-1">
            Your recent ended live battles. Only you can see this page.
          </p>
        </div>
        <Button asChild variant="outline" size="sm"><Link to="/battles">Back to battles</Link></Button>
      </header>

      {loading && (
        <div className="flex items-center justify-center py-16" data-testid="analytics-loading">
          <Loader2 className="animate-spin text-muted-foreground" />
        </div>
      )}
      {error && <div className="text-sm text-destructive">{error}</div>}

      {data && (
        <>
          <section className="grid grid-cols-2 md:grid-cols-5 gap-3">
            <Stat icon={Trophy} label="Battles" value={data.summary.battles} />
            <Stat icon={Crown} label="Wins" value={data.summary.wins} />
            <Stat icon={BarChart3} label="Votes" value={data.summary.total_votes.toLocaleString()} />
            <Stat icon={Gift} label="Gift shekels" value={data.summary.total_gift_shekels.toLocaleString()} />
            <Stat icon={Eye} label="Peak viewers" value={data.summary.peak_viewers_max.toLocaleString()} />
          </section>

          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-base">Recent battles</CardTitle></CardHeader>
            <CardContent className="p-0">
              {data.battles.length === 0 ? (
                <div className="p-6 text-sm text-muted-foreground text-center">
                  No ended battles yet. Once you finish a live battle, its stats show up here.
                </div>
              ) : (
                <ul className="divide-y divide-border/60">
                  {data.battles.map((b) => (
                    <li key={b.battle_id} className="p-4 flex items-center justify-between gap-3">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 text-sm font-semibold">
                          {b.won ? <Crown className="text-primary" size={14} /> : <Trophy className="text-muted-foreground" size={14} />}
                          <span>{b.won ? "Win" : b.my_votes === b.their_votes ? "Tie" : "Loss"}</span>
                          <span className="text-muted-foreground">·</span>
                          <span className="text-muted-foreground tabular-nums">
                            {b.my_votes}–{b.their_votes}
                          </span>
                        </div>
                        <div className="mt-0.5 text-[11px] text-muted-foreground flex flex-wrap items-center gap-x-3">
                          {b.ended_at && <span>{new Date(b.ended_at).toLocaleString()}</span>}
                          {b.category_slug && <span>· {humanizeSlug(b.category_slug)}</span>}
                          {b.region && <span>· {b.region}</span>}
                        </div>
                        {b.top_supporter && (
                          <div className="mt-1 text-[11px] text-muted-foreground">
                            Top supporter <span className="text-foreground font-medium">@{b.top_supporter.username ?? "unknown"}</span>
                            {" · "}<span className="text-primary font-semibold">{b.top_supporter.shekels.toLocaleString()}</span>
                          </div>
                        )}
                      </div>
                      <div className="text-right shrink-0">
                        <div className="text-[11px] text-muted-foreground flex items-center justify-end gap-1">
                          <Eye size={10} /> {b.peak_viewers.toLocaleString()}
                        </div>
                        <div className="text-[11px] text-muted-foreground flex items-center justify-end gap-1 mt-1">
                          <Gift size={10} /> {b.gift_shekels.toLocaleString()}
                        </div>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        </>
      )}
    </main>
  );
}
