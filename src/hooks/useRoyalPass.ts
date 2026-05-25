import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/context/AuthContext";

export interface RoyalPassState {
  active: boolean;
  status: string | null;
  currentPeriodEnd: string | null;
  cancelAtPeriodEnd: boolean;
  planId: string | null;
  loading: boolean;
}

const INITIAL: RoyalPassState = {
  active: false,
  status: null,
  currentPeriodEnd: null,
  cancelAtPeriodEnd: false,
  planId: null,
  loading: true,
};

export function useRoyalPass(): RoyalPassState & { refresh: () => Promise<void> } {
  const { user } = useAuth();
  const [state, setState] = useState<RoyalPassState>(INITIAL);

  const load = async () => {
    if (!user) {
      setState({ ...INITIAL, loading: false });
      return;
    }
    const { data } = await supabase
      .from("royal_pass_subscriptions")
      .select("status, current_period_end, cancel_at_period_end, plan_id")
      .eq("user_id", user.id)
      .maybeSingle();

    if (!data) {
      setState({ ...INITIAL, loading: false });
      return;
    }

    const notExpired =
      !data.current_period_end || new Date(data.current_period_end).getTime() > Date.now();
    const active = (data.status === "active" || data.status === "trialing") && notExpired;

    setState({
      active,
      status: data.status,
      currentPeriodEnd: data.current_period_end,
      cancelAtPeriodEnd: !!data.cancel_at_period_end,
      planId: data.plan_id,
      loading: false,
    });
  };

  useEffect(() => {
    load();
    if (!user) return;
    const ch = supabase
      .channel(`royal-pass-${user.id}-${crypto.randomUUID()}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "royal_pass_subscriptions",
          filter: `user_id=eq.${user.id}`,
        },
        () => load(),
      )
      .subscribe();

    // Re-check entitlement when the tab regains focus / becomes visible
    // (covers the case where the webhook updated the row while the tab was inactive)
    const onFocus = () => { load(); };
    const onVisible = () => { if (document.visibilityState === "visible") load(); };
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onVisible);

    return () => {
      supabase.removeChannel(ch);
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onVisible);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  return { ...state, refresh: load };
}
