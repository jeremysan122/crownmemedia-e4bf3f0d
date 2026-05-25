import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { SectionCard, EmptyState, PillBadge } from "@/components/admin/cc/CommandCenterUI";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { createBroadcast } from "@/lib/admin";
import { toast } from "sonner";

export default function CommandCenterBroadcasts() {
  const [list, setList] = useState<any[]>([]);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [audience, setAudience] = useState<"all"|"royal_pass"|"non_pass"|"admins">("all");
  const [busy, setBusy] = useState(false);

  const load = async () => {
    const { data } = await supabase.from("admin_broadcasts").select("*").order("created_at",{ascending:false}).limit(30);
    setList(data ?? []);
  };
  useEffect(() => { load(); }, []);

  const send = async () => {
    if (title.trim().length < 3 || body.trim().length < 5) { toast.error("Title and body required."); return; }
    setBusy(true);
    try {
      await createBroadcast({ title: title.trim(), body: body.trim(), audience });
      toast.success("Broadcast queued");
      setTitle(""); setBody("");
      load();
    } catch (e: any) { toast.error(e.message ?? "Failed"); }
    finally { setBusy(false); }
  };

  return (
    <div className="space-y-3">
      <SectionCard title="New Broadcast">
        <div className="space-y-2">
          <Input value={title} onChange={(e)=>setTitle(e.target.value)} placeholder="Title" className="h-8 text-xs" />
          <Textarea value={body} onChange={(e)=>setBody(e.target.value)} placeholder="Message body…" rows={3} className="text-xs" />
          <div className="flex items-center gap-2 flex-wrap">
            <select value={audience} onChange={(e)=>setAudience(e.target.value as any)} className="h-8 rounded border border-border/60 bg-background px-2 text-xs">
              <option value="all">All users</option>
              <option value="royal_pass">Royal Pass holders</option>
              <option value="non_pass">Non-Pass users</option>
              <option value="admins">Admins only</option>
            </select>
            <Button size="sm" className="h-8 ml-auto" onClick={send} disabled={busy}>Queue Broadcast</Button>
          </div>
        </div>
      </SectionCard>

      <SectionCard title={`History (${list.length})`}>
        {list.length === 0 ? <EmptyState message="No broadcasts yet." /> : (
          <ul className="divide-y divide-border/40">
            {list.map((b) => (
              <li key={b.id} className="py-2 space-y-1">
                <div className="flex items-center gap-2">
                  <span className="font-medium text-sm flex-1 truncate">{b.title}</span>
                  <PillBadge>{b.audience}</PillBadge>
                  {b.sent_at ? <PillBadge tone="good">sent</PillBadge> : <PillBadge tone="warn">queued</PillBadge>}
                </div>
                <p className="text-[11px] text-muted-foreground line-clamp-2">{b.body}</p>
                <div className="text-[10px] text-muted-foreground">{new Date(b.created_at).toLocaleString()}</div>
              </li>
            ))}
          </ul>
        )}
      </SectionCard>
    </div>
  );
}
