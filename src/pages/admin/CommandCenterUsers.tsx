import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { SectionCard, EmptyState, PillBadge } from "@/components/admin/cc/CommandCenterUI";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { suspendUser, unsuspendUser, issueStrike, grantRole, revokeRole, banUser, unbanUser, type AdminRole } from "@/lib/admin";
import { toast } from "sonner";

const ROLES: AdminRole[] = ["moderator","content_admin","support_admin","finance_admin","security_admin","admin","super_admin"];

export default function CommandCenterUsers() {
  const [q, setQ] = useState("");
  const [users, setUsers] = useState<any[]>([]);
  const [roles, setRoles] = useState<Record<string, string[]>>({});
  const [loading, setLoading] = useState(false);

  const search = async () => {
    setLoading(true);
    const term = q.trim();
    let query = supabase.from("profiles").select("id, username, city, country, is_suspended, is_banned, banned_reason, followers_count, created_at").order("created_at", { ascending: false }).limit(40);
    if (term) query = query.ilike("username", `%${term}%`);
    const { data } = await query;
    setUsers(data ?? []);
    if (data && data.length) {
      const ids = data.map((u: any) => u.id);
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

  const onBan = async (id: string, banned: boolean) => {
    if (banned) {
      if (!window.confirm("Unban this user?")) return;
      try { await unbanUser(id); toast.success("Unbanned"); search(); }
      catch (e: any) { toast.error(e.message ?? "Failed"); }
    } else {
      const reason = window.prompt("Ban reason (required):");
      if (!reason) return;
      try { await banUser(id, reason); toast.success("Banned"); search(); }
      catch (e: any) { toast.error(e.message ?? "Failed"); }
    }
  };

  const onStrike = async (id: string) => {
    const reason = window.prompt("Strike reason:");
    if (!reason) return;
    try { await issueStrike(id, reason, "minor"); toast.success("Strike issued"); }
    catch (e: any) { toast.error(e.message ?? "Failed"); }
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
                        <button key={r} onClick={() => toggleRole(u.id, r)} className={`text-[10px] px-1.5 py-0.5 rounded border ${has ? "bg-gold/15 border-gold/40 text-gold" : "border-border/60 text-muted-foreground hover:text-foreground"}`}>
                          {r}
                        </button>
                      );
                    })}
                  </div>
                  <div className="flex gap-2">
                    <Button size="sm" variant="outline" className="h-7 text-[10px]" onClick={() => onSuspend(u.id, u.is_suspended)}>{u.is_suspended ? "Unsuspend" : "Suspend"}</Button>
                    <Button size="sm" variant={u.is_banned ? "outline" : "destructive"} className="h-7 text-[10px]" onClick={() => onBan(u.id, u.is_banned)}>{u.is_banned ? "Unban" : "Ban"}</Button>
                    <Button size="sm" variant="outline" className="h-7 text-[10px]" onClick={() => onStrike(u.id)}>Strike</Button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </SectionCard>
    </div>
  );
}
