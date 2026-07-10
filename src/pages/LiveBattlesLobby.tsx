import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import AppShell from "@/components/AppShell";
import { useSeoMeta } from "@/hooks/useSeoMeta";
import { supabase } from "@/integrations/supabase/client";
import { isFeatureEnabled } from "@/lib/featureFlags";
import { Radio, ArrowLeft, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";

interface Row {
  id: string;
  status: string;
  host_id: string;
  opponent_id: string;
  host_votes: number;
  opponent_votes: number;
  created_at: string;
}

export default function LiveBattlesLobby() {
  useSeoMeta({
    title: "Live Battles — CrownMe",
    description: "Join live head-to-head battles happening now.",
  });
  const nav = useNavigate();
  const [enabled, setEnabled] = useState<boolean | null>(null);
  const [rows, setRows] = useState<Row[] | null>(null);

  useEffect(() => {
    isFeatureEnabled("live_battles_enabled").then(setEnabled).catch(() => setEnabled(false));
  }, []);

  useEffect(() => {
    if (!enabled) return;
    (async () => {
      const { data } = await supabase
        .from("live_battles")
        .select("id,status,host_id,opponent_id,host_votes,opponent_votes,created_at")
        .in("status", ["live", "pending"])
        .order("created_at", { ascending: false })
        .limit(30);
      setRows((data ?? []) as Row[]);
    })();
  }, [enabled]);

  return (
    <AppShell>
      <div className="mx-auto max-w-lg px-4 pt-4 pb-24">
        <button
          onClick={() => nav("/battles")}
          className="mb-3 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft size={16} /> Back
        </button>
        <h1 className="text-2xl font-black tracking-tight flex items-center gap-2 mb-1">
          <Radio className="text-destructive" size={22} /> Live Battles
        </h1>
        <p className="text-sm text-muted-foreground mb-6">
          Real-time 1v1 head-to-head with audience voting.
        </p>

        {enabled === false && (
          <EmptyState msg="Live battles aren't available yet. Check back soon." />
        )}

        {enabled && rows === null && (
          <div className="flex justify-center py-10 text-muted-foreground">
            <Loader2 className="animate-spin" />
          </div>
        )}

        {enabled && rows && rows.length === 0 && (
          <EmptyState msg="No live battles right now. Start one from a creator's profile." />
        )}

        {enabled && rows && rows.length > 0 && (
          <ul className="space-y-3">
            {rows.map((r) => {
              const total = r.host_votes + r.opponent_votes;
              return (
                <li key={r.id}>
                  <Link
                    to={`/live/${r.id}`}
                    className="block rounded-2xl border border-border/60 bg-card p-4 hover:border-primary/50 transition"
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span
                          className={`inline-block w-2 h-2 rounded-full ${
                            r.status === "live" ? "bg-red-500 animate-pulse" : "bg-muted-foreground"
                          }`}
                        />
                        <span className="text-xs font-bold uppercase tracking-wider">
                          {r.status}
                        </span>
                      </div>
                      <span className="text-xs text-muted-foreground">{total} votes</span>
                    </div>
                    <div className="mt-2 text-sm font-medium">Head-to-head battle</div>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </AppShell>
  );
}

function EmptyState({ msg }: { msg: string }) {
  return (
    <div className="rounded-2xl border border-dashed border-border/60 p-8 text-center">
      <p className="text-sm text-muted-foreground">{msg}</p>
      <Button asChild variant="outline" size="sm" className="mt-4">
        <Link to="/battles/posts">Try Post Battles</Link>
      </Button>
    </div>
  );
}
