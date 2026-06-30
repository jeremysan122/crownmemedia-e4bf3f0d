import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/context/AuthContext";
import { walletStore, type WalletSnapshot } from "@/stores/walletStore";

export type WalletState = WalletSnapshot;

// Module-level dedupe: when multiple components (AppShell + DesktopHeader +
// Wallet page) mount useWallet() at the same time we collapse them into one
// in-flight fetch and one shared snapshot, then broadcast updates via
// walletStore. This stops the duplicate-mount pattern that was driving
// ~81k wallet single-row reads per scan window.
let inflight: Promise<void> | null = null;

export function useWallet() {
  const { user } = useAuth();

  const [wallet, setWallet] = useState<WalletState>(
    () => walletStore.getSnapshot() ?? {
      shekelBalance: 0,
      totalEarned: 0,
      totalSpent: 0,
      loading: true,
    },
  );

  const refreshWallet = useCallback(async () => {
    if (!user) return;
    if (inflight) return inflight;
    inflight = (async () => {
      try {
        let { data } = await supabase
          .from("wallets")
          .select("shekel_balance, total_earned, total_spent")
          .eq("user_id", user.id)
          .maybeSingle();
        if (!data) {
          await supabase.rpc("ensure_my_wallet");
          ({ data } = await supabase
            .from("wallets")
            .select("shekel_balance, total_earned, total_spent")
            .eq("user_id", user.id)
            .maybeSingle());
        }
        const next: WalletState = data
          ? {
              shekelBalance: Number(data.shekel_balance),
              totalEarned: Number(data.total_earned),
              totalSpent: Number(data.total_spent),
              loading: false,
            }
          : { shekelBalance: 0, totalEarned: 0, totalSpent: 0, loading: false };
        walletStore.setSnapshot(next);
        // Broadcast so every other mounted useWallet() updates from cache,
        // without each one re-querying the database.
        walletStore.broadcast(next);
      } finally {
        inflight = null;
      }
    })();
    return inflight;
  }, [user]);

  // Initial load + sync to broadcast updates from other instances.
  useEffect(() => {
    if (!user) {
      setWallet({ shekelBalance: 0, totalEarned: 0, totalSpent: 0, loading: false });
      return;
    }
    // Adopt cached snapshot if present; only fetch if stale or missing.
    const snap = walletStore.getSnapshot();
    if (snap && !snap.loading) {
      setWallet(snap);
    } else {
      refreshWallet();
    }
    // Subscribe to refresh requests AND snapshot pushes from other instances.
    const unsubRefresh = walletStore.subscribe(() => { refreshWallet(); });
    const unsubSnap = walletStore.subscribeSnapshot((s) => setWallet(s));
    return () => { unsubRefresh(); unsubSnap(); };
  }, [user?.id, refreshWallet]);

  // Refresh on focus/visibility (no polling). Wallet changes are also
  // pushed via explicit walletStore.requestRefresh() after purchases,
  // gifts, daily-reward claims, payouts and refunds.
  useEffect(() => {
    if (!user) return;
    const onFocus = () => {
      if (document.visibilityState === "visible") refreshWallet();
    };
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onFocus);
    return () => {
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onFocus);
    };
  }, [user?.id, refreshWallet]);

  const applyDelta = useCallback((shekelDelta: number, spentDelta = 0) => {
    setWallet((w) => {
      const next = {
        ...w,
        shekelBalance: Math.max(0, w.shekelBalance + shekelDelta),
        totalSpent: w.totalSpent + spentDelta,
      };
      walletStore.setSnapshot(next);
      walletStore.broadcast(next);
      return next;
    });
  }, []);

  return { wallet, refreshWallet, applyDelta };
}
