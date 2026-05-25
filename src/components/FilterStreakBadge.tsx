import { Flame, Calendar, Clock, Sparkles } from "lucide-react";
import { useFilterStreaks } from "@/hooks/useFilterStreak";
import type { FilterId } from "@/lib/filters";
import { FILTER_BY_ID } from "@/lib/filters";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

interface Props {
  filter: FilterId | null | undefined;
  /** Render a compact pill (default) or a small inline chip. */
  variant?: "pill" | "chip";
}

/** Format a YYYY-MM-DD (UTC) string into a friendly relative label. */
function lastVoteLabel(dateStr: string): { absolute: string; status: "today" | "yesterday" | "stale"; daysAgo: number } {
  const today = new Date();
  const todayUtc = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()));
  const last = new Date(dateStr + "T00:00:00Z");
  const daysAgo = Math.max(0, Math.round((todayUtc.getTime() - last.getTime()) / 86_400_000));
  const absolute = last.toLocaleDateString(undefined, { month: "short", day: "numeric" });
  if (daysAgo <= 0) return { absolute, status: "today", daysAgo };
  if (daysAgo === 1) return { absolute, status: "yesterday", daysAgo };
  return { absolute, status: "stale", daysAgo };
}

/**
 * Daily filter-streak badge with a premium tooltip explaining the streak.
 * Hidden entirely when there's no streak yet — it's a reward, not a nag.
 */
export default function FilterStreakBadge({ filter, variant = "pill" }: Props) {
  const { streaks } = useFilterStreaks();
  if (!filter || filter === "none") return null;
  const s = streaks[filter];
  const meta = FILTER_BY_ID[filter];
  if (!s || s.current_streak < 1 || !meta) return null;

  const { absolute, status, daysAgo } = lastVoteLabel(s.last_vote_date);
  const aria = `${s.current_streak}-day ${meta.label} streak${s.longest_streak > s.current_streak ? `, personal best ${s.longest_streak} days` : ""}. Last vote ${status === "today" ? "today" : status === "yesterday" ? "yesterday" : `${daysAgo} days ago`}.`;

  const guidance =
    status === "today"
      ? "Streak locked in for today. Vote on another " + meta.label + " post tomorrow to extend it."
      : status === "yesterday"
      ? "Vote on a " + meta.label + " post today to extend your streak — it resets at midnight UTC."
      : `Streak at risk — your last ${meta.label} vote was ${daysAgo} days ago.`;

  const trigger =
    variant === "chip" ? (
      <span
        className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-gradient-to-r from-orange-500/20 to-amber-500/20 border border-amber-500/40 text-[10px] font-bold text-amber-300 tabular-nums cursor-help"
        role="status"
        aria-label={aria}
      >
        <Flame size={10} className="text-orange-400" aria-hidden />
        {s.current_streak}d
      </span>
    ) : (
      <div
        className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-gradient-to-r from-orange-500/20 via-amber-500/20 to-orange-500/20 border border-amber-500/50 shadow-[0_0_12px_-4px_hsl(35_95%_55%/0.6)] cursor-help"
        role="status"
        aria-label={aria}
      >
        <Flame size={12} className="text-orange-400 animate-pulse" aria-hidden />
        <span className="text-[11px] font-bold text-amber-200 tabular-nums">
          {s.current_streak}d
        </span>
        <span className="text-[10px] uppercase tracking-wider text-amber-300/80 font-semibold">
          {meta.label}
        </span>
      </div>
    );

  return (
    <TooltipProvider delayDuration={200}>
      <Tooltip>
        <TooltipTrigger asChild>{trigger}</TooltipTrigger>
        <TooltipContent
          side="top"
          align="center"
          sideOffset={8}
          className="max-w-[260px] p-0 border-amber-500/40 bg-gradient-to-br from-zinc-950 via-zinc-900 to-zinc-950 text-amber-50 shadow-[0_8px_32px_-8px_hsl(35_95%_55%/0.45)]"
        >
          <div className="px-3 py-2.5 space-y-2">
            <div className="flex items-center gap-2 pb-1.5 border-b border-amber-500/20">
              <div className="relative">
                <Flame size={16} className="text-orange-400" aria-hidden />
                <Sparkles size={8} className="absolute -top-1 -right-1 text-amber-300" aria-hidden />
              </div>
              <div className="flex-1">
                <div className="text-[11px] font-bold uppercase tracking-wider text-amber-300">
                  {meta.label} Streak
                </div>
              </div>
              <div className="text-right">
                <div className="text-lg font-black text-amber-100 tabular-nums leading-none">
                  {s.current_streak}
                </div>
                <div className="text-[9px] uppercase tracking-wider text-amber-400/70">
                  {s.current_streak === 1 ? "day" : "days"}
                </div>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2 text-[10px]">
              <div className="space-y-0.5">
                <div className="flex items-center gap-1 text-amber-400/70 uppercase tracking-wider font-semibold">
                  <Clock size={9} aria-hidden />
                  Last vote
                </div>
                <div className="text-amber-100 font-semibold">
                  {status === "today" ? "Today" : status === "yesterday" ? "Yesterday" : `${daysAgo}d ago`}
                  <span className="text-amber-400/60 font-normal"> · {absolute}</span>
                </div>
              </div>
              <div className="space-y-0.5">
                <div className="flex items-center gap-1 text-amber-400/70 uppercase tracking-wider font-semibold">
                  <Calendar size={9} aria-hidden />
                  Best
                </div>
                <div className="text-amber-100 font-semibold tabular-nums">
                  {s.longest_streak}d
                </div>
              </div>
            </div>

            <p className="text-[10.5px] leading-snug text-amber-200/80 pt-1.5 border-t border-amber-500/20">
              {guidance}
            </p>
          </div>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
