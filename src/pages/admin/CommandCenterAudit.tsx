import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { SectionCard, EmptyState, PillBadge } from "@/components/admin/cc/CommandCenterUI";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

type AuditRow = {
  id: string;
  actor_id: string;
  actor_email: string | null;
  action: string;
  target_type: string | null;
  target_id: string | null;
  details: any;
  created_at: string;
};

const PAGE = 50;

export default function CommandCenterAudit() {
  const [rows, setRows] = useState<AuditRow[]>([]);
  const [page, setPage] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);

  // Filters
  const [actor, setActor] = useState("");
  const [action, setAction] = useState("");
  const [targetType, setTargetType] = useState("");
  const [targetId, setTargetId] = useState("");
  const [modField, setModField] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");

  const applyFilters = (qb: any) => {
    if (actor.trim()) qb = qb.ilike("actor_email", `%${actor.trim()}%`);
    if (action.trim()) qb = qb.ilike("action", `%${action.trim()}%`);
    if (targetType.trim()) qb = qb.ilike("target_type", `%${targetType.trim()}%`);
    if (targetId.trim()) qb = qb.ilike("target_id", `%${targetId.trim()}%`);
    if (modField.trim()) qb = qb.not(`details->changes->${modField.trim()}`, "is", null);
    if (from) qb = qb.gte("created_at", new Date(from).toISOString());
    if (to) {
      const end = new Date(to); end.setHours(23, 59, 59, 999);
      qb = qb.lte("created_at", end.toISOString());
    }
    return qb;
  };

  const load = async (resetPage = false) => {
    const p = resetPage ? 0 : page;
    const q = applyFilters(
      supabase
        .from("admin_audit_log")
        .select("*")
        .order("created_at", { ascending: false })
        .range(p * PAGE, p * PAGE + PAGE),
    );
    const { data } = await q;
    const items = (data ?? []) as AuditRow[];
    setHasMore(items.length > PAGE);
    setRows(items.slice(0, PAGE));
    if (resetPage) setPage(0);
  };

  useEffect(() => { load(true); /* eslint-disable-next-line */ }, [actor, action, targetType, targetId, modField, from, to]);
  useEffect(() => { load(false); /* eslint-disable-next-line */ }, [page]);

  const clearFilters = () => { setActor(""); setAction(""); setTargetType(""); setTargetId(""); setModField(""); setFrom(""); setTo(""); };

  const fetchAllForExport = async (): Promise<AuditRow[]> => {
    const q = applyFilters(
      supabase.from("admin_audit_log").select("*").order("created_at", { ascending: false }).limit(5000),
    );
    const { data } = await q;
    return (data ?? []) as AuditRow[];
  };

  const downloadFile = (filename: string, mime: string, content: string) => {
    const blob = new Blob([content], { type: mime });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = filename; a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  const exportJSON = async () => {
    const items = await fetchAllForExport();
    downloadFile(`audit-${Date.now()}.json`, "application/json", JSON.stringify(items, null, 2));
  };

  const csvEscape = (v: any) => {
    if (v == null) return "";
    const s = typeof v === "object" ? JSON.stringify(v) : String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const exportCSV = async () => {
    const items = await fetchAllForExport();
    const headers = ["id", "created_at", "actor_email", "actor_id", "action", "target_type", "target_id", "details"];
    const lines = [headers.join(",")];
    for (const r of items) lines.push(headers.map(h => csvEscape((r as any)[h])).join(","));
    downloadFile(`audit-${Date.now()}.csv`, "text/csv", lines.join("\n"));
  };

  const grouped = useMemo(() => rows, [rows]);

  return (
    <div className="space-y-3">
      <SectionCard title="Filters">
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
          <Input value={actor} onChange={(e)=>setActor(e.target.value)} placeholder="Actor email…" className="h-8 text-xs" />
          <Input value={action} onChange={(e)=>setAction(e.target.value)} placeholder="Action (e.g. UPDATE:posts)" className="h-8 text-xs" />
          <Input value={targetType} onChange={(e)=>setTargetType(e.target.value)} placeholder="Target type" className="h-8 text-xs" />
          <Input type="date" value={from} onChange={(e)=>setFrom(e.target.value)} className="h-8 text-xs" />
          <Input type="date" value={to} onChange={(e)=>setTo(e.target.value)} className="h-8 text-xs" />
        </div>
        <div className="mt-2 flex justify-end gap-1.5">
          <Button size="sm" variant="outline" className="h-7 text-[10px]" onClick={exportCSV}>Export CSV</Button>
          <Button size="sm" variant="outline" className="h-7 text-[10px]" onClick={exportJSON}>Export JSON</Button>
          <Button size="sm" variant="outline" className="h-7 text-[10px]" onClick={clearFilters}>Clear</Button>
        </div>
      </SectionCard>

      <SectionCard title={`Audit Log · page ${page + 1}`}>
        {grouped.length === 0 ? <EmptyState message="No audit entries match." /> : (
          <ul className="divide-y divide-border/40 text-xs">
            {grouped.map((r) => {
              const op = r.action.split(":")[0];
              const isOpen = expanded === r.id;
              return (
                <li key={r.id} className="py-1.5">
                  <button onClick={() => setExpanded(isOpen ? null : r.id)} className="w-full text-left">
                    <div className="flex items-center gap-2 flex-wrap">
                      <PillBadge tone={op === "DELETE" ? "bad" : op === "UPDATE" ? "warn" : "default"}>{op}</PillBadge>
                      <span className="font-mono text-[11px]">{r.action}</span>
                      <span className="text-[10px] text-muted-foreground ml-auto">{new Date(r.created_at).toLocaleString()}</span>
                    </div>
                    <div className="text-[11px] text-muted-foreground mt-0.5 flex items-center gap-2 flex-wrap">
                      <span>actor: {r.actor_email || r.actor_id.slice(0,8)+"…"}</span>
                      {r.target_type ? <span>· target: {r.target_type} {r.target_id ? r.target_id.slice(0,8)+"…" : ""}</span> : null}
                    </div>
                  </button>
                  {isOpen && r.details ? (
                    <pre className="mt-1.5 p-2 rounded bg-muted/30 text-[10px] overflow-x-auto max-h-64">
                      {JSON.stringify(r.details, null, 2)}
                    </pre>
                  ) : null}
                </li>
              );
            })}
          </ul>
        )}
        <div className="mt-3 flex items-center justify-between">
          <Button size="sm" variant="outline" className="h-7 text-[10px]" disabled={page === 0} onClick={() => setPage(p => Math.max(0, p - 1))}>Prev</Button>
          <span className="text-[10px] text-muted-foreground">Page {page + 1}</span>
          <Button size="sm" variant="outline" className="h-7 text-[10px]" disabled={!hasMore} onClick={() => setPage(p => p + 1)}>Next</Button>
        </div>
      </SectionCard>
    </div>
  );
}
