import * as React from "react";

/**
 * True when viewport width is below the desktop breakpoint (1024px).
 * Used to gate the universal mobile/tablet comments popup.
 */
const DESKTOP_BREAKPOINT = 1024;

export function useIsBelowDesktop() {
  const [below, setBelow] = React.useState<boolean>(() =>
    typeof window !== "undefined" ? window.innerWidth < DESKTOP_BREAKPOINT : false,
  );

  React.useEffect(() => {
    const mql = window.matchMedia(`(max-width: ${DESKTOP_BREAKPOINT - 1}px)`);
    const onChange = () => setBelow(window.innerWidth < DESKTOP_BREAKPOINT);
    mql.addEventListener("change", onChange);
    onChange();
    return () => mql.removeEventListener("change", onChange);
  }, []);

  return below;
}
