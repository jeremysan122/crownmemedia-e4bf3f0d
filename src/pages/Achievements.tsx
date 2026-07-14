import { useEffect, useMemo, useRef, useState } from "react";
import AppShell from "@/components/AppShell";
import { Crown, Lock, CheckCircle2, Clock, Sparkles, Trophy, Search, Share2, EyeOff } from "lucide-react";
import { useMyAchievements, type AchievementRow } from "@/hooks/useMyAchievements";
import { useAchievementRarity, rarityLabel } from "@/hooks/useAchievementRarity";
import CrownLoader from "@/components/CrownLoader";
import { useSeoMeta } from "@/hooks/useSeoMeta";
import { Link } from "react-router-dom";
import WeeklyQuestsPanel from "@/components/achievements/WeeklyQuestsPanel";
import RarityLegend from "@/components/achievements/RarityLegend";
import NextUpCard from "@/components/achievements/NextUpCard";
import { toast } from "sonner";
import { trackEvent } from "@/lib/analytics";
import {
  matchesRarity,
  matchesSearch,
  maskSecret,
  pickNextUp,
  rewardChipLabel,
  sortAchievements,
  statusMatches,
  unlockHint,
  type SortKey,
  type StatusFilter,
} from "@/lib/achievements";

const RARITY_COLOR: Record<string, string> = {
  common:    "border-border text-muted-foreground",
  rare:      "border-blue-500/40 text-blue-400",
  epic:      "border-purple-500/40 text-purple-400",
  legendary: "border-gold/50 text-gold",
  mythic:    "border-fuchsia-500/50 text-fuchsia-400",
};

const CHECKPOINTS = [25, 50, 75, 100];
const RARITIES = ["common", "rare", "epic", "legendary", "mythic"] as const;

function AchievementCard({ a, rarityPct }: { a: AchievementRow; rarityPct?: number }) {
  const displayed = maskSecret(a);
  const pct = Math.max(0, Math.min(100, Math.round(a.completion_percent || 0)));
  const done = a.status === "completed" || pct >= 100;
  const gatesOk = a.gates?.gates_ok !== false;
  const hiddenSecret = a.is_secret && a.status !== "completed";
  const rewardsByCp = new Map<number, string[]>();
  a.rewards.forEach((r) => {
    const list = rewardsByCp.get(r.checkpoint) || [];
    list.push(r.reward_type);
    rewardsByCp.set(r.checkpoint, list);
  });

  const share = async () => {
    const url = `${window.location.origin}/achievements`;
    const text = `I unlocked "${a.name}" on CrownMe 👑`;
    void trackEvent("achievement_share_attempted", {
      metadata: { slug: a.slug, rarity: a.rarity, collection: a.collection_slug ?? "other" },
    });
    try {
      if (navigator.share) await navigator.share({ title: a.name, text, url });
      else { await navigator.clipboard.writeText(`${text} ${url}`); toast.success("Copied to clipboard"); }
      void trackEvent("achievement_share_success", {
        metadata: { slug: a.slug, rarity: a.rarity, channel: navigator.share ? "native" : "clipboard" },
      });
    } catch {
      void trackEvent("achievement_share_failed", { metadata: { slug: a.slug } });
    }
  };

  return (
    <article
      className={`royal-card p-4 relative ${done ? "ring-1 ring-gold/50" : ""} ${!gatesOk ? "opacity-70" : ""}`}
      data-testid="achievement-card"
      data-status={done ? "completed" : !gatesOk ? "locked" : "in-progress"}
    >
      {hiddenSecret && (
        <div className="absolute top-2 right-2 inline-flex items-center gap-1 text-[9px] uppercase tracking-wider text-muted-foreground">
          <EyeOff size={10} /> Secret
        </div>
      )}
      <div className="flex items-start justify-between gap-2 mb-2">
        <div className="min-w-0">
          <h3 className="font-display text-sm text-gold leading-tight truncate">{displayed.name}</h3>
          <p className="text-[11px] text-muted-foreground line-clamp-2 mt-0.5">{displayed.description}</p>
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

      {!hiddenSecret && (
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
      )}

      <div className="mt-3 flex flex-wrap items-center gap-2 text-[10px]">
        {done ? (
          <span className="inline-flex items-center gap-1 text-gold">
            <CheckCircle2 size={12} /> Completed
          </span>
        ) : !gatesOk ? (
          <span className="inline-flex items-center gap-1 text-muted-foreground">
            <Lock size={12} /> Locked
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
        <span className="inline-flex items-center gap-1 text-gold/80">
          <Trophy size={10} /> {rewardChipLabel(a)}
        </span>
        {done && (
          <button
            onClick={share}
            className="ml-auto inline-flex items-center gap-1 text-muted-foreground hover:text-gold"
            aria-label="Share achievement"
          >
            <Share2 size={11} /> Share
          </button>
        )}
      </div>

      {!gatesOk && (
        <div className="mt-2 text-[10px] text-muted-foreground border-t border-border pt-2 space-y-0.5">
          <div className="italic">{unlockHint(a)}</div>
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
    description: "Track your progress across CrownMe achievements and unlock badges, titles, and exclusive avatar frames.",
  });
  const { rows, loading } = useMyAchievements();
  const { map: rarityMap } = useAchievementRarity();
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [rarityFilter, setRarityFilter] = useState<Set<string>>(new Set());
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<SortKey>("rarity");

  // Fire once per session mount
  useEffect(() => { void trackEvent("achievement_page_opened"); }, []);

  // Debounced search tracking
  useEffect(() => {
    if (!query) return;
    const t = setTimeout(() => {
      void trackEvent("achievement_search_submitted", { metadata: { length: query.length } });
    }, 600);
    return () => clearTimeout(t);
  }, [query]);

  // Detect progress + checkpoint transitions across refreshes
  const prevMapRef = useRef<Map<string, AchievementRow> | null>(null);
  useEffect(() => {
    if (loading || rows.length === 0) return;
    const prev = prevMapRef.current;
    const next = new Map(rows.map((r) => [r.achievement_id, r]));
    if (prev) {
      rows.forEach((r) => {
        const before = prev.get(r.achievement_id);
        if (!before) return;
        if (r.highest_checkpoint > before.highest_checkpoint) {
          void trackEvent("achievement_checkpoint_reached", {
            metadata: {
              slug: r.slug,
              rarity: r.rarity,
              checkpoint: r.highest_checkpoint,
              collection: r.collection_slug ?? "other",
            },
          });
        } else if (Math.floor(r.completion_percent) > Math.floor(before.completion_percent)) {
          void trackEvent("achievement_progress_changed", {
            metadata: {
              slug: r.slug,
              rarity: r.rarity,
              from: Math.floor(before.completion_percent),
              to: Math.floor(r.completion_percent),
            },
          });
        }
      });
    }
    prevMapRef.current = next;
  }, [rows, loading]);

  const toggleRarity = (r: string) =>
    setRarityFilter((prev) => {
      const next = new Set(prev);
      if (next.has(r)) next.delete(r); else next.add(r);
      void trackEvent("achievement_filter_changed", {
        metadata: { kind: "rarity", value: r, active: next.has(r) },
      });
      return next;
    });

  const filtered = useMemo(() => {
    const base = rows.filter((a) =>
      statusMatches(a, statusFilter) &&
      matchesRarity(a, rarityFilter) &&
      matchesSearch(a, query) &&
      // Hide incomplete secrets from all views (also fixes Next Up leak below)
      (!a.is_secret || a.status === "completed"),
    );
    return sortAchievements(base, sort);
  }, [rows, statusFilter, rarityFilter, query, sort]);

  // Never surface an unrevealed secret in Next Up
  const nextUp = useMemo(
    () => pickNextUp(rows.filter((r) => !r.is_secret || r.status === "completed")),
    [rows],
  );

  useEffect(() => {
    if (!nextUp) return;
    void trackEvent("achievement_next_up_impression", {
      metadata: { slug: nextUp.slug, rarity: nextUp.rarity, pct: Math.floor(nextUp.completion_percent) },
    });
  }, [nextUp?.achievement_id]);

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
            Earn badges, titles, and exclusive avatar frames by playing CrownMe.
          </p>
          <div className="mt-3 inline-flex items-center gap-3 rounded-full border border-gold/30 bg-gold/5 px-4 py-1.5 text-xs">
            <span className="text-gold font-bold tabular-nums">{completedCount}</span>
            <span className="text-muted-foreground">/ {rows.length} completed</span>
            <Link to="/frames" className="text-gold hover:underline">View my frames →</Link>
          </div>
        </header>

        {nextUp && <NextUpCard a={nextUp} />}

        <WeeklyQuestsPanel />

        {/* Controls: search + sort + status + rarity legend */}
        <div className="my-5 space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative flex-1 min-w-[180px]">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <input
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search achievements…"
                aria-label="Search achievements"
                className="w-full pl-8 pr-3 py-2 text-xs rounded-full border border-border bg-background focus:outline-none focus:ring-1 focus:ring-gold"
              />
            </div>
            <select
              value={sort}
              onChange={(e) => {
                const v = e.target.value as SortKey;
                setSort(v);
                void trackEvent("achievement_sort_changed", { metadata: { sort: v } });
              }}
              aria-label="Sort achievements"
              className="text-xs px-3 py-2 rounded-full border border-border bg-background focus:outline-none focus:ring-1 focus:ring-gold"
            >
              <option value="rarity">Rarity</option>
              <option value="progress">Progress</option>
              <option value="recent">Recently unlocked</option>
              <option value="closest">Closest to complete</option>
            </select>
            <RarityLegend />
          </div>

          <div className="flex flex-wrap gap-2 justify-center">
            {(["all", "in_progress", "completed", "locked"] as const).map((f) => (
              <button
                key={f}
                onClick={() => {
                  setStatusFilter(f);
                  void trackEvent("achievement_filter_changed", { metadata: { kind: "status", value: f } });
                }}
                className={`text-[11px] px-3 py-1.5 rounded-full border font-bold uppercase tracking-wider ${
                  statusFilter === f
                    ? "bg-gradient-gold text-black border-transparent"
                    : "border-border text-muted-foreground hover:text-foreground"
                }`}
              >
                {f.replace("_", " ")}
              </button>
            ))}
          </div>

          <div className="flex flex-wrap gap-1.5 justify-center">
            {RARITIES.map((r) => {
              const active = rarityFilter.has(r);
              return (
                <button
                  key={r}
                  onClick={() => toggleRarity(r)}
                  className={`text-[10px] px-2 py-1 rounded-full border uppercase tracking-wider ${
                    active ? RARITY_COLOR[r] + " bg-muted/30" : "border-border text-muted-foreground"
                  }`}
                >
                  {r}
                </button>
              );
            })}
          </div>
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

        <div className="mt-8 flex justify-center">
          <Clock size={12} className="text-muted-foreground mr-1" />
          <span className="text-[10px] text-muted-foreground">Updated live — new unlocks appear as you play.</span>
        </div>
      </div>
    </AppShell>
  );
}
