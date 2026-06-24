import { cn } from "@/lib/utils";

/**
 * RoyalSkeleton — premium gold-shimmer loader.
 * Respects `prefers-reduced-motion` (falls back to plain pulse).
 */
export function RoyalSkeleton({
  className,
  rounded = "rounded-md",
  ...props
}: React.HTMLAttributes<HTMLDivElement> & { rounded?: string }) {
  return (
    <div
      className={cn("relative overflow-hidden bg-muted/40 royal-shimmer", rounded, className)}
      {...props}
    />
  );
}

/** Battle list card skeleton — matches the dual-image VS layout. */
export function RoyalBattleCardSkeleton() {
  return (
    <div className="royal-card overflow-hidden border border-border/40">
      <div className="grid grid-cols-2 gap-px bg-border/40">
        <RoyalSkeleton rounded="rounded-none" className="aspect-square" />
        <RoyalSkeleton rounded="rounded-none" className="aspect-square" />
      </div>
      <RoyalSkeleton rounded="rounded-none" className="h-2" />
      <div className="p-3 space-y-2">
        <RoyalSkeleton className="h-3 w-2/3" />
        <RoyalSkeleton className="h-2 w-1/3" />
      </div>
    </div>
  );
}

/** Square thumbnail skeleton — for post-picker grids in dialogs. */
export function RoyalThumbSkeleton({ className }: { className?: string }) {
  return <RoyalSkeleton className={cn("aspect-square", className)} rounded="rounded-md" />;
}
