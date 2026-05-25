import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { SectionCard, EmptyState, PillBadge } from "@/components/admin/cc/CommandCenterUI";
import { Button } from "@/components/ui/button";
import { assignTicket, resolveTicket } from "@/lib/admin";
import { toast } from "sonner";

export default function CommandCenterSupport() {
  const [tickets, setTickets] = useState<any[]>([]);
  const [filter, setFilter] = useState<"open"|"in_progress"|"resolved"|"all">("open");

  const load = async () => {
    let q = supabase.from("support_tickets").select("*").order("created_at",{ascending:false}).limit(50);
    if (filter !== "all") q = q.eq("status", filter);
    const { data } = await q;
    setTickets(data ?? []);
  };
  useEffect(() => { load(); }, [filter]);

  const claim = async (id: string) => {
    const { data: u } = await supabase.auth.getUser();
    if (!u.user) return;
    try { await assignTicket(id, u.user.id); toast.success("Claimed"); load(); }
    catch (e: any) { toast.error(e.message ?? "Failed"); }
  };
  const resolve = async (id: string) => {
    try { await resolveTicket(id); toast.success("Resolved"); load(); }
    catch (e: any) { toast.error(e.message ?? "Failed"); }
  };

  return (
    <div className="space-y-3">
      <SectionCard title="Support Tickets" action={
        <select value={filter} onChange={(e)=>setFilter(e.target.value as any)} className="h-7 rounded border border-border/60 bg-background px-2 text-[11px]">
          <option value="open">Open</option>
          <option value="in_progress">In progress</option>
          <option value="resolved">Resolved</option>
          <option value="all">All</option>
        </select>
      }>
        {tickets.length === 0 ? <EmptyState message="No tickets in this view." /> : (
          <ul className="divide-y divide-border/40">
            {tickets.map((t) => (
              <li key={t.id} className="py-2 space-y-1">
                <div className="flex items-center gap-2">
                  <PillBadge tone={t.priority === "urgent" ? "bad" : t.priority === "high" ? "warn" : "default"}>{t.priority}</PillBadge>
                  <span className="text-sm font-medium flex-1 truncate">{t.subject}</span>
                  <PillBadge tone={t.status === "resolved" ? "good" : t.status === "in_progress" ? "warn" : "default"}>{t.status}</PillBadge>
                </div>
                <p className="text-[11px] text-muted-foreground line-clamp-2">{t.body}</p>
                <div className="flex items-center gap-2">
                  <span className="text-[10px] text-muted-foreground">{new Date(t.created_at).toLocaleString()}</span>
                  <div className="ml-auto flex gap-2">
                    {t.status === "open" ? <Button size="sm" variant="outline" className="h-7 text-[10px]" onClick={() => claim(t.id)}>Claim</Button> : null}
                    {t.status !== "resolved" ? <Button size="sm" className="h-7 text-[10px]" onClick={() => resolve(t.id)}>Resolve</Button> : null}
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </SectionCard>
    </div>
  );
}
