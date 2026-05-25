import { Lock } from "lucide-react";
import { Tooltip, TooltipContent, TooltipTrigger, TooltipProvider } from "@/components/ui/tooltip";

type HiddenKind = "likes" | "comments" | "views";

const COPY: Record<HiddenKind, string> = {
  likes: "Like count hidden by the author's privacy settings.",
  comments: "Comment count hidden by the author's privacy settings.",
  views: "View count hidden by the author's privacy settings.",
};

/**
 * Small lock icon with a tooltip explaining that the post owner has hidden
 * this engagement count via their privacy settings. Used in feed/list/profile
 * components anywhere a numeric count would normally render.
 */
export default function HiddenCountLock({ kind, size = 10 }: { kind: HiddenKind; size?: number }) {
  const label = COPY[kind];
  return (
    <TooltipProvider delayDuration={150}>
      <Tooltip>
        <TooltipTrigger asChild>
          <span
            role="img"
            aria-label={label}
            tabIndex={0}
            className="inline-flex items-center text-muted-foreground opacity-70 focus:outline-none focus:ring-1 focus:ring-primary/40 rounded"
          >
            <Lock size={size} />
          </span>
        </TooltipTrigger>
        <TooltipContent side="top" className="max-w-[220px] text-[11px] leading-snug">
          {label}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
