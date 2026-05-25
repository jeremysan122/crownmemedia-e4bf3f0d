import { useEffect, useState, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { TrendingUp, TrendingDown, Minus, LineChart, Sparkles } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { timeAgo } from "@/lib/crown";

interface Snapshot {
  rank: number | null;
  total: number;
  captured_at: string;
}

interface Props {
  postId: string | null;
  scope: "city" | "state" | "global";
  region: string;
  category: string;
}

/**
 * Sparkline-style timeline of a post's ranked position over time. Lower rank
 * (closer to #1) is plotted higher — matches user intuition of "going up".
 * Each datapoint exposes its captured_at timestamp on hover, and the header
 * surfaces the absolute rank delta since the very first snapshot.
 */
export default function RankHistoryTimeline({ postId, scope, region, category }: Props) {
  const [rows, setRows] = useState<Snapshot[] | null>(null);
  const [hover, setHover] = useState<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    if (!postId) { setRows(null); return; }
    setRows(null);
    (async () => {
      const { data } = await supabase
        .from("rank_snapshots")
        .select("rank, total, captured_at")
        .eq("post_id", postId)
        .eq("scope", scope)
        .eq("region", region)
        .eq("category", category)
        .order("captured_at", { ascending: true })
        .limit(48); // ~2 days hourly, capped by 14-day retention server-side
      if (!cancelled) setRows((data ?? []) as Snapshot[]);
    })();
    return () => { cancelled = true; };
  }, [postId, scope, region, category]);

  const points = useMemo(
    () => (rows ?? []).filter((r) => r.rank != null) as Array<Snapshot & { rank: number }>,
    [rows],
  );

  /* ─────────────────  Loading  ───────────────── */
  if (rows === null) {
    return (
      <div
        className="rounded-lg border border-border/60 bg-gradient-to-br from-muted/40 to-muted/10 p-3"
        role="status"
        aria-label="Loading rank history"
      >
        <div className="flex items-center justify-between mb-2">
          <Skeleton className="h-3 w-32" />
          <Skeleton className="h-3 w-12" />
        </div>
        <Skeleton className="h-14 w-full rounded" />
        <div className="flex justify-between mt-2">
          <Skeleton className="h-2.5 w-10" />
          <Skeleton className="h-2.5 w-12" />
        </div>
      </div>
    );
  }

  /* ─────────────────  Empty  ───────────────── */
  if (points.length < 2) {
    return (
      <div
        className="rounded-lg border border-dashed border-border/60 bg-muted/20 p-4 text-center"
        role="status"
        aria-label="No rank history yet"
      >
        <div className="mx-auto mb-1.5 size-8 rounded-full bg-primary/10 grid place-items-center">
          <LineChart size={14} className="text-primary" />
        </div>
        <p className="text-[12px] font-semibold text-foreground">Rank history coming soon</p>
        <p className="text-[10px] text-muted-foreground mt-0.5">
          {points.length === 0
            ? "We'll start tracking this post's position on the next hourly snapshot."
            : "One snapshot in — the timeline appears after the next update."}
        </p>
      </div>
    );
  }

  const W = 240, H = 56, P = 6;
  const ranks = points.map((p) => p.rank);
  const minR = Math.min(...ranks);
  const maxR = Math.max(...ranks, minR + 1);
  const xStep = (W - P * 2) / Math.max(points.length - 1, 1);
  // Lower rank → higher Y position visually (invert)
  const y = (r: number) => P + ((r - minR) / (maxR - minR)) * (H - P * 2);
  const x = (i: number) => P + i * xStep;
  const path = points.map((p, i) => `${i === 0 ? "M" : "L"} ${x(i)} ${y(p.rank)}`).join(" ");
  const areaPath = `${path} L ${x(points.length - 1)} ${H} L ${x(0)} ${H} Z`;

  const first = points[0];
  const last = points[points.length - 1];
  const delta = first.rank - last.rank; // positive → improved (rank went down numerically)
  const Trend = delta > 0 ? TrendingUp : delta < 0 ? TrendingDown : Minus;
  const trendCls = delta > 0 ? "text-gold" : delta < 0 ? "text-destructive" : "text-muted-foreground";
  const trendLabel =
    delta > 0 ? `▲ ${delta} since ${timeAgo(first.captured_at)}`
    : delta < 0 ? `▼ ${-delta} since ${timeAgo(first.captured_at)}`
    : `steady since ${timeAgo(first.captured_at)}`;
  const ariaTrend =
    delta > 0 ? `up ${delta} positions since ${timeAgo(first.captured_at)}`
    : delta < 0 ? `down ${-delta} positions since ${timeAgo(first.captured_at)}`
    : `steady since ${timeAgo(first.captured_at)}`;

  const hovered = hover != null ? points[hover] : null;

  return (
    <div className="rounded-lg border border-border/60 bg-gradient-to-br from-muted/40 to-muted/10 p-3" aria-label="Crown rank history timeline">
      <div className="flex items-center justify-between mb-2 gap-2">
        <div className="flex items-center gap-1.5 min-w-0">
          <Sparkles size={12} className="text-primary shrink-0" />
          <span className="text-[11px] uppercase tracking-widest text-muted-foreground font-bold truncate">
            Rank history · {region}
          </span>
        </div>
        <div
          className={`flex items-center gap-1 text-[11px] font-semibold tabular-nums ${trendCls}`}
          aria-label={ariaTrend}
        >
          <Trend size={12} />
          <span>{trendLabel}</span>
        </div>
      </div>

      <svg
        width={W}
        height={H}
        viewBox={`0 0 ${W} ${H}`}
        className="w-full h-14"
        role="img"
        aria-label={`Rank trend ${ariaTrend}`}
        onMouseLeave={() => setHover(null)}
      >
        <defs>
          <linearGradient id="rankAreaGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="hsl(var(--primary))" stopOpacity="0.30" />
            <stop offset="100%" stopColor="hsl(var(--primary))" stopOpacity="0" />
          </linearGradient>
        </defs>
        <path d={areaPath} fill="url(#rankAreaGrad)" />
        <path d={path} fill="none" stroke="hsl(var(--primary))" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
        {points.map((p, i) => {
          const isLast = i === points.length - 1;
          const isHover = hover === i;
          return (
            <g key={i}>
              <circle
                cx={x(i)} cy={y(p.rank)}
                r={isLast || isHover ? 3.5 : 1.8}
                fill="hsl(var(--primary))"
                stroke={isLast ? "hsl(var(--background))" : "transparent"}
                strokeWidth={isLast ? 1.5 : 0}
              />
              {/* Invisible hover hit area */}
              <rect
                x={x(i) - xStep / 2} y={0}
                width={xStep} height={H}
                fill="transparent"
                onMouseEnter={() => setHover(i)}
              >
                <title>{`#${p.rank} — ${timeAgo(p.captured_at)}`}</title>
              </rect>
            </g>
          );
        })}
        {hovered && (
          <line
            x1={x(hover!)} x2={x(hover!)} y1={0} y2={H}
            stroke="hsl(var(--primary))" strokeOpacity="0.3" strokeDasharray="2 2"
          />
        )}
      </svg>

      <div className="flex justify-between items-baseline text-[10px] text-muted-foreground mt-1 tabular-nums">
        <span>#{first.rank} · {timeAgo(first.captured_at)}</span>
        {hovered ? (
          <span className="text-primary font-semibold">
            #{hovered.rank} · {timeAgo(hovered.captured_at)}
          </span>
        ) : (
          <span>now #{last.rank} · {timeAgo(last.captured_at)}</span>
        )}
      </div>
    </div>
  );
}
