// Full battle history — merged live + post battles, most recent first.

import AppShell from "@/components/AppShell";
import { useNavigate } from "react-router-dom";
import { useSeoMeta } from "@/hooks/useSeoMeta";
import { ArrowLeft, History } from "lucide-react";
import BattleHistoryList from "@/components/battles/BattleHistoryList";

export default function BattlesHistory() {
  useSeoMeta({ title: "Battle History — CrownMe", description: "Every battle you've fought." });
  const nav = useNavigate();
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
        <BattleHistoryList />
      </div>
    </AppShell>
  );
}
