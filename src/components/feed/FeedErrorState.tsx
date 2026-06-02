// Inline error panel shown when the Feed query fails — replaces the previous
// "toast then blank screen" UX. Always exposes a retry, plus an escape hatch
// to the Global feed when the user is on a narrow tab/filter.
import { AlertTriangle, RotateCw, Globe2 } from "lucide-react";

interface Props {
  onRetry: () => void;
  onGoGlobal?: () => void;
  message?: string;
}

export default function FeedErrorState({ onRetry, onGoGlobal, message }: Props) {
  return (
    <div
      className="royal-card p-8 text-center mt-6 mx-3 lg:mx-0 border-destructive/40"
      role="alert"
      aria-live="assertive"
    >
      <div className="size-12 mx-auto mb-3 rounded-full bg-destructive/15 text-destructive flex items-center justify-center">
        <AlertTriangle size={22} />
      </div>
      <p className="font-display text-foreground text-lg mb-1">Couldn't load posts right now</p>
      <p className="text-sm text-muted-foreground mb-5 max-w-md mx-auto">
        {message || "Check your connection and try again."}
      </p>
      <div className="flex flex-wrap items-center justify-center gap-2">
        <button
          onClick={onRetry}
          className="inline-flex items-center gap-1.5 px-5 py-2.5 rounded-full bg-gradient-gold text-primary-foreground font-bold text-sm gold-shadow"
        >
          <RotateCw size={16} /> Retry
        </button>
        {onGoGlobal && (
          <button
            onClick={onGoGlobal}
            className="inline-flex items-center gap-1.5 px-5 py-2.5 rounded-full bg-card/80 text-foreground border border-border font-bold text-sm hover:border-primary/40"
          >
            <Globe2 size={16} /> Go to Global feed
          </button>
        )}
      </div>
    </div>
  );
}
