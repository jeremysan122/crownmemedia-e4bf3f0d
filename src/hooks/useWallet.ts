import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/context/AuthContext";

export interface WalletState {
  shekelBalance: number;
  totalEarned: number;
  totalSpent: number;
  loading: boolean;
}

export function useWallet() {
  const { user } = useAuth();

  const [wallet, setWallet] = useState<WalletState>({
    shekelBalance: 0,
    totalEarned: 0,
    totalSpent: 0,
    loading: true,
  });

  const refreshWallet = useCallback(async () => {
    if (!user) return;

    const { data } = await supabase
      .from("wallets")
      .select("shekel_balance, total_earned, total_spent")
      .eq("user_id", user.id)
      .maybeSingle();

    if (data) {
      setWallet({
        shekelBalance: Number(data.shekel_balance),
        totalEarned: Number(data.total_earned),
        totalSpent: Number(data.total_spent),
        loading: false,
      });
    } else {
      // Wallet is normally created by the signup trigger; this RPC safely ensures one exists.
      await supabase.rpc("ensure_my_wallet");

      setWallet((w) => ({
        ...w,
        loading: false,
      }));
    }
  }, [user]);

  useEffect(() => {
    refreshWallet();
  }, [refreshWallet]);

  // Realtime: refresh balance when wallet row updates, for example after Stripe webhook credits Shekels.
  useEffect(() => {
    if (!user) return;

    const uid = user.id;
    const channel = supabase.channel(`wallet-${uid}-${Math.random().toString(36).slice(2)}`);

    channel
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "wallets",
          filter: `user_id=eq.${uid}`,
        },
        () => {
          refreshWallet();
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };

    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  // Optimistic local-only adjustment, used for instant feedback before server confirms.
  const applyDelta = useCallback((shekelDelta: number, spentDelta = 0) => {
    setWallet((w) => ({
      ...w,
      shekelBalance: Math.max(0, w.shekelBalance + shekelDelta),
      totalSpent: w.totalSpent + spentDelta,
    }));
  }, []);

  return {
    wallet,
    refreshWallet,
    applyDelta,
  };
}
