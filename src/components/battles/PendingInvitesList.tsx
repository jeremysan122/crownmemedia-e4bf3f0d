// Pending live-battle invitations for the current user (as opponent) and
// pending challenges they've sent (as host). Both surfaces expose the
// appropriate action (accept/decline vs cancel) and route into /live/:id.

import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/context/AuthContext";
import {
  acceptLiveBattle, cancelLiveBattle, declineLiveBattle, liveBattleErrorMessage,
} from "@/lib/liveBattles";
import { Button } from "@/components/ui/button";
import { Loader2, Mail, Check, X, Clock } from "lucide-react";
import { toast } from "sonner";
import { useNavigate } from "react-router-dom";

interface Row {
  id: string; host_id: string; opponent_id: string;
  category_slug: string | null; region: string | null;
  duration_seconds: number; created_at: string;
}

export default function PendingInvitesList() {
  const { user } = useAuth();
  const nav = useNavigate();
  const [inbound, setInbound] = useState<Row[] | null>(null);
  const [outbound, setOutbound] = useState<Row[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const reload = async () => {
    if (!user?.id) return;
    const [inb, out] = await Promise.all([
      supabase.from("live_battles")
        .select("id,host_id,opponent_id,category_slug,region,duration_seconds,created_at")
        .eq("opponent_id", user.id).eq("status", "pending")
        .order("created_at", { ascending: false }).limit(10),
      supabase.from("live_battles")
        .select("id,host_id,opponent_id,category_slug,region,duration_seconds,created_at")
        .eq("host_id", user.id).eq("status", "pending")
        .order("created_at", { ascending: false }).limit(10),
    ]);
    setInbound((inb.data ?? []) as Row[]);
    setOutbound((out.data ?? []) as Row[]);
  };

  useEffect(() => { reload(); /* eslint-disable-next-line */ }, [user?.id]);

  useEffect(() => {
    if (!user?.id) return;
    const ch = supabase
      .channel(`pending_invites:${user.id}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "live_battles" }, reload)
      .subscribe();
    return () => { supabase.removeChannel(ch); };
    // eslint-disable-next-line
  }, [user?.id]);

  const run = async (fn: () => Promise<unknown>, id: string, msg: string) => {
    setBusy(id);
    try { await fn(); toast.success(msg); await reload(); }
    catch (e) { toast.error(liveBattleErrorMessage(e, "That didn't work. Try again.")); }
    finally { setBusy(null); }
  };

  if (inbound === null || outbound === null) return null;
  if (inbound.length === 0 && outbound.length === 0) return null;

  return (
    <section className="mb-6 space-y-4">
      {inbound.length > 0 && (
        <div>
          <div className="mb-2 flex items-center gap-2">
            <Mail size={14} className="text-primary" />
            <h2 className="text-xs font-bold uppercase tracking-wider">Invitations</h2>
          </div>
          <ul className="space-y-2">
            {inbound.map((r) => (
              <li key={r.id} className="rounded-2xl border border-primary/40 bg-primary/5 p-3">
                <div className="flex items-center justify-between gap-2">
                  <button onClick={() => nav(`/live/${r.id}`)} className="text-left flex-1 min-w-0">
                    <p className="text-sm font-semibold">You've been challenged</p>
                    <p className="text-xs text-muted-foreground truncate">
                      {r.category_slug ? `${r.category_slug} · ` : ""}{Math.round(r.duration_seconds / 60)} min
                    </p>
                  </button>
                  <div className="flex gap-2 shrink-0">
                    <Button size="sm" disabled={busy === r.id}
                      onClick={() => run(() => acceptLiveBattle(r.id).then((b) => nav(`/live/${b.id}`)), r.id, "Invite accepted")}>
                      {busy === r.id ? <Loader2 size={14} className="animate-spin" /> : <><Check size={14} className="mr-1" />Accept</>}
                    </Button>
                    <Button size="sm" variant="outline" disabled={busy === r.id}
                      onClick={() => run(() => declineLiveBattle(r.id), r.id, "Invite declined")}>
                      <X size={14} />
                    </Button>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}

      {outbound.length > 0 && (
        <div>
          <div className="mb-2 flex items-center gap-2">
            <Clock size={14} className="text-muted-foreground" />
            <h2 className="text-xs font-bold uppercase tracking-wider">Waiting on opponent</h2>
          </div>
          <ul className="space-y-2">
            {outbound.map((r) => (
              <li key={r.id} className="rounded-2xl border border-border/60 bg-card p-3">
                <div className="flex items-center justify-between gap-2">
                  <button onClick={() => nav(`/live/${r.id}`)} className="text-left flex-1 min-w-0">
                    <p className="text-sm font-semibold">Waiting for accept</p>
                    <p className="text-xs text-muted-foreground truncate">
                      {r.category_slug ? `${r.category_slug} · ` : ""}{Math.round(r.duration_seconds / 60)} min
                    </p>
                  </button>
                  <Button size="sm" variant="outline" disabled={busy === r.id}
                    onClick={() => run(() => cancelLiveBattle(r.id), r.id, "Invite cancelled")}>
                    {busy === r.id ? <Loader2 size={14} className="animate-spin" /> : "Cancel"}
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
