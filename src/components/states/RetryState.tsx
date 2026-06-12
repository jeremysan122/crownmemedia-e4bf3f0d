// Reusable error/retry panel. Mirrors FeedErrorState's pattern so list
// surfaces (Profile, Shorts, Discover, Map, Battles) get a consistent
// "couldn't load — retry" experience.
import { AlertTriangle, RotateCw } from "lucide-react";

interface Props {
  onRetry: () => void;
  title?: string;
  message?: string;
  retrying?: boolean;
  className?: string;
}

export default function RetryState({
  onRetry,
  title = "Couldn't load right now",
  message = "Check your connection and try again.",
  retrying = false,
  className = "",
}: Props) {
  return (
    <div
      role="alert"
      aria-live="assertive"
      className={`royal-card p-8 text-center mt-6 mx-3 lg:mx-0 border-destructive/40 ${className}`}
    >
      <div className="size-12 mx-auto mb-3 rounded-full bg-destructive/15 text-destructive flex items-center justify-center">
        <AlertTriangle size={22} />
      </div>
      <p className="font-display text-foreground text-lg mb-1">{title}</p>
      <p className="text-sm text-muted-foreground mb-5 max-w-md mx-auto">{message}</p>
      <button
        onClick={onRetry}
        disabled={retrying}
        className="inline-flex items-center gap-1.5 px-5 py-2.5 rounded-full bg-gradient-gold text-primary-foreground font-bold text-sm gold-shadow disabled:opacity-60"
      >
        <RotateCw size={16} className={retrying ? "animate-spin" : ""} /> {retrying ? "Retrying…" : "Retry"}
      </button>
    </div>
  );
}
