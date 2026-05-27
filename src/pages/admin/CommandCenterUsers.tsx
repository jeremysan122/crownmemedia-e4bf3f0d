import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { SectionCard, EmptyState, PillBadge } from "@/components/admin/cc/CommandCenterUI";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import { suspendUser, unsuspendUser, issueStrike, grantRole, revokeRole, banUser, unbanUser, type AdminRole } from "@/lib/admin";
import { toast } from "sonner";

const ROLES: AdminRole[] = ["moderator","content_admin","support_admin","finance_admin","security_admin","admin","super_admin"];

type PendingBan = { id: string; banned: boolean };
type PendingStrike = { id: string };

export default function CommandCenterUsers() {
  const [q, setQ] = useState("");
  const [users, setUsers] = useState<any[]>([]);
  const [roles, setRoles] = useState<Record<string, string[]>>({});
  const [loading, setLoading] = useState(false);

  // In-page dialog state — replaces window.confirm / window.prompt
  const [pendingBan, setPendingBan] = useState<PendingBan | null>(null);
  const [banReason, setBanReason] = useState("");
  const [pendingStrike, setPendingStrike] = useState<PendingStrike | null>(null);
  const [strikeReason, setStrikeReason] = useState("");
  const [actionBusy, setActionBusy] = useState(false);

  const search = async () => {
    setLoading(true);
    const term = q.trim();
    const { data } = await supabase.rpc("admin_list_users", {
      _query: term ? term : null,
      _limit: 40,
    });
    setUsers((data as any) ?? []);
    if (data && (data as any[]).length) {
      const ids = (data as any[]).map((u: any) => u.id);
      const { data: rs } = await supabase.from("user_roles").select("user_id, role").in("user_id", ids);
      const map: Record<string, string[]> = {};
      (rs ?? []).forEach((r: any) => { (map[r.user_id] ||= []).push(r.role); });
      setRoles(map);
    } else { setRoles({}); }
    setLoading(false);
  };

  useEffect(() => { search(); }, []);

  const onSuspend = async (id: string, suspended: boolean) => {
    try {
      if (suspended) await unsuspendUser(id); else await suspendUser(id, "Manual admin action");
      toast.success(suspended ? "Unsuspended" : "Suspended");
      search();
    } catch (e: any) { toast.error(e.message ?? "Failed"); }
  };

  // ---- Ban flow ----
  const openBanDialog = (id: string, banned: boolean) => {
    setBanReason("");
    setPendingBan({ id, banned });
  };

  const confirmBan = async () => {
    if (!pendingBan) return;
    const { id, banned } = pendingBan;
    if (!banned && !banReason.trim()) {
      toast.error("Ban reason is required");
      return;
    }
    setActionBusy(true);
    try {
      if (banned) {
        await unbanUser(id);
        toast.success("Unbanned");
      } else {
        await banUser(id, banReason.trim());
        toast.success("Banned");
      }
      setPendingBan(null);
      search();
    } catch (e: any) {
      toast.error(e.message ?? "Failed");
    } finally {
      setActionBusy(false);
    }
  };

  // ---- Strike flow ----
  const openStrikeDialog = (id: string) => {
    setStrikeReason("");
    setPendingStrike({ id });
  };

  const confirmStrike = async () => {
    if (!pendingStrike) return;
    if (!strikeReason.trim()) {
      toast.error("Strike reason is required");
      return;
    }
    setActionBusy(true);
    try {
      await issueStrike(pendingStrike.id, strikeReason.trim(), "minor");
      toast.success("Strike issued");
      setPendingStrike(null);
    } catch (e: any) {
      toast.error(e.message ?? "Failed");
    } finally {
      setActionBusy(false);
    }
  };

  const toggleRole = async (id: string, role: AdminRole) => {
    const has = roles[id]?.includes(role);
    try {
      if (has) await revokeRole(id, role); else await grantRole(id, role);
      toast.success(has ? `Revoked ${role}` : `Granted ${role}`);
      search();
    } catch (e: any) { toast.error(e.message ?? "Failed"); }
  };

  return (
    <div className="space-y-3">
      <SectionCard title="User Search">
        <div className="flex gap-2">
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Username…" onKeyDown={(e) => e.key === "Enter" && search()} className="h-8 text-xs" />
          <Button size="sm" className="h-8" onClick={search} disabled={loading}>Search</Button>
        </div>
      </SectionCard>

      <SectionCard title={`Users (${users.length})`}>
        {users.length === 0 ? <EmptyState message="No users match." /> : (
          <ul className="divide-y divide-border/40">
            {users.map((u) => {
              const ur = roles[u.id] ?? [];
              return (
                <li key={u.id} className="py-2 space-y-1.5">
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-sm truncate flex-1">@{u.username}</span>
                    {u.is_banned ? <PillBadge tone="bad">banned</PillBadge> : (u.is_suspended ? <PillBadge tone="warn">suspended</PillBadge> : null)}
                    <span className="text-[10px] text-muted-foreground">{u.followers_count} fol</span>
                    <span className="text-[10px] text-muted-foreground">{u.city || u.country || "—"}</span>
                  </div>
                  <div className="flex flex-wrap gap-1">
                    {ROLES.map((r) => {
                      const has = ur.includes(r);
                      return (
                        <button
                          key={r}
                          type="button"
                          onClick={() => toggleRole(u.id, r)}
                          className={`text-[10px] px-1.5 py-0.5 rounded border ${has ? "bg-gold/15 border-gold/40 text-gold" : "border-border/60 text-muted-foreground hover:text-foreground"}`}
                        >
                          {r}
                        </button>
                      );
                    })}
                  </div>
                  <div className="flex gap-2">
                    <Button size="sm" variant="outline" className="h-7 text-[10px]" onClick={() => onSuspend(u.id, u.is_suspended)}>
                      {u.is_suspended ? "Unsuspend" : "Suspend"}
                    </Button>
                    <Button size="sm" variant={u.is_banned ? "outline" : "destructive"} className="h-7 text-[10px]" onClick={() => openBanDialog(u.id, u.is_banned)}>
                      {u.is_banned ? "Unban" : "Ban"}
                    </Button>
                    <Button size="sm" variant="outline" className="h-7 text-[10px]" onClick={() => openStrikeDialog(u.id)}>Strike</Button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </SectionCard>

      {/* Ban dialog */}
      <Dialog open={!!pendingBan} onOpenChange={(o) => { if (!o) setPendingBan(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{pendingBan?.banned ? "Unban user" : "Ban user"}</DialogTitle>
            <DialogDescription>
              {pendingBan?.banned
                ? "This will restore the user's access to CrownMe."
                : "Enter a reason for the ban. This will be logged and shown to the user."}
            </DialogDescription>
          </DialogHeader>
          {!pendingBan?.banned && (
            <Input
              autoFocus
              placeholder="Ban reason (required)"
              value={banReason}
              onChange={(e) => setBanReason(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && confirmBan()}
            />
          )}
          <DialogFooter className="gap-2">
            <Button type="button" variant="ghost" onClick={() => setPendingBan(null)} disabled={actionBusy}>Cancel</Button>
            <Button
              type="button"
              variant={pendingBan?.banned ? "outline" : "destructive"}
              onClick={confirmBan}
              disabled={actionBusy || (!pendingBan?.banned && !banReason.trim())}
            >
              {pendingBan?.banned ? "Confirm unban" : "Confirm ban"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Strike dialog */}
      <Dialog open={!!pendingStrike} onOpenChange={(o) => { if (!o) setPendingStrike(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Issue strike</DialogTitle>
            <DialogDescription>Enter a reason for this strike. It will be logged against the user's account.</DialogDescription>
          </DialogHeader>
          <Input
            autoFocus
            placeholder="Strike reason (required)"
            value={strikeReason}
            onChange={(e) => setStrikeReason(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && confirmStrike()}
          />
          <DialogFooter className="gap-2">
            <Button type="button" variant="ghost" onClick={() => setPendingStrike(null)} disabled={actionBusy}>Cancel</Button>
            <Button
              type="button"
              variant="destructive"
              onClick={confirmStrike}
              disabled={actionBusy || !strikeReason.trim()}
            >
              Issue strike
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
