import { ReactNode } from "react";

interface StatProps {
  label: string;
  value: ReactNode;
  hint?: string;
  tone?: "default" | "good" | "warn" | "bad";
}

export function StatTile({ label, value, hint, tone = "default" }: StatProps) {
  const toneClass =
    tone === "good"
      ? "text-emerald-400"
      : tone === "warn"
      ? "text-amber-400"
      : tone === "bad"
      ? "text-rose-400"
      : "text-foreground";
  return (
    <div className="rounded-lg border border-border/60 bg-card/40 p-3">
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className={`mt-1 font-display text-2xl ${toneClass}`}>{value}</div>
      {hint ? <div className="text-[10px] text-muted-foreground/80 mt-1">{hint}</div> : null}
    </div>
  );
}

export function SectionCard({
  title,
  action,
  children,
}: {
  title: string;
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="rounded-lg border border-border/60 bg-card/30 p-3 space-y-2">
      <header className="flex items-center justify-between">
        <h2 className="text-[11px] uppercase tracking-wider text-muted-foreground font-mono">
          {title}
        </h2>
        {action}
      </header>
      {children}
    </section>
  );
}

export function EmptyState({ message }: { message: string }) {
  return (
    <div className="py-8 text-center text-xs text-muted-foreground">{message}</div>
  );
}

export function PillBadge({
  children,
  tone = "default",
}: {
  children: ReactNode;
  tone?: "default" | "good" | "warn" | "bad";
}) {
  const cls =
    tone === "good"
      ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/30"
      : tone === "warn"
      ? "bg-amber-500/10 text-amber-400 border-amber-500/30"
      : tone === "bad"
      ? "bg-rose-500/10 text-rose-400 border-rose-500/30"
      : "bg-muted/30 text-muted-foreground border-border/60";
  return (
    <span className={`inline-flex items-center px-1.5 py-0.5 rounded-full text-[10px] uppercase tracking-wider border ${cls}`}>
      {children}
    </span>
  );
}
