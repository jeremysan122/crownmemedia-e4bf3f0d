import { FilterId, overlayClassFor } from "@/lib/filters";

/**
 * Royal Filter overlay layer.
 *
 * Renders a single decorative `div` above the media using the overlay class
 * defined for the chosen filter. All effects are pure CSS (animations live in
 * `index.css`), so React doesn't re-render per frame and scrolling stays
 * butter-smooth. The layer is always `pointer-events-none` so it can never
 * block taps on the underlying photo or video controls.
 *
 * Reduced-motion users see the overlay's static base layer only — see
 * `@media (prefers-reduced-motion: reduce)` rules in `index.css`.
 */
export default function FilterOverlay({ filter }: { filter: FilterId | null | undefined }) {
  const cls = overlayClassFor(filter);
  if (!cls) return null;
  return (
    <div
      aria-hidden="true"
      className={`pointer-events-none absolute inset-0 ${cls}`}
    />
  );
}
