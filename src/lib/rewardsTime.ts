// Time helpers for the /rewards page. Pure functions so they're easy to test.

/** Milliseconds remaining until the next 00:00 UTC rollover. */
export function msUntilUtcMidnight(now: Date | number = Date.now()): number {
  const n = typeof now === "number" ? now : now.getTime();
  const d = new Date(n);
  const next = Date.UTC(
    d.getUTCFullYear(),
    d.getUTCMonth(),
    d.getUTCDate() + 1,
    0, 0, 0, 0,
  );
  return Math.max(0, next - n);
}

/** Format ms as "HHh MMm SSs" or "MMm SSs" when under an hour. */
export function formatCountdown(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const pad = (n: number) => n.toString().padStart(2, "0");
  if (h > 0) return `${h}h ${pad(m)}m ${pad(sec)}s`;
  return `${m}m ${pad(sec)}s`;
}

/** Human-readable "Updated Ns ago" / "Updated Nm ago" / "Updated just now". */
export function formatLastUpdated(updatedAt: number | null, now: number = Date.now()): string {
  if (!updatedAt) return "Never updated";
  const diff = Math.max(0, now - updatedAt);
  const s = Math.floor(diff / 1000);
  if (s < 5) return "Updated just now";
  if (s < 60) return `Updated ${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `Updated ${m}m ago`;
  const h = Math.floor(m / 60);
  return `Updated ${h}h ago`;
}

/** True if the cached UTC date string doesn't match the current UTC date. */
export function isUtcDayStale(cachedDate: string | null, now: Date | number = Date.now()): boolean {
  if (!cachedDate) return true;
  const n = typeof now === "number" ? new Date(now) : now;
  return cachedDate !== n.toISOString().slice(0, 10);
}
