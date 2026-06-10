import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

let cached: string | null = null;
let inflight: Promise<string | null> | null = null;
let version = 0;
const listeners = new Set<(t: string | null, v: number) => void>();

async function fetchToken(force = false): Promise<string | null> {
  if (!force && cached) return cached;
  if (inflight) return inflight;
  inflight = (async () => {
    try {
      const { data, error } = await supabase.functions.invoke("get-mapbox-token");
      if (error || !data?.token) {
        cached = null;
        return null;
      }
      cached = data.token as string;
      version += 1;
      listeners.forEach((l) => l(cached, version));
      return cached;
    } catch {
      cached = null;
      return null;
    } finally {
      inflight = null;
    }
  })();
  return inflight;
}

/** Force-invalidate the cached token and refetch (e.g. after a 401/403 from Mapbox). */
export async function refreshMapboxToken(): Promise<string | null> {
  cached = null;
  return fetchToken(true);
}

export function useMapboxToken() {
  const [token, setToken] = useState<string | null>(cached);
  const [v, setV] = useState(version);
  const [loading, setLoading] = useState(!cached);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    const listener = (t: string | null, ver: number) => {
      if (!alive) return;
      setToken(t);
      setV(ver);
      setError(t ? null : "Mapbox token unavailable");
      setLoading(false);
    };
    listeners.add(listener);
    if (!cached) {
      fetchToken().then((t) => {
        if (!alive) return;
        setLoading(false);
        if (!t) setError("Mapbox token unavailable");
        else { setToken(t); setV(version); }
      });
    }
    return () => { alive = false; listeners.delete(listener); };
  }, []);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    const t = await refreshMapboxToken();
    setLoading(false);
    if (!t) setError("Mapbox token unavailable");
    return t;
  }, []);

  return { token, version: v, loading, error, refresh };
}
