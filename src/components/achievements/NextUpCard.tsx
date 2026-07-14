import { Sparkles, ArrowRight } from "lucide-react";
import type { AchievementRow } from "@/hooks/useMyAchievements";

/**
 * Highlights the closest-to-complete achievement to give players a clear goal.
 */
export default function NextUpCard({ a }: { a: AchievementRow }) {
  const pct = Math.max(0, Math.min(100, Math.round(a.completion_percent || 0)));
  return (
    <article className="royal-card p-4 mb-5 border border-gold/30 bg-gradient-to-r from-gold/5 to-transparent">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 min-w-0">
          <Sparkles className="text-gold shrink-0" size={16} />
          <div className="min-w-0">
            <div className="text-[10px] uppercase tracking-[0.2em] text-gold/80">Next up</div>
            <div className="font-display text-base truncate">{a.name}</div>
            <div className="text-[11px] text-muted-foreground line-clamp-1">{a.description}</div>
          </div>
        </div>
        <div className="shrink-0 text-right">
          <div className="font-display text-lg text-gold tabular-nums">{pct}%</div>
          <ArrowRight className="text-gold ml-auto" size={14} />
        </div>
      </div>
      <div className="mt-2 h-1.5 rounded-full bg-secondary overflow-hidden">
        <div className="h-full bg-gradient-gold" style={{ width: `${pct}%` }} />
      </div>
    </article>
  );
}
