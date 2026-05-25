import { useEffect } from "react";

/**
 * Workaround for a well-known Radix bug where `body { pointer-events: none }`
 * can be left applied after a DropdownMenu / Dialog closes (especially when a
 * menu opens a dialog), causing the entire UI to stop responding to clicks.
 *
 * We observe body style mutations and clear `pointer-events: none` whenever
 * there's no Radix overlay still open.
 */
export default function PointerEventsGuard() {
  useEffect(() => {
    if (typeof document === "undefined") return;
    const body = document.body;

    const clearIfSafe = () => {
      if (body.style.pointerEvents !== "none") return;
      const hasOpenOverlay = document.querySelector(
        '[data-state="open"][role="dialog"], [data-state="open"][role="menu"], [data-radix-popper-content-wrapper] [data-state="open"]'
      );
      if (!hasOpenOverlay) body.style.pointerEvents = "";
    };

    const observer = new MutationObserver(clearIfSafe);
    observer.observe(body, { attributes: true, attributeFilter: ["style"] });
    // Also sweep after route changes / clicks
    const interval = window.setInterval(clearIfSafe, 1000);
    return () => {
      observer.disconnect();
      window.clearInterval(interval);
    };
  }, []);

  return null;
}
