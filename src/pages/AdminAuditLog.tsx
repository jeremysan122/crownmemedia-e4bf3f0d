import { useEffect, useState } from "react";
import AppShell from "@/components/AppShell";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/context/AuthContext";
import { Navigate } from "react-router-dom";
import { Loader2, ScrollText } from "lucide-react";
import { timeAgo } from "@/lib/crown";
import AdminSessionHint from "@/components/admin/AdminSessionHint";

interface AuditRow {
  id: string;
  actor_id: string;
  actor_email: string | null;
  action: string;
  target_type: string | null;
  target_id: string | null;
  details: Record<string, unknown> | null;
  created_at: string;
}

export default function AdminAuditLog() {
  const { isModerator, loading } = useAuth();
  const [rows, setRows] = useState<AuditRow[]>([]);
  const [busy, setBusy] = useState(true);
  const [filter, setFilter] = useState<string>("");

  useEffect(() => {
    (async () => {
      setBusy(true);
      const { data } = await supabase
        .from("admin_audit_log")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(200);
      setRows((data as AuditRow[]) ?? []);
      setBusy(false);
    })();
  }, []);

  if (loading) return <AppShell><div className="py-20 text-center">Loading…</div></AppShell>;
  if (!isModerator) return <Navigate to="/feed" replace />;

  const filtered = filter
    ? rows.filter((r) => r.action.includes(filter) || (r.actor_email ?? "").includes(filter))
    : rows;

  return (
    <AppShell title="ADMIN AUDIT LOG">
      <div className="px-4 py-4 space-y-3">
        <div className="flex items-center gap-2">
          <ScrollText size={20} className="text-gold" />
          <h1 className="font-display text-2xl text-gold">Admin Audit Log</h1>
        </div>

        <AdminSessionHint />

        <input
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          placeholder="Filter by action or email…"
          className="w-full bg-muted/40 border border-border/50 rounded-lg px-3 py-2 text-sm"
        />

        {busy && (
          <div className="py-10 flex items-center justify-center text-muted-foreground">
            <Loader2 size={16} className="animate-spin mr-2" /> Loading entries…
          </div>
        )}

        {!busy && filtered.length === 0 && (
          <p className="text-center text-sm text-muted-foreground py-10">No audit entries.</p>
        )}

        {filtered.map((r) => (
          <div key={r.id} className="royal-card p-3 space-y-1.5 text-xs">
            <div className="flex items-center justify-between gap-2">
              <span className="font-bold text-sm text-primary">{r.action}</span>
              <span className="text-[10px] text-muted-foreground">{timeAgo(r.created_at)}</span>
            </div>
            <div className="text-muted-foreground">
              by {r.actor_email ?? r.actor_id.slice(0, 8)}
              {r.target_type && (
                <>
                  {" · "}
                  <span className="text-foreground/80">{r.target_type}</span>
                  {r.target_id && <>: <code className="text-foreground/60">{r.target_id}</code></>}
                </>
              )}
            </div>
            {r.details && Object.keys(r.details).length > 0 && (
              <pre className="bg-muted/40 rounded p-2 text-[10px] overflow-x-auto">
                {JSON.stringify(r.details, null, 2)}
              </pre>
            )}
          </div>
        ))}
      </div>
    </AppShell>
  );
}
