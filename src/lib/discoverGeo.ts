// Helpers for the Discover "People Near You" radius filter.
// All distance math is in miles. No exact user coordinates are persisted or
// sent to analytics — only the selected radius bucket is tracked.

export type RadiusMiles = 5 | 10 | 25 | 50 | 100 | 0; // 0 = "Anywhere"

export const RADIUS_OPTIONS: { value: RadiusMiles; label: string }[] = [
  { value: 5, label: "5 mi" },
  { value: 10, label: "10 mi" },
  { value: 25, label: "25 mi" },
  { value: 50, label: "50 mi" },
  { value: 100, label: "100 mi" },
  { value: 0, label: "Anywhere" },
];

const STORAGE_KEY = "crownme:discover:nearby_radius";
export const DEFAULT_RADIUS: RadiusMiles = 25;

export function loadSavedRadius(): RadiusMiles {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_RADIUS;
    const n = Number(raw);
    if (RADIUS_OPTIONS.some((o) => o.value === n)) return n as RadiusMiles;
  } catch {/* ignore */}
  return DEFAULT_RADIUS;
}

export function saveRadius(r: RadiusMiles): void {
  try { localStorage.setItem(STORAGE_KEY, String(r)); } catch {/* ignore */}
}

const EARTH_MI = 3958.7613;
function toRad(d: number) { return (d * Math.PI) / 180; }

export function haversineMiles(a: [number, number], b: [number, number]): number {
  const dLat = toRad(b[0] - a[0]);
  const dLng = toRad(b[1] - a[1]);
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a[0])) * Math.cos(toRad(b[0])) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_MI * Math.asin(Math.min(1, Math.sqrt(s)));
}

export function withinRadius(
  origin: [number, number] | null,
  target: [number, number] | null,
  radius: RadiusMiles,
): boolean {
  if (radius === 0) return true; // Anywhere
  if (!origin || !target) return true; // Unknown distance — don't hide
  return haversineMiles(origin, target) <= radius;
}
