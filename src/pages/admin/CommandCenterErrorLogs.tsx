import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { SectionCard, EmptyState, StatTile, PillBadge } from "@/components/admin/cc/CommandCenterUI";
import { Loader2, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";

interface ErrorRow {
  id: string;
  user_id: string | null;
  message: string;
  stack: string | null;
  url: string | null;
  source: string | null;
  level: string | null;
  metadata: Record<string, unknown> | null;
  created_at: string;
}

const ago = (s: string | null) => {
  if (!s) return "—";
  const m = Math.floor((Date.now() - new Date(s).getTime()) / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
};

export default function CommandCenterErrorLogs() {
  const [rows, setRows] = useState<ErrorRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<"all" | "client" | "edge">("all");
  const [expanded, setExpanded] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    let q = supabase.from("error_logs").select("*").order("created_at", { ascending: false }).limit(200);
    if (filter !== "all") q = q.eq("source", filter);
    const { data } = await q;
    setRows((data as ErrorRow[]) || []);
    setLoading(false);
  };

  useEffect(() => { load();   }, [filter]);

  const last24 = rows.filter((r) => Date.now() - new Date(r.created_at).getTime() < 86400000).length;
  const lastHour = rows.filter((r) => Date.now() - new Date(r.created_at).getTime() < 3600000).length;
  const clientShare = rows.length ? Math.round((rows.filter((r) => r.source === "client").length / rows.length) * 100) : 0;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="font-display text-lg">Error Logs</h2>
          <p className="text-xs text-muted-foreground">Client + edge function errors, newest first</p>
        </div>
        <div className="flex gap-2">
          {(["all", "client", "edge"] as const).map((f) => (
            <Button key={f} variant={filter === f ? "default" : "outline"} size="sm" onClick={() => setFilter(f)}>
              {f}
            </Button>
          ))}
          <Button variant="outline" size="sm" onClick={load} disabled={loading}>
            {loading ? <Loader2 size={14} className="mr-1.5 animate-spin" /> : <RefreshCw size={14} className="mr-1.5" />}
            Refresh
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatTile label="Total (200 max)" value={String(rows.length)} />
        <StatTile label="Last 24h" value={String(last24)} tone={last24 > 50 ? "warn" : "default"} />
        <StatTile label="Last hour" value={String(lastHour)} tone={lastHour > 10 ? "bad" : "default"} />
        <StatTile label="Client share" value={`${clientShare}%`} />
      </div>

      <SectionCard title="Recent errors">
        {loading ? (
          <div className="p-6 flex items-center justify-center text-muted-foreground">
            <Loader2 size={14} className="animate-spin mr-2" /> Loading…
          </div>
        ) : rows.length === 0 ? (
          <EmptyState message="No errors logged" />
        ) : (
          <div className="divide-y divide-border/60 text-xs max-h-[70vh] overflow-y-auto">
            {rows.map((r) => {
              const open = expanded === r.id;
              return (
                <div key={r.id} className="p-2 space-y-1">
                  <button
                    type="button"
                    onClick={() => setExpanded(open ? null : r.id)}
                    className="w-full text-left grid grid-cols-12 gap-2 items-center hover:bg-muted/20 rounded p-1"
                  >
                    <span className="col-span-1"><PillBadge tone={r.level === "error" ? "bad" : "warn"}>{r.source || "?"}</PillBadge></span>
                    <span className="col-span-7 truncate font-mono">{r.message}</span>
                    <span className="col-span-2 text-muted-foreground truncate">{r.url || "—"}</span>
                    <span className="col-span-2 text-right text-muted-foreground tabular-nums">{ago(r.created_at)}</span>
                  </button>
                  {open && (
                    <div className="ml-2 p-2 rounded bg-muted/20 space-y-2 text-[11px] font-mono">
                      {r.user_id && <div><span className="text-muted-foreground">user:</span> {r.user_id}</div>}
                      {r.url && <div className="break-all"><span className="text-muted-foreground">url:</span> {r.url}</div>}
                      {r.stack && (
                        <pre className="whitespace-pre-wrap break-all text-muted-foreground max-h-64 overflow-y-auto">{r.stack}</pre>
                      )}
                      {r.metadata && (
                        <pre className="whitespace-pre-wrap break-all text-muted-foreground max-h-40 overflow-y-auto">
                          {JSON.stringify(r.metadata, null, 2)}
                        </pre>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </SectionCard>
    </div>
  );
}
