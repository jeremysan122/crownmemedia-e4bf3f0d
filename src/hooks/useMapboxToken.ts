import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

let cached: string | null = null;
let inflight: Promise<string | null> | null = null;

async function fetchToken(): Promise<string | null> {
  if (cached) return cached;
  if (inflight) return inflight;
  inflight = (async () => {
    try {
      const { data, error } = await supabase.functions.invoke("get-mapbox-token");
      if (error || !data?.token) return null;
      cached = data.token as string;
      return cached;
    } catch {
      return null;
    } finally {
      inflight = null;
    }
  })();
  return inflight;
}

export function useMapboxToken() {
  const [token, setToken] = useState<string | null>(cached);
  const [loading, setLoading] = useState(!cached);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (cached) return;
    let alive = true;
    fetchToken().then((t) => {
      if (!alive) return;
      setLoading(false);
      if (!t) setError("Mapbox token unavailable");
      else setToken(t);
    });
    return () => { alive = false; };
  }, []);

  return { token, loading, error };
}
