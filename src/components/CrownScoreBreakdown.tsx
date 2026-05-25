import { useState } from "react";
import { Crown, Flame, Gem, MessageCircle, Share2, Swords, Sparkles, Info, Copy, Check } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { formatScore } from "@/lib/crown";
import { toast } from "sonner";

interface Props {
  score: number;
  crown: number;
  fire: number;
  diamond: number;
  comments: number;
  shares: number;
  battleWins: number;
  boostActive?: boolean;
  children: React.ReactNode;
}

/**
 * Public Crown Score breakdown.
 * Mirrors `public.recalc_post_score`:
 *   base = crown*1 + fire*0.5 + diamond*1.5
 *   score = (base + base*(comments*0.01) + shares*0.25 + battle_wins*5) * boost
 */
export default function CrownScoreBreakdown({
  score, crown, fire, diamond, comments, shares, battleWins, boostActive, children,
}: Props) {
  const crownPts = crown * 1;
  const firePts = fire * 0.5;
  const diamondPts = diamond * 1.5;
  const base = crownPts + firePts + diamondPts;
  const commentBonus = base * (comments * 0.01);
  const shareBonus = shares * 0.25;
  const battleBonus = battleWins * 5;
  const subtotal = base + commentBonus + shareBonus + battleBonus;
  const boost = boostActive ? 1.5 : 1;
  const total = subtotal * boost;

  const [copied, setCopied] = useState(false);
  const formulaText =
    `👑 Crown Score Breakdown\n` +
    `• Crown ${crown} × 1.0 = ${crownPts.toFixed(2)}\n` +
    `• Fire  ${fire} × 0.5 = ${firePts.toFixed(2)}\n` +
    `• Diamond ${diamond} × 1.5 = ${diamondPts.toFixed(2)}\n` +
    `Base = ${base.toFixed(2)}\n` +
    `+ Comment bonus (${comments} × 1%) = ${commentBonus.toFixed(2)}\n` +
    `+ Share bonus (${shares} × 0.25) = ${shareBonus.toFixed(2)}\n` +
    `+ Battle wins (${battleWins} × 5) = ${battleBonus.toFixed(2)}\n` +
    (boostActive ? `× Royal Boost ×1.5\n` : ``) +
    `= TOTAL ${total.toFixed(2)}`;

  const onCopy = async () => {
    try {
      await navigator.clipboard.writeText(formulaText);
      setCopied(true);
      toast.success("Formula copied to clipboard");
      setTimeout(() => setCopied(false), 1800);
    } catch {
      toast.error("Couldn't copy — try again");
    }
  };

  const Row = ({
    icon: Icon, label, math, value, color = "text-muted-foreground", emphasize = false,
  }: { icon: any; label: string; math: string; value: string; color?: string; emphasize?: boolean }) => (
    <div className="flex items-start justify-between gap-3 py-1.5">
      <div className="flex items-start gap-2 min-w-0">
        <Icon size={14} className={`${color} mt-0.5 shrink-0`} fill={color === "text-muted-foreground" ? "none" : "currentColor"} />
        <div className="min-w-0">
          <div className="text-xs font-semibold leading-tight">{label}</div>
          <div className="text-[10px] text-muted-foreground tabular-nums">{math}</div>
        </div>
      </div>
      <span className={`text-xs font-bold tabular-nums shrink-0 ${emphasize ? "text-gold" : ""}`}>{value}</span>
    </div>
  );

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button type="button" aria-label="View Crown Score breakdown" className="cursor-help">
          {children}
        </button>
      </PopoverTrigger>
      <PopoverContent
        side="bottom"
        align="start"
        sideOffset={8}
        className="w-80 p-3 royal-card border-primary/30 shadow-2xl"
      >
        {/* Header */}
        <div className="flex items-center justify-between mb-2 pb-2 border-b border-border/60">
          <div className="flex items-center gap-1.5">
            <Crown size={14} className="text-primary" fill="currentColor" />
            <span className="text-[10px] uppercase tracking-widest text-muted-foreground font-bold">
              Crown Score
            </span>
          </div>
          <span className="font-display text-2xl text-gold tabular-nums leading-none">{formatScore(score)}</span>
        </div>

        {/* Vote weights */}
        <div className="text-[10px] uppercase tracking-widest text-muted-foreground font-bold pt-1 pb-0.5">
          Vote points
        </div>
        <Row
          icon={Crown}
          label="Crown votes"
          math={`${crown} × 1.0`}
          value={crownPts.toFixed(2)}
          color="text-amber-500"
        />
        <Row
          icon={Flame}
          label="Fire votes"
          math={`${fire} × 0.5`}
          value={firePts.toFixed(2)}
          color="text-orange-500"
        />
        <Row
          icon={Gem}
          label="Diamond votes"
          math={`${diamond} × 1.5`}
          value={diamondPts.toFixed(2)}
          color="text-cyan-400"
        />
        <div className="flex items-center justify-between pt-1.5 border-t border-border/40">
          <span className="text-[10px] uppercase tracking-widest text-muted-foreground">Base</span>
          <span className="text-xs font-bold tabular-nums">{base.toFixed(2)}</span>
        </div>

        {/* Bonuses */}
        <div className="text-[10px] uppercase tracking-widest text-muted-foreground font-bold pt-3 pb-0.5">
          Bonuses
        </div>
        <Row
          icon={MessageCircle}
          label="Comment bonus"
          math={`base × 0.01 × ${comments} comment${comments === 1 ? "" : "s"}`}
          value={`+${commentBonus.toFixed(2)}`}
        />
        <Row
          icon={Share2}
          label="Share bonus"
          math={`${shares} × 0.25`}
          value={`+${shareBonus.toFixed(2)}`}
        />
        <Row
          icon={Swords}
          label="Battle win bonus"
          math={`${battleWins} × 5.0`}
          value={`+${battleBonus.toFixed(2)}`}
        />

        {/* Boost multiplier */}
        {boostActive ? (
          <>
            <div className="flex items-center justify-between pt-1.5 border-t border-border/40">
              <span className="text-[10px] uppercase tracking-widest text-muted-foreground">Subtotal</span>
              <span className="text-xs font-bold tabular-nums">{subtotal.toFixed(2)}</span>
            </div>
            <Row
              icon={Sparkles}
              label="Royal Boost"
              math="× 1.5 multiplier (active)"
              value={`× 1.5`}
              color="text-primary"
            />
          </>
        ) : null}

        {/* Total */}
        <div className="mt-2 pt-2 border-t border-primary/40 flex items-center justify-between">
          <span className="text-[11px] uppercase tracking-widest font-bold">Total</span>
          <span className="font-display text-lg text-gold tabular-nums">{formatScore(total)}</span>
        </div>

        {/* Exact formula receipt */}
        <div className="mt-2 rounded-md bg-muted/40 px-2 py-1.5 text-[10px] text-muted-foreground tabular-nums leading-relaxed font-mono">
          ({base.toFixed(2)} + {commentBonus.toFixed(2)} + {shareBonus.toFixed(2)} + {battleBonus.toFixed(2)})
          {boostActive ? ` × 1.5` : ""} = <span className="text-gold font-bold">{total.toFixed(2)}</span>
        </div>

        {/* Copy formula */}
        <button
          type="button"
          onClick={onCopy}
          aria-label="Copy formula to clipboard"
          className="mt-2 w-full flex items-center justify-center gap-1.5 rounded-md border border-border bg-muted/40 hover:bg-muted/70 hover:border-primary/40 transition px-2 py-1.5 text-[11px] font-bold tracking-wide"
        >
          {copied ? <Check size={12} className="text-emerald-400" /> : <Copy size={12} />}
          {copied ? "Copied!" : "Copy formula"}
        </button>

        <p className="flex items-start gap-1.5 mt-2 text-[10px] text-muted-foreground leading-snug">
          <Info size={10} className="mt-0.5 shrink-0" />
          <span>Updates in realtime as votes, comments, shares, and battle wins arrive. Dislikes (broken crown) are tracked but do not affect this score.</span>
        </p>
      </PopoverContent>
    </Popover>
  );
}
