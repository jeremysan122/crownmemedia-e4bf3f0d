/**
 * Lightweight haptic feedback helper. Falls back silently when the browser
 * doesn't support the Vibration API (most desktops, iOS Safari).
 */
type Pattern = "light" | "medium" | "success" | "warning" | "error";

const PATTERNS: Record<Pattern, number | number[]> = {
  light: 10,
  medium: 18,
  success: [10, 40, 16],
  warning: [12, 30, 12, 30],
  error: [25, 50, 25],
};

export function haptic(pattern: Pattern = "light") {
  try {
    if (typeof navigator !== "undefined" && "vibrate" in navigator) {
      navigator.vibrate(PATTERNS[pattern]);
    }
  } catch {
    /* noop */
  }
}
