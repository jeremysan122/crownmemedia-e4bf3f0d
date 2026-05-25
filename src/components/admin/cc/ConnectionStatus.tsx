import { ReactNode } from "react";

export type RTStatus = "connecting" | "live" | "error" | "retrying" | "offline";

export function ConnectionStatus({ status, label, retryIn }: { status: RTStatus; label?: string; retryIn?: number }) {
  const tone =
    status === "live" ? "bg-emerald-500" :
    status === "connecting" ? "bg-amber-400 animate-pulse" :
    status === "retrying" ? "bg-amber-500 animate-pulse" :
    status === "offline" ? "bg-muted" :
    "bg-rose-500";
  const text =
    status === "live" ? "Live" :
    status === "connecting" ? "Connecting…" :
    status === "retrying" ? `Retrying${retryIn ? ` in ${retryIn}s` : "…"}` :
    status === "offline" ? "Offline" :
    "Error";
  return (
    <span className="inline-flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-muted-foreground">
      <span className={`inline-block h-1.5 w-1.5 rounded-full ${tone}`} />
      {label ? <span className="opacity-60">{label}</span> : null}
      <span>{text}</span>
    </span>
  );
}

export function StatusRow({ children }: { children: ReactNode }) {
  return <div className="flex items-center gap-3 flex-wrap">{children}</div>;
}
