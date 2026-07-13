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

const ZERO: RoyalEntitlements = {
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
  const [data, setData] = useState<RoyalEntitlements>(ZERO);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    if (!user) {
      setData(ZERO);
      setLoading(false);
      return;
    }
    setLoading(true);
    const { data: row, error } = await (supabase as any).rpc("royal_entitlements");
    if (!error && row && typeof row === "object" && !("error" in row)) {
      setData({
        royal_active: !!row.royal_active,
        shields_remaining: Number(row.shields_remaining ?? 0),
        shields_granted: Number(row.shields_granted ?? 0),
        shields_used: Number(row.shields_used ?? 0),
        period_end: row.period_end ?? null,
        boost_tokens: Number(row.boost_tokens ?? 0),
        is_founder: !!row.is_founder,
        founder_title: row.founder_title ?? null,
        royal_frame_variant: row.royal_frame_variant ?? null,
      });
    } else {
      setData(ZERO);
    }
    setLoading(false);
  }, [user?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    void refresh();
    if (!user) return;
    const onFocus = () => { void refresh(); };
    const onVisible = () => { if (document.visibilityState === "visible") void refresh(); };
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onVisible);

    const ch = supabase
      .channel(`royal-entitlements-${user.id}-${crypto.randomUUID()}`)
      .on("postgres_changes", {
        event: "*", schema: "public", table: "profiles",
        filter: `id=eq.${user.id}`,
      }, () => { void refresh(); })
      .on("postgres_changes", {
        event: "*", schema: "public", table: "royal_pass_shield_allowances",
        filter: `user_id=eq.${user.id}`,
      }, () => { void refresh(); })
      .on("postgres_changes", {
        event: "*", schema: "public", table: "royal_pass_subscriptions",
        filter: `user_id=eq.${user.id}`,
      }, () => { void refresh(); })
      .subscribe();

    return () => {
      supabase.removeChannel(ch);
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [user?.id, refresh]);

  return { ...data, loading, refresh };
}

export interface FounderStatus {
  active: boolean;
  granted: number;
  cap: number;
  remaining: number;
  end_at: string | null;
  title: string | null;
}

/** Public founder-program status via founder_program_public_status(). */
export function useFounderStatus() {
  const [status, setStatus] = useState<FounderStatus | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    setLoading(true);
    const { data, error } = await (supabase as any).rpc("founder_program_public_status");
    if (!error && data && typeof data === "object") {
      setStatus({
        active: !!data.active,
        granted: Number(data.granted ?? 0),
        cap: Number(data.cap ?? 0),
        remaining: Number(data.remaining ?? 0),
        end_at: data.end_at ?? null,
        title: data.title ?? null,
      });
    } else {
      setStatus(null);
    }
    setLoading(false);
  }, []);

  useEffect(() => { void refresh(); }, [refresh]);

  return { status, loading, refresh };
}

