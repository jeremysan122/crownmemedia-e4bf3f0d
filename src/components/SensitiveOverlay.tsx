// Wraps post media with a content warning. When sensitive, applies a blur +
// scrim until the viewer chooses to reveal. Reveal is local to this card only
// — refreshing or scrolling away re-blurs. Honors `reduce_motion` via CSS.
//
// Usage:
//   <SensitiveOverlay sensitive={post.is_sensitive} reason={post.sensitive_reason}>
//     <Media ... />
//   </SensitiveOverlay>
import { ReactNode, useState } from "react";
import { Eye, EyeOff } from "lucide-react";

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
        className={`transition-[filter,transform] duration-200 ${revealed ? "" : "blur-2xl scale-105"}`}
        style={{ willChange: "filter" }}
      >
        {children}
      </div>

      {!revealed && (
        <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-3 bg-background/60 backdrop-blur-sm p-4 text-center">
          <div className="flex items-center gap-2 text-foreground">
            <EyeOff size={18} className="text-gold" />
            <span className="font-display text-sm uppercase tracking-widest">Content warning</span>
          </div>
          <p className="text-xs text-muted-foreground max-w-[260px]">
            {reason?.trim()
              ? reason
              : "The author marked this post as sensitive. It may not be suitable for everyone."}
          </p>
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); setRevealed(true); }}
            className="inline-flex items-center gap-1.5 rounded-full bg-gold/90 hover:bg-gold text-background px-3 py-1.5 text-xs font-semibold active:scale-95 transition"
          >
            <Eye size={14} /> View post
          </button>
        </div>
      )}

      {revealed && (
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); setRevealed(false); }}
          className="absolute top-2 right-2 z-10 inline-flex items-center gap-1 rounded-full bg-background/70 backdrop-blur px-2 py-1 text-[10px] font-semibold text-muted-foreground hover:text-foreground"
          aria-label="Re-blur sensitive content"
        >
          <EyeOff size={12} /> Hide
        </button>
      )}
    </div>
  );
}
