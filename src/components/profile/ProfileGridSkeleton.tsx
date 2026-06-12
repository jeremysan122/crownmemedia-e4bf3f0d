// Skeleton placeholder for Profile post / scroll grids — keeps grid metrics
// stable while real thumbnails load, preventing layout shift when the user
// navigates back from a post detail.
export default function ProfileGridSkeleton({ count = 9 }: { count?: number }) {
  return (
    <div
      className="grid grid-cols-3 gap-1 sm:gap-2"
      aria-busy="true"
      aria-live="polite"
      aria-label="Loading content"
    >
      {Array.from({ length: count }).map((_, i) => (
        <div
          key={i}
          className="aspect-square rounded-md bg-muted motion-safe:animate-pulse"
        />
      ))}
    </div>
  );
}
