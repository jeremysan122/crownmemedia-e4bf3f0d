import { useEffect, useRef, useState } from "react";

/**
 * Counts down to a target timestamp (ms epoch). Returns remaining seconds
 * (rounded up). When `until` is null or already past, returns 0.
 * Calls `onDone` once when the countdown reaches zero.
 */
export function useCountdown(until: number | null, onDone?: () => void) {
  const [remaining, setRemaining] = useState(() =>
    until ? Math.max(0, Math.ceil((until - Date.now()) / 1000)) : 0,
  );

  // Keep a stable ref so the interval always calls the latest onDone without
  // needing to be recreated every time the parent re-renders with a new callback.
  const onDoneRef = useRef(onDone);

  useEffect(() => {
    onDoneRef.current = onDone;
  });

  useEffect(() => {
    if (!until) {
      setRemaining(0);
      return;
    }

    const tick = () => {
      const r = Math.max(0, Math.ceil((until - Date.now()) / 1000));

      setRemaining(r);

      if (r <= 0) {
        clearInterval(id);
        onDoneRef.current?.();
      }
    };

    const id = setInterval(tick, 250);
    tick();

    return () => clearInterval(id);
  }, [until]);

  return remaining;
}
