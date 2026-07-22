// Pending live-battle invitations for the current user (as opponent) and
// pending challenges they've sent (as host). Both surfaces expose the
// appropriate action (accept/decline vs cancel) and route into /live/:id.
// Each invite shows WHO it's from, with a link to their profile.

import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/context/AuthContext";
import {
  acceptLiveBattle, cancelLiveBattle, declineLiveBattle, liveBattleErrorMessage,
} from "@/lib/liveBattles";
import { humanizeSlug } from "@/lib/textLabels";
import { Button } from "@/components/ui/button";
import { Loader2, Mail, Check, X, Clock } from "lucide-react";
import { toast } from "sonner";
import { Link, useNavigate } from "react-router-dom";

interface Row {
  id: string; host_id: string; opponent_id: string;
  category_slug: string | null; region: string | null;
  duration_seconds: number; created_at: string;
}

interface ProfileLite {
  id: string; username: string | null; profile_photo_url: string | null;
}

export default function PendingInvitesList() {
  const { user } = useAuth();
  const nav = useNavigate();
  const [inbound, setInbound] = useState<Row[] | null>(null);
  const [outbound, setOutbound] = useState<Row[] | null>(null);
  const [profiles, setProfiles] = useState<Record<string, ProfileLite>>({});
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
    const inbRows = (inb.data ?? []) as Row[];
    const outRows = (out.data ?? []) as Row[];
    setInbound(inbRows);
    setOutbound(outRows);

    // Hydrate the "other side" profile for every invite so users can see who
    // challenged them (and who they challenged) before acting.
    const ids = Array.from(new Set([
      ...inbRows.map((r) => r.host_id),
      ...outRows.map((r) => r.opponent_id),
    ]));
    if (ids.length > 0) {
      const { data: pRows } = await supabase
        .from("profiles")
        .select("id, username, profile_photo_url")
        .in("id", ids);
      const map: Record<string, ProfileLite> = {};
      for (const p of (pRows ?? []) as ProfileLite[]) map[p.id] = p;
      setProfiles(map);
    }
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

  const InviteAvatar = ({ p }: { p: ProfileLite | undefined }) => (
    <span className="size-8 rounded-full bg-muted overflow-hidden ring-1 ring-border shrink-0 flex items-center justify-center">
      {p?.profile_photo_url ? (
        <img src={p.profile_photo_url} alt="" className="w-full h-full object-cover" loading="lazy" />
      ) : (
        <span className="text-[10px] font-bold text-muted-foreground">
          {p?.username?.[0]?.toUpperCase() ?? "?"}
        </span>
      )}
    </span>
  );

  const inviteMeta = (r: Row) =>
    `${r.category_slug ? `${humanizeSlug(r.category_slug)} · ` : ""}${Math.round(r.duration_seconds / 60)} min`;

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
            {inbound.map((r) => {
              const host = profiles[r.host_id];
              return (
                <li key={r.id} className="rounded-2xl border border-primary/40 bg-primary/5 p-3">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2.5 flex-1 min-w-0">
                      {host?.username ? (
                        <Link to={`/${host.username}`} aria-label={`View @${host.username}'s profile`}>
                          <InviteAvatar p={host} />
                        </Link>
                      ) : (
                        <InviteAvatar p={host} />
                      )}
                      <button onClick={() => nav(`/live/${r.id}`)} className="text-left flex-1 min-w-0">
                        <p className="text-sm font-semibold truncate">
                          {host?.username ? <>@{host.username} challenged you</> : "You've been challenged"}
                        </p>
                        <p className="text-xs text-muted-foreground truncate">{inviteMeta(r)}</p>
                      </button>
                    </div>
                    <div className="flex gap-2 shrink-0">
                      <Button size="sm" disabled={busy === r.id}
                        onClick={() => run(() => acceptLiveBattle(r.id).then((b) => nav(`/battles/${b.id}/lobby`)), r.id, "Invite accepted — meet in the lobby")}>
                        {busy === r.id ? <Loader2 size={14} className="animate-spin" /> : <><Check size={14} className="mr-1" />Accept</>}
                      </Button>
                      <Button size="sm" variant="outline" disabled={busy === r.id}
                        onClick={() => run(() => declineLiveBattle(r.id), r.id, "Invite declined")}>
                        <X size={14} />
                      </Button>
                    </div>
                  </div>
                </li>
              );
            })}
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
            {outbound.map((r) => {
              const opp = profiles[r.opponent_id];
              return (
                <li key={r.id} className="rounded-2xl border border-border/60 bg-card p-3">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2.5 flex-1 min-w-0">
                      {opp?.username ? (
                        <Link to={`/${opp.username}`} aria-label={`View @${opp.username}'s profile`}>
                          <InviteAvatar p={opp} />
                        </Link>
                      ) : (
                        <InviteAvatar p={opp} />
                      )}
                      <button onClick={() => nav(`/live/${r.id}`)} className="text-left flex-1 min-w-0">
                        <p className="text-sm font-semibold truncate">
                          {opp?.username ? <>Waiting for @{opp.username}</> : "Waiting for accept"}
                        </p>
                        <p className="text-xs text-muted-foreground truncate">{inviteMeta(r)}</p>
                      </button>
                    </div>
                    <Button size="sm" variant="outline" disabled={busy === r.id}
                      onClick={() => run(() => cancelLiveBattle(r.id), r.id, "Invite cancelled")}>
                      {busy === r.id ? <Loader2 size={14} className="animate-spin" /> : "Cancel"}
                    </Button>
                  </div>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </section>
  );
}
