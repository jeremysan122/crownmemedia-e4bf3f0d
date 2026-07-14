import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/context/AuthContext";

export interface RoyalPassReversalRow {
  id: string;
  event_kind: string;
  stripe_event_type: string | null;
  reason: string | null;
  shields_delta: number;
  shekels_delta: number;
  boost_tokens_delta: number;
  active_shields_delta: number;
  founder_touched: boolean;
  created_at: string;
}

/**
 * Member-facing view of their own Royal Pass billing incidents
 * (disputes, chargebacks, reversals). Powered by the
 * "Users view their own royal reversals" RLS policy.
 */
export function useMyRoyalPassReversals() {
  const { user } = useAuth();
  const [rows, setRows] = useState<RoyalPassReversalRow[]>([]);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    if (!user) { setRows([]); setLoading(false); return; }
    setLoading(true);
    const { data } = await supabase
      .from("royal_pass_reversals")
      .select(
        "id, event_kind, stripe_event_type, reason, shields_delta, shekels_delta, boost_tokens_delta, active_shields_delta, founder_touched, created_at",
      )
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(30);
    setRows((data as RoyalPassReversalRow[]) ?? []);
    setLoading(false);
  }, [user?.id]);

  useEffect(() => { void refresh(); }, [refresh]);

  return { rows, loading, refresh };
}
