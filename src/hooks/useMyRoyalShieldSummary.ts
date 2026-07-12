/**
 * Wave 8.2b Stage 2.1 — Authenticated self-service Royal Shield summary.
 *
 * Wraps the SECURITY DEFINER `my_royal_shield_summary` RPC, which aggregates
 * the caller's own rows in the canonical `royal_shield_accounting` view.
 * Users can never see anyone else's balance — the RPC filters by auth.uid()
 * internally and is not executable by anon.
 */
import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";

export type RoyalShieldSummary = {
  shields_granted: number;
  net_spent_credits: number;
  remaining_credits: number;
  active_shield_sessions: number;
  has_drift: boolean;
};

const ZERO: RoyalShieldSummary = {
  shields_granted: 0,
  net_spent_credits: 0,
  remaining_credits: 0,
  active_shield_sessions: 0,
  has_drift: false,
};

export function useMyRoyalShieldSummary() {
  const [data, setData] = useState<RoyalShieldSummary>(ZERO);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    const { data: rows, error: e } = await supabase.rpc("my_royal_shield_summary" as never);
    if (e) {
      setError(e.message);
      setData(ZERO);
    } else {
      const rowsUnknown = rows as unknown;
      const row = (Array.isArray(rowsUnknown) ? rowsUnknown[0] : rowsUnknown) as
        | Partial<RoyalShieldSummary>
        | null
        | undefined;
      if (row) {
        setData({
          shields_granted: Number(row.shields_granted ?? 0),
          net_spent_credits: Number(row.net_spent_credits ?? 0),
          remaining_credits: Number(row.remaining_credits ?? 0),
          active_shield_sessions: Number(row.active_shield_sessions ?? 0),
          has_drift: Boolean(row.has_drift),
        });
      } else {
        setData(ZERO);
      }
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return { data, loading, error, refresh };
}
