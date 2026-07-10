// Shown wherever the Go Live Battle CTA is hidden (feature flag off, or
// the user isn't allowed to start one) so testers understand WHY the
// button isn't there instead of seeing a silent blank space.
import { Radio } from "lucide-react";

interface Props {
  /** Optional override for the copy — defaults to the launch teaser. */
  message?: string;
  /** Compact variant for use inline in headers. */
  compact?: boolean;
}

export default function LiveBattleEmptyState({ message, compact = false }: Props) {
  const body = message ??
    "Real-time 1v1 face-offs with viewer voting and gifts. Unlocking soon — you'll see the button here when it opens.";
  return (
    <div
      data-testid="live-battle-empty-state"
      className={`rounded-2xl border border-dashed border-border/60 bg-muted/20 ${
        compact ? "px-3 py-2" : "p-4"
      }`}
    >
      <div className="flex items-start gap-2">
        <Radio className="text-muted-foreground shrink-0 mt-0.5" size={compact ? 14 : 16} />
        <div className="min-w-0">
          <p className={`font-black uppercase tracking-wider ${compact ? "text-[10px]" : "text-xs"}`}>
            Live Battles
          </p>
          <p className={`text-muted-foreground ${compact ? "text-[11px]" : "text-xs"} mt-0.5`}>
            {body}
          </p>
        </div>
      </div>
    </div>
  );
}
