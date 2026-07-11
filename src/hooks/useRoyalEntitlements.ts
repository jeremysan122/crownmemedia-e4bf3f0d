import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/context/AuthContext";

export interface RoyalEntitlements {
  royal_active: boolean;
  shields_remaining: number;
  shields_granted: number;
  shields_used: number;
  period_end: string | null;
  boost_tokens: number;
  is_founder: boolean;
  founder_title: string | null;
  royal_frame_variant: string | null;
}

const EMPTY: RoyalEntitlements = {
  royal_active: false,
  shields_remaining: 0,
  shields_granted: 0,
  shields_used: 0,
  period_end: null,
  boost_tokens: 0,
  is_founder: false,
  founder_title: null,
  royal_frame_variant: null,
};

export function useRoyalEntitlements() {
  const { user } = useAuth();
  const [data, setData] = useState<RoyalEntitlements>(EMPTY);
  const [loading, setLoading] = useState<boolean>(true);

  const load = useCallback(async () => {
    if (!user) { setData(EMPTY); setLoading(false); return; }
    setLoading(true);
    const { data: res, error } = await (supabase as any).rpc("royal_entitlements");
    if (!error && res && typeof res === "object") {
      setData({ ...EMPTY, ...(res as RoyalEntitlements) });
    }
    setLoading(false);
  }, [user]);

  useEffect(() => { load(); }, [load]);

  return { ...data, loading, refresh: load };
}

export interface FounderStatus {
  active: boolean;
  remaining: number;
  cap: number;
  granted: number;
  end_at: string | null;
  title: string | null;
}

export function useFounderStatus() {
  const [status, setStatus] = useState<FounderStatus | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data } = await (supabase as any).rpc("founder_program_public_status");
      if (!cancelled) {
        setStatus((data as FounderStatus) ?? null);
        setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  return { status, loading };
}
