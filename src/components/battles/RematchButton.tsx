// Wave 5 — "Rematch" CTA on the results screen. Creates a new pending
// live_battles row with the same opponent, category, region, and duration.
// Navigates to the new battle so the caller (host of the rematch) can
// join / share it.

import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Loader2, Swords } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { liveBattleErrorMessage, type LiveBattleRow } from "@/lib/liveBattles";

interface Props {
  battleId: string;
  className?: string;
}

async function createRematch(battleId: string): Promise<LiveBattleRow> {
  const { data, error } = await supabase.rpc("create_rematch" as never, {
    _battle_id: battleId,
  } as never);
  if (error) throw error;
  return data as unknown as LiveBattleRow;
}

export default function RematchButton({ battleId, className }: Props) {
  const nav = useNavigate();
  const [busy, setBusy] = useState(false);

  const onClick = async () => {
    setBusy(true);
    try {
      const b = await createRematch(battleId);
      toast({ title: "Rematch created", description: "Sent the challenge — get ready!" });
      nav(`/live/${b.id}`);
    } catch (e) {
      toast({
        title: liveBattleErrorMessage(e, "Couldn't create a rematch. Please try again."),
        variant: "destructive",
      });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Button
      type="button"
      onClick={onClick}
      disabled={busy}
      className={className}
      data-testid="rematch-button"
    >
      {busy ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Swords className="w-4 h-4 mr-2" />}
      Rematch
    </Button>
  );
}
