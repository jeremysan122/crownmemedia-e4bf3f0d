import { useMemo, useState } from "react";
import AppShell from "@/components/AppShell";
import { Crown, Lock, CheckCircle2, Clock, Sparkles, Trophy } from "lucide-react";
import { useMyAchievements, type AchievementRow } from "@/hooks/useMyAchievements";
import { useAchievementRarity, rarityLabel } from "@/hooks/useAchievementRarity";
import CrownLoader from "@/components/CrownLoader";
import { useSeoMeta } from "@/hooks/useSeoMeta";
import { Link } from "react-router-dom";
import WeeklyQuestsPanel from "@/components/achievements/WeeklyQuestsPanel";

const RARITY_COLOR: Record<string, string> = {
  common:    "border-border text-muted-foreground",
  rare:      "border-blue-500/40 text-blue-400",
  epic:      "border-purple-500/40 text-purple-400",
  legendary: "border-gold/50 text-gold",
  mythic:    "border-fuchsia-500/50 text-fuchsia-400",
};

const CHECKPOINTS = [25, 50, 75, 100];

function AchievementCard({ a, rarityPct }: { a: AchievementRow; rarityPct?: number }) {
  const pct = Math.max(0, Math.min(100, Math.round(a.completion_percent || 0)));
  const done = a.status === "completed" || pct >= 100;
  const gatesOk = a.gates?.gates_ok !== false;
  const rewardsByCp = new Map<number, string[]>();
  a.rewards.forEach((r) => {
    const list = rewardsByCp.get(r.checkpoint) || [];
    list.push(r.reward_type);
    rewardsByCp.set(r.checkpoint, list);
  });

  return (
    <article className={`royal-card p-4 relative ${done ? "ring-1 ring-gold/50" : ""}`}>
      <div className="flex items-start justify-between gap-2 mb-2">
        <div className="min-w-0">
          <h3 className="font-display text-sm text-gold leading-tight truncate">{a.name}</h3>
          <p className="text-[11px] text-muted-foreground line-clamp-2 mt-0.5">{a.description}</p>
        </div>
        <div className="shrink-0 flex flex-col items-end gap-1">
          <span className={`text-[9px] uppercase tracking-wider px-2 py-0.5 rounded-full border ${RARITY_COLOR[a.rarity] || RARITY_COLOR.common}`}>
            {a.rarity}
          </span>
          {typeof rarityPct === "number" && (
            <span className="text-[9px] text-muted-foreground tabular-nums" title="Global unlock rate">
              {rarityLabel(rarityPct)} · {rarityPct}%
            </span>
          )}
        </div>
      </div>

      <div className="mt-2">
        <div className="flex items-center justify-between text-[10px] mb-1">
          <span className="text-muted-foreground">Progress</span>
          <span className="tabular-nums font-bold">{pct}%</span>
        </div>
        <div className="relative h-1.5 rounded-full bg-secondary overflow-hidden">
          <div className="h-full bg-gradient-gold" style={{ width: `${pct}%` }} />
        </div>
        <div className="mt-1.5 flex gap-1">
          {CHECKPOINTS.map((cp) => {
            const hit = a.highest_checkpoint >= cp;
            const rewards = rewardsByCp.get(cp) || [];
            return (
              <div key={cp} className="flex-1 flex flex-col items-center">
                <span
                  className={`w-full text-center text-[9px] py-0.5 rounded ${
                    hit ? "bg-gold/20 text-gold font-bold" : "bg-muted/30 text-muted-foreground"
                  }`}
                  title={rewards.join(", ") || `${cp}%`}
                >
                  {cp}%
                </span>
              </div>
            );
          })}
        </div>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2 text-[10px]">
        {done ? (
          <span className="inline-flex items-center gap-1 text-gold">
            <CheckCircle2 size={12} /> Completed
          </span>
        ) : !gatesOk ? (
          <span className="inline-flex items-center gap-1 text-muted-foreground">
            <Clock size={12} /> Requirements gated
          </span>
        ) : (
          <span className="inline-flex items-center gap-1 text-muted-foreground">
            <Sparkles size={12} /> In progress
          </span>
        )}
        {a.is_founder_only && (
          <span className="inline-flex items-center gap-1 rounded-full border border-gold/40 text-gold px-1.5 py-0.5">
            <Crown size={10} /> Founder
          </span>
        )}
        {a.avatar_frame_id && (
          <span className="inline-flex items-center gap-1 text-gold/80">
            <Trophy size={10} /> Frame reward
          </span>
        )}
      </div>

      {!gatesOk && (
        <div className="mt-2 text-[10px] text-muted-foreground border-t border-border pt-2 space-y-0.5">
          {a.gates.required_account_age_days > 0 && (
            <div>Account age: {a.gates.account_age_days}/{a.gates.required_account_age_days} days</div>
          )}
          {a.gates.required_qualified_active_days > 0 && (
            <div>Qualified active days: {a.gates.qualified_active_days}/{a.gates.required_qualified_active_days}</div>
          )}
          {a.gates.required_distinct_active_weeks > 0 && (
            <div>Distinct weeks: {a.gates.distinct_active_weeks}/{a.gates.required_distinct_active_weeks}</div>
          )}
        </div>
      )}
    </article>
  );
}

export default function Achievements() {
  useSeoMeta({
    title: "Achievements · CrownMe",
    description: "Track your progress across 81 CrownMe achievements and unlock ornate avatar frames.",
  });
  const { rows, loading } = useMyAchievements();
  const { map: rarityMap } = useAchievementRarity();
  const [filter, setFilter] = useState<"all" | "in_progress" | "completed" | "locked">("all");

  const filtered = useMemo(() => {
    return rows.filter((a) => {
      if (filter === "completed") return a.status === "completed";
      if (filter === "in_progress") return a.status !== "completed" && a.gates?.gates_ok !== false && (a.completion_percent || 0) > 0;
      if (filter === "locked") return a.gates?.gates_ok === false;
      return true;
    });
  }, [rows, filter]);

  const grouped = useMemo(() => {
    const g = new Map<string, AchievementRow[]>();
    filtered.forEach((a) => {
      const k = a.collection_slug || "other";
      if (!g.has(k)) g.set(k, []);
      g.get(k)!.push(a);
    });
    return Array.from(g.entries());
  }, [filtered]);

  const completedCount = rows.filter((r) => r.status === "completed").length;

  return (
    <AppShell>
      <div className="max-w-5xl mx-auto px-4 py-6">
        <header className="mb-6 text-center">
          <div className="inline-flex items-center gap-2 mb-2">
            <Crown className="text-gold" size={20} />
            <span className="text-[10px] uppercase tracking-[0.24em] text-gold/80">Royal Achievements</span>
            <Crown className="text-gold" size={20} />
          </div>
          <h1 className="font-display text-3xl lg:text-4xl">Achievements</h1>
          <p className="text-muted-foreground text-sm mt-2 max-w-lg mx-auto">
            Progress through 81 achievements to unlock badges, titles, and exclusive avatar frames.
          </p>
          <div className="mt-3 inline-flex items-center gap-3 rounded-full border border-gold/30 bg-gold/5 px-4 py-1.5 text-xs">
            <span className="text-gold font-bold tabular-nums">{completedCount}</span>
            <span className="text-muted-foreground">/ {rows.length} completed</span>
            <Link to="/frames" className="text-gold hover:underline">View my frames →</Link>
          </div>
        </header>

        <WeeklyQuestsPanel />


        <div className="mb-5 flex flex-wrap gap-2 justify-center">
          {(["all", "in_progress", "completed", "locked"] as const).map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`text-[11px] px-3 py-1.5 rounded-full border font-bold uppercase tracking-wider ${
                filter === f
                  ? "bg-gradient-gold text-black border-transparent"
                  : "border-border text-muted-foreground hover:text-foreground"
              }`}
            >
              {f.replace("_", " ")}
            </button>
          ))}
        </div>

        {loading ? (
          <CrownLoader fullscreen={false} label="Loading achievements…" />
        ) : filtered.length === 0 ? (
          <div className="royal-card p-8 text-center">
            <Lock size={28} className="mx-auto mb-3 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">No achievements match this filter.</p>
          </div>
        ) : (
          <div className="space-y-6">
            {grouped.map(([collection, items]) => (
              <section key={collection}>
                <h2 className="text-[11px] uppercase tracking-[0.2em] text-gold/80 mb-2">
                  {collection.replace(/-/g, " ")}
                </h2>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                  {items.map((a) => <AchievementCard key={a.achievement_id} a={a} rarityPct={rarityMap[a.achievement_id]?.rarity_pct} />)}
                </div>
              </section>
            ))}
          </div>
        )}
      </div>
    </AppShell>
  );
}
