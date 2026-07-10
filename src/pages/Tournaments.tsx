// Wave 5 — Tournaments list page.
// Signed-in creators can view active brackets and start a new one from here.

import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Trophy, Plus } from "lucide-react";
import AppShell from "@/components/AppShell";
import { useSeoMeta } from "@/hooks/useSeoMeta";
import { isFeatureEnabled } from "@/lib/featureFlags";
import { listActiveTournaments, type TournamentRow } from "@/lib/tournaments";
import { Button } from "@/components/ui/button";
import CreateTournamentDialog from "@/components/battles/CreateTournamentDialog";

export default function Tournaments() {
  useSeoMeta({
    title: "Tournaments — CrownMe",
    description: "Single-elimination CrownMe brackets. 4, 8, or 16 battlers. One crown.",
  });

  const [enabled, setEnabled] = useState<boolean | null>(null);
  const [rows, setRows] = useState<TournamentRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [openCreate, setOpenCreate] = useState(false);

  useEffect(() => {
    isFeatureEnabled("live_battles_enabled").then(setEnabled).catch(() => setEnabled(false));
  }, []);

  const refresh = () => {
    setLoading(true);
    listActiveTournaments()
      .then((r) => setRows(r))
      .catch(() => setRows([]))
      .finally(() => setLoading(false));
  };

  useEffect(() => { refresh(); }, []);

  return (
    <AppShell>
      <div className="mx-auto w-full max-w-4xl px-4 sm:px-6 pt-5 pb-24">
        <header className="flex items-start justify-between gap-3 mb-6">
          <div>
            <h1 className="text-2xl font-black flex items-center gap-2">
              <Trophy className="w-6 h-6 text-primary" />
              Tournaments
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
              Single-elimination brackets. Winner advances automatically.
            </p>
          </div>
          {enabled && (
            <Button onClick={() => setOpenCreate(true)} data-testid="create-tournament-btn">
              <Plus className="w-4 h-4 mr-1" /> New
            </Button>
          )}
        </header>

        {enabled === false && (
          <div className="rounded-lg border border-border/60 bg-card p-6 text-center text-sm text-muted-foreground">
            Tournaments aren't available right now.
          </div>
        )}

        {loading ? (
          <div className="text-sm text-muted-foreground">Loading tournaments…</div>
        ) : rows.length === 0 ? (
          <div className="rounded-lg border border-border/60 bg-card p-8 text-center">
            <Trophy className="w-8 h-8 mx-auto text-muted-foreground mb-2" />
            <p className="text-sm font-medium">No tournaments yet.</p>
            <p className="text-xs text-muted-foreground mt-1">
              Start the first one and be the founding champion.
            </p>
          </div>
        ) : (
          <ul className="space-y-2" aria-label="Active tournaments">
            {rows.map((t) => (
              <li key={t.id}>
                <Link
                  to={`/tournaments/${t.id}`}
                  className="block rounded-lg border border-border/60 bg-card px-4 py-3 hover:bg-muted/40 transition"
                  data-testid={`tournament-row-${t.id}`}
                >
                  <div className="flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <div className="font-semibold truncate">{t.title}</div>
                      <div className="text-xs text-muted-foreground mt-0.5">
                        {t.size}-battler bracket · Round {t.current_round}
                        {t.category_slug ? ` · ${t.category_slug}` : ""}
                      </div>
                    </div>
                    <span className="text-xs font-semibold text-primary shrink-0">Open →</span>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        )}

        <CreateTournamentDialog
          open={openCreate}
          onOpenChange={setOpenCreate}
          onCreated={() => { setOpenCreate(false); refresh(); }}
        />
      </div>
    </AppShell>
  );
}
