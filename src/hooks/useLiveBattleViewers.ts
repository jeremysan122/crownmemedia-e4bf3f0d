// Heartbeat + polling for the aggregate live-battle viewer count.
// Keeps the row alive at 20s cadence and refreshes the count every 15s.
// Both hooks no-op when disabled so callers can gate on battle.status === "live".

import { useEffect, useState } from "react";
import { fetchLiveBattleViewerCount, heartbeatLiveBattleViewer } from "@/lib/liveBattles";

export function useLiveBattleViewerCount(battleId: string | null | undefined, enabled: boolean) {
  const [count, setCount] = useState<number | null>(null);
  useEffect(() => {
    if (!battleId || !enabled) return;
    let cancelled = false;
    const tick = async () => {
      try {
        const n = await fetchLiveBattleViewerCount(battleId);
        if (!cancelled) setCount(n);
      } catch { /* silent — count is a nice-to-have */ }
    };
    tick();
    const id = window.setInterval(tick, 15_000);
    return () => { cancelled = true; window.clearInterval(id); };
  }, [battleId, enabled]);
  return count;
}

export function useLiveBattleViewerHeartbeat(battleId: string | null | undefined, enabled: boolean) {
  useEffect(() => {
    if (!battleId || !enabled) return;
    let cancelled = false;
    const beat = () => { if (!cancelled) heartbeatLiveBattleViewer(battleId).catch(() => {}); };
    beat();
    const id = window.setInterval(beat, 20_000);
    return () => { cancelled = true; window.clearInterval(id); };
  }, [battleId, enabled]);
}
