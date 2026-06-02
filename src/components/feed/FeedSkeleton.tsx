// Skeleton placeholder for Feed — mirrors PostCard layout (avatar row,
// media block, action row, caption lines) so the page doesn't reflow when
// real posts arrive. Honors prefers-reduced-motion by dropping the pulse.
export default function FeedSkeleton({ count = 4 }: { count?: number }) {
  return (
    <div className="space-y-4" aria-busy="true" aria-live="polite" aria-label="Loading feed">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="royal-card overflow-hidden">
          <div className="flex items-center gap-3 p-3">
            <div className="size-10 rounded-full bg-muted motion-safe:animate-pulse" />
            <div className="flex-1 space-y-2">
              <div className="h-3 w-32 rounded bg-muted motion-safe:animate-pulse" />
              <div className="h-2 w-20 rounded bg-muted/60 motion-safe:animate-pulse" />
            </div>
            <div className="h-6 w-14 rounded-full bg-muted/60 motion-safe:animate-pulse" />
          </div>
          <div className="aspect-square bg-muted motion-safe:animate-pulse" />
          <div className="p-3 space-y-2">
            <div className="flex items-center gap-3">
              <div className="h-7 w-16 rounded-full bg-muted/70 motion-safe:animate-pulse" />
              <div className="h-7 w-16 rounded-full bg-muted/70 motion-safe:animate-pulse" />
              <div className="h-7 w-16 rounded-full bg-muted/70 motion-safe:animate-pulse ml-auto" />
            </div>
            <div className="h-3 w-3/4 rounded bg-muted motion-safe:animate-pulse" />
            <div className="h-3 w-1/2 rounded bg-muted/60 motion-safe:animate-pulse" />
          </div>
        </div>
      ))}
    </div>
  );
}
