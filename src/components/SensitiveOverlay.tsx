// Wraps post media with a content warning. When sensitive, applies a blur +
// scrim until the viewer chooses to reveal. Reveal is local to this card only
// — refreshing or scrolling away re-blurs. Honors `reduce_motion` via CSS.
import { ReactNode, useState } from "react";
import { Eye, EyeOff, ShieldAlert } from "lucide-react";

interface Props {
  sensitive: boolean;
  reason?: string | null;
  children: ReactNode;
  /** When true, render the children but never blur (e.g. user pref = "show"). */
  forceShow?: boolean;
}

export default function SensitiveOverlay({ sensitive, reason, children, forceShow }: Props) {
  const [revealed, setRevealed] = useState(false);

  if (!sensitive || forceShow) return <>{children}</>;

  return (
    <div className="relative isolate overflow-hidden rounded-[inherit]">
      <div
        aria-hidden={!revealed}
        className={`transition-[filter,transform] duration-300 ${revealed ? "" : "blur-2xl scale-110"}`}
        style={{ willChange: "filter" }}
      >
        {children}
      </div>

      {!revealed && (
        <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-4 p-6 text-center bg-gradient-to-b from-background/70 via-background/80 to-background/90 backdrop-blur-md">
          {/* Decorative gold ring icon */}
          <div className="relative">
            <div className="absolute inset-0 rounded-full bg-gold/20 blur-xl animate-pulse" aria-hidden />
            <div className="relative size-14 rounded-full bg-background/80 border border-gold/40 flex items-center justify-center shadow-[0_0_24px_-4px_hsl(var(--gold)/0.5)]">
              <ShieldAlert size={22} className="text-gold" />
            </div>
          </div>

          <div className="space-y-1.5 max-w-[280px]">
            <p className="font-display text-sm uppercase tracking-[0.25em] text-gold">
              Content Warning
            </p>
            <p className="text-[13px] leading-relaxed text-foreground/80">
              {reason?.trim()
                ? reason
                : "The author marked this post as sensitive. It may not be suitable for everyone."}
            </p>
          </div>

          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); setRevealed(true); }}
            className="group inline-flex items-center gap-2 rounded-full bg-gradient-to-r from-gold to-gold/80 hover:from-gold hover:to-gold text-background px-5 py-2 text-xs font-bold uppercase tracking-wider shadow-[0_4px_20px_-4px_hsl(var(--gold)/0.6)] active:scale-95 transition-all duration-200"
          >
            <Eye size={14} className="transition-transform group-hover:scale-110" />
            View Post
          </button>

          <p className="text-[10px] text-muted-foreground/70 max-w-[240px]">
            You can change how sensitive content is shown in Settings.
          </p>
        </div>
      )}

      {revealed && (
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); setRevealed(false); }}
          className="absolute top-2 right-2 z-10 inline-flex items-center gap-1 rounded-full bg-background/80 backdrop-blur-md border border-border/60 px-2.5 py-1 text-[10px] font-semibold text-muted-foreground hover:text-gold hover:border-gold/40 transition-colors"
          aria-label="Re-blur sensitive content"
        >
          <EyeOff size={12} /> Hide
        </button>
      )}
    </div>
  );
}
