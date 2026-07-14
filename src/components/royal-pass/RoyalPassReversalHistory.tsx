import { AlertTriangle, Loader2, ShieldOff, History } from "lucide-react";
import { useMyRoyalPassReversals, type RoyalPassReversalRow } from "@/hooks/useMyRoyalPassReversals";

function labelFor(r: RoyalPassReversalRow): string {
  const t = r.stripe_event_type || r.event_kind;
  if (t.includes("dispute.created")) return "Chargeback opened";
  if (t.includes("dispute.closed")) return "Chargeback closed";
  if (t.includes("dispute")) return "Dispute update";
  if (t.includes("refund")) return "Refund issued";
  if (r.event_kind === "reversal") return "Billing reversal";
  return "Billing incident";
}

function toneFor(r: RoyalPassReversalRow): string {
  const t = (r.stripe_event_type || r.event_kind).toLowerCase();
  if (t.includes("dispute.created") || t.includes("chargeback")) return "text-destructive";
  return "text-amber-500";
}

export default function RoyalPassReversalHistory() {
  const { rows, loading } = useMyRoyalPassReversals();
  if (loading) {
    return (
      <div className="royal-card p-4 flex items-center justify-center text-muted-foreground text-xs">
        <Loader2 size={14} className="animate-spin mr-2" /> Loading billing incidents…
      </div>
    );
  }
  if (rows.length === 0) return null;

  return (
    <div className="royal-card p-4 space-y-3" data-testid="royal-pass-reversal-history">
      <h2 className="font-display text-sm tracking-widest text-gold flex items-center gap-2">
        <History size={14} /> Billing incidents
      </h2>
      <ul className="divide-y divide-border/50">
        {rows.map((r) => {
          const dt = new Date(r.created_at);
          const changes: string[] = [];
          if (r.shields_delta) changes.push(`${r.shields_delta > 0 ? "+" : ""}${r.shields_delta} shields`);
          if (r.shekels_delta) changes.push(`${r.shekels_delta > 0 ? "+" : ""}${r.shekels_delta} shekels`);
          if (r.boost_tokens_delta) changes.push(`${r.boost_tokens_delta > 0 ? "+" : ""}${r.boost_tokens_delta} boosts`);
          if (r.founder_touched) changes.push("founder perks affected");
          return (
            <li key={r.id} className="py-2 flex items-start gap-3 text-xs">
              <div className={`size-7 rounded-lg flex items-center justify-center shrink-0 bg-amber-500/10 ${toneFor(r)}`}>
                {r.founder_touched ? <ShieldOff size={12} /> : <AlertTriangle size={12} />}
              </div>
              <div className="flex-1 min-w-0">
                <div className={`font-semibold ${toneFor(r)}`}>{labelFor(r)}</div>
                <div className="text-[10px] text-muted-foreground">
                  {dt.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })}
                  {" · "}
                  {dt.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })}
                </div>
                {r.reason && <div className="text-[11px] text-muted-foreground mt-0.5 truncate">{r.reason}</div>}
                {changes.length > 0 && (
                  <div className="text-[10px] text-muted-foreground mt-0.5">Adjustments: {changes.join(" · ")}</div>
                )}
              </div>
            </li>
          );
        })}
      </ul>
      <p className="text-[10px] text-muted-foreground">
        Questions about a charge? Reach support and we'll walk through the adjustment with you.
      </p>
    </div>
  );
}
