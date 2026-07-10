// Small helper that anchors the client's clock to server time so
// countdown timers don't drift when a device clock is skewed.
//
// The server's `Date:` response header is authoritative and we cache the
// offset (server_ms - client_ms) once per session. The offset only needs
// to be close — millisecond accuracy is unnecessary for MM:SS displays.

import { useEffect, useState } from "react";

let cachedOffsetMs: number | null = null;
let inflight: Promise<number> | null = null;

export async function getServerTimeOffsetMs(): Promise<number> {
  if (cachedOffsetMs !== null) return cachedOffsetMs;
  if (inflight) return inflight;
  const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
  if (!url) {
    cachedOffsetMs = 0;
    return 0;
  }
  inflight = (async () => {
    try {
      const started = Date.now();
      const res = await fetch(`${url}/rest/v1/`, { method: "HEAD", cache: "no-store" });
      const dateHeader = res.headers.get("date");
      const finished = Date.now();
      if (!dateHeader) { cachedOffsetMs = 0; return 0; }
      const serverMs = Date.parse(dateHeader);
      if (!Number.isFinite(serverMs)) { cachedOffsetMs = 0; return 0; }
      // Approximate round-trip midpoint for a tiny bit more accuracy.
      const midClientMs = started + (finished - started) / 2;
      cachedOffsetMs = Math.round(serverMs - midClientMs);
      return cachedOffsetMs;
    } catch {
      cachedOffsetMs = 0;
      return 0;
    } finally {
      inflight = null;
    }
  })();
  return inflight;
}

export function serverNow(): number {
  return Date.now() + (cachedOffsetMs ?? 0);
}

export function useServerTimeOffset(): number | null {
  const [offset, setOffset] = useState<number | null>(cachedOffsetMs);
  useEffect(() => {
    if (offset !== null) return;
    let alive = true;
    getServerTimeOffsetMs().then((v) => { if (alive) setOffset(v); });
    return () => { alive = false; };
  }, [offset]);
  return offset;
}
