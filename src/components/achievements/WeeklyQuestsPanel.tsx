import { CalendarDays, CheckCircle2, Sparkles } from "lucide-react";
import { useWeeklyQuests } from "@/hooks/useWeeklyQuests";

/**
 * Compact panel that surfaces this week's rotating quests. Server-side
 * `tick_weekly_quests` runs from the same triggers that feed the achievement
 * pipeline, so progress here matches the user's real activity.
 */
export default function WeeklyQuestsPanel() {
  const { rows, loading } = useWeeklyQuests();
  if (loading || rows.length === 0) return null;

  return (
    <section aria-label="Weekly quests" className="mb-6">
      <div className="flex items-center gap-2 mb-2">
        <CalendarDays size={14} className="text-gold" />
        <h2 className="text-[11px] uppercase tracking-[0.2em] text-gold/80">Weekly Quests</h2>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        {rows.map((q) => {
          const pct = Math.max(0, Math.min(100, q.completion_percent | 0));
          const done = q.status === "completed";
          return (
            <div
              key={q.quest_id}
              className={`royal-card p-3 ${done ? "ring-1 ring-gold/50" : ""}`}
            >
              <div className="flex items-start justify-between gap-2 mb-1">
                <h3 className="font-display text-xs text-gold leading-tight">{q.name}</h3>
                {done ? (
                  <CheckCircle2 size={14} className="text-gold shrink-0" />
                ) : (
                  <Sparkles size={12} className="text-muted-foreground shrink-0" />
                )}
              </div>
              <p className="text-[10px] text-muted-foreground line-clamp-2 mb-2">{q.description}</p>
              <div className="flex items-center justify-between text-[10px] mb-1">
                <span className="text-muted-foreground">Progress</span>
                <span className="tabular-nums font-bold">
                  {Math.min(q.progress, q.target)}/{q.target}
                </span>
              </div>
              <div className="h-1.5 rounded-full bg-secondary overflow-hidden">
                <div className="h-full bg-gradient-gold" style={{ width: `${pct}%` }} />
              </div>
              {q.rewards && q.rewards.length > 0 && (
                <div className="mt-2 flex flex-wrap gap-1">
                  {q.rewards.map((r, i) => (
                    <span
                      key={i}
                      className="text-[9px] uppercase tracking-wider px-1.5 py-0.5 rounded border border-gold/30 text-gold/90"
                    >
                      {r.type === "crowns" ? `+${r.amount} crowns` : r.key ?? r.type}
                    </span>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}
