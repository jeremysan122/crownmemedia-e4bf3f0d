import { useEffect, useRef, useState } from "react";

/**
 * Smoothly tween a numeric value from its previous render value to the
 * target over `duration` ms. Uses requestAnimationFrame for buttery 60fps
 * interpolation so optimistic Crown Score bumps feel instant *and* fluid.
 *
 * - First mount = no animation (returns target immediately).
 * - Subsequent target changes animate from the current displayed value.
 */
export function useAnimatedNumber(target: number, duration = 600): number {
  const [display, setDisplay] = useState(target);
  const fromRef = useRef(target);
  const startRef = useRef<number | null>(null);
  const rafRef = useRef<number | null>(null);
  const lastTargetRef = useRef(target);

  useEffect(() => {
    if (target === lastTargetRef.current) return;
    fromRef.current = display;
    lastTargetRef.current = target;
    startRef.current = null;

    const tick = (t: number) => {
      if (startRef.current == null) startRef.current = t;
      const elapsed = t - startRef.current;
      const p = Math.min(1, elapsed / duration);
      const eased = 1 - Math.pow(1 - p, 3); // easeOutCubic
      const next = fromRef.current + (target - fromRef.current) * eased;
      setDisplay(next);
      if (p < 1) {
        rafRef.current = requestAnimationFrame(tick);
      } else {
        rafRef.current = null;
      }
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => {
      if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target, duration]);

  return display;
}
