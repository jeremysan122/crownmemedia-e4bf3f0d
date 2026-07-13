import { Link } from "react-router-dom";
import { ShieldCheck } from "lucide-react";
import { useRoyalEntitlements } from "@/hooks/useRoyalEntitlements";

interface Props {
  variant?: "rail" | "compact";
  className?: string;
}

/**
 * Shows the caller's Crown Shields/month balance. Hidden entirely when the
 * user has no active Royal Pass so it never appears for non-members.
 */
export default function RoyalShieldBalanceCard({ variant = "rail", className = "" }: Props) {
  const ent = useRoyalEntitlements();
  if (ent.loading || !ent.royal_active) return null;

  const remaining = ent.shields_remaining;
  const total = ent.shields_granted || 5;
  const used = Math.max(0, total - remaining);
  const pct = total > 0 ? Math.min(100, (used / total) * 100) : 0;
  const resets = ent.period_end
    ? new Date(ent.period_end).toLocaleDateString(undefined, { month: "short", day: "numeric" })
    : null;

  if (variant === "compact") {
    return (
      <Link
        to="/royal-pass"
        aria-label={`Crown Shields: ${remaining} of ${total} remaining this month`}
        title={`Crown Shields — ${remaining} of ${total} remaining this month`}
        className={`inline-flex items-center gap-2 pl-2 pr-3 py-1.5 rounded-full bg-gold/10 border border-gold/30 text-gold hover:bg-gold/15 transition ${className}`}
      >
        <span className="size-6 rounded-full bg-gold/20 flex items-center justify-center shrink-0">
          <ShieldCheck size={13} />
        </span>
        <span className="flex flex-col leading-tight">
          <span className="text-[9px] uppercase tracking-[0.14em] opacity-80 font-semibold">
            Crown Shields
          </span>
          <span className="text-[12px] font-bold tabular-nums">
            {remaining}<span className="opacity-60">/{total}</span>
            <span className="ml-1 text-[10px] font-medium opacity-70">this month</span>
          </span>
        </span>
      </Link>
    );
  }

  return (
    <section className={`royal-card p-4 ${className}`}>
      <header className="flex items-center justify-between mb-2">
        <h3 className="font-display text-sm tracking-widest text-gold flex items-center gap-2">
          <ShieldCheck size={14} /> Crown Shields
        </h3>
        <Link to="/royal-pass" className="text-[11px] text-primary hover:underline">Manage</Link>
      </header>
      <div className="flex items-baseline gap-1.5">
        <span className="font-display text-2xl text-gold tabular-nums">{remaining}</span>
        <span className="text-xs text-muted-foreground">/ {total} this month</span>
      </div>
      <div className="mt-2 h-1.5 rounded-full bg-secondary overflow-hidden">
        <div className="h-full bg-gradient-gold" style={{ width: `${pct}%` }} />
      </div>
      <p className="text-[11px] text-muted-foreground mt-2">
        {remaining > 0
          ? "Tap a crowned post's shield to protect it for 24h."
          : "You've used all shields for this month."}
        {resets && <> · Resets {resets}.</>}
      </p>
    </section>
  );
}
