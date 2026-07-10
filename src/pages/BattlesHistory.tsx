// Full battle history — merged live + post battles, most recent first.

import { useEffect, useState } from "react";
import AppShell from "@/components/AppShell";
import { useNavigate } from "react-router-dom";
import { useSeoMeta } from "@/hooks/useSeoMeta";
import { ArrowLeft, History, Radio } from "lucide-react";
import { Button } from "@/components/ui/button";
import BattleHistoryList from "@/components/battles/BattleHistoryList";
import CreateLiveBattleDialog from "@/components/battles/CreateLiveBattleDialog";
import LiveBattleEmptyState from "@/components/battles/LiveBattleEmptyState";
import { isFeatureEnabled } from "@/lib/featureFlags";

export default function BattlesHistory() {
  useSeoMeta({ title: "Battle History — CrownMe", description: "Every battle you've fought." });
  const nav = useNavigate();
  const [liveEnabled, setLiveEnabled] = useState<boolean | null>(null);
  const [createOpen, setCreateOpen] = useState(false);

  useEffect(() => {
    isFeatureEnabled("live_battles_enabled").then(setLiveEnabled).catch(() => setLiveEnabled(false));
  }, []);

  return (
    <AppShell>
      <div className="mx-auto max-w-lg px-4 pt-4 pb-24">
        <button onClick={() => nav("/battles")}
          className="mb-3 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft size={16} /> Back
        </button>
        <h1 className="text-2xl font-black tracking-tight flex items-center gap-2 mb-1">
          <History className="text-primary" size={22} /> Battle History
        </h1>
        <p className="text-sm text-muted-foreground mb-4">Every battle you've fought, most recent first.</p>

        {liveEnabled ? (
          <Button
            onClick={() => setCreateOpen(true)}
            className="w-full mb-4 bg-red-500 hover:bg-red-600 text-white"
            data-testid="go-live-cta-history"
          >
            <Radio size={16} className="mr-1.5" /> Start Live Battle
          </Button>
        ) : liveEnabled === false ? (
          <div className="mb-4"><LiveBattleEmptyState compact /></div>
        ) : null}

        <BattleHistoryList />
      </div>
      {liveEnabled && <CreateLiveBattleDialog open={createOpen} onOpenChange={setCreateOpen} />}
    </AppShell>
  );
}
