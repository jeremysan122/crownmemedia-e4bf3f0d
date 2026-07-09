import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { SectionCard, StatTile, EmptyState, PillBadge } from "@/components/admin/cc/CommandCenterUI";
import { ConnectionStatus } from "@/components/admin/cc/ConnectionStatus";
import ExportDiagnosticsButton from "@/components/admin/cc/ExportDiagnosticsButton";
import UserGrowthCard from "@/components/admin/cc/UserGrowthCard";
import { useRealtimeStatus } from "@/hooks/useRealtimeStatus";
import { startAdminSession, pingAdminSession, endAdminSession } from "@/lib/admin";

interface Stats {
  users: number | null;
  posts24h: number | null;
  reportsOpen: number | null;
  unackAlerts: number | null;
  ticketsOpen: number | null;
  modQueueOpen: number | null;
  errors24h: number | null;
  pass: number | null;
}

const EMPTY: Stats = {
  users: null, posts24h: null, reportsOpen: null, unackAlerts: null,
  ticketsOpen: null, modQueueOpen: null, errors24h: null, pass: null,
};

/** Each tile loads independently so a single RLS-denied query never blanks the page. */
async function safeCount(query: ReturnType<typeof supabase.from>): Promise<{ count: number | null; error: string | null }> {
  try {
    const res: any = await query;
    return { count: res?.count ?? 0, error: res?.error?.message ?? null };
  } catch (e: any) {
    return { count: null, error: e?.message ?? "Query failed" };
  }
}

export default function CommandCenterOverview() {
  const [stats, setStats] = useState<Stats>(EMPTY);
  const [recent, setRecent] = useState<any[]>([]);
  const [issues, setIssues] = useState<string[]>([]);
  const [recentErr, setRecentErr] = useState<string | null>(null);

  useEffect(() => {
    let sessionId: string | null = null;
    let pingTimer: number | null = null;
    (async () => {
      try {
        sessionId = await startAdminSession();
        if (sessionId) {
          pingTimer = window.setInterval(() => sessionId && pingAdminSession(sessionId), 60_000);
        }
      } catch { /* non-fatal */ }
    })();
    return () => {
      if (pingTimer) window.clearInterval(pingTimer);
      if (sessionId) endAdminSession(sessionId).catch(() => {});
    };
  }, []);

  const load = async () => {
    const since = new Date(Date.now() - 24 * 3600_000).toISOString();
    const labels = ["users", "posts24h", "reportsOpen", "unackAlerts", "ticketsOpen", "modQueueOpen", "errors24h", "pass"] as const;
    const queries = [
      supabase.from("profiles").select("id", { count: "exact", head: true }),
      supabase.from("posts").select("id", { count: "exact", head: true }).gte("created_at", since),
      supabase.from("reports").select("id", { count: "exact", head: true }).eq("status", "open"),
      supabase.from("admin_alerts").select("id", { count: "exact", head: true }).eq("acknowledged", false),
      supabase.from("support_tickets").select("id", { count: "exact", head: true }).in("status", ["open", "in_progress"]),
      supabase.from("moderation_queue").select("id", { count: "exact", head: true }).eq("status", "pending"),
      supabase.from("error_logs").select("id", { count: "exact", head: true }).gte("created_at", since),
      supabase.from("royal_pass_subscriptions").select("id", { count: "exact", head: true }).eq("status", "active"),
    ];
    const results = await Promise.all(queries.map((q) => safeCount(q as any)));
    const next: Stats = { ...EMPTY };
    const errs: string[] = [];
    labels.forEach((k, i) => {
      next[k] = results[i].count;
      if (results[i].error) errs.push(`${k}: ${results[i].error}`);
    });
    setStats(next);

    try {
      const { data, error } = await supabase
        .from("admin_alerts")
        .select("id, severity, title, body, created_at, acknowledged")
        .order("created_at", { ascending: false })
        .limit(8);
      if (error) {
        setRecentErr(error.message);
        setRecent([]);
      } else {
        setRecentErr(null);
        setRecent(data ?? []);
      }
    } catch (e: any) {
      setRecentErr(e?.message ?? "Failed to load alerts");
      setRecent([]);
    }
    setIssues(errs);
  };

  useEffect(() => {
    load();
    const t = window.setInterval(load, 30_000);
    return () => { window.clearInterval(t); };
  }, []);

  const rtAlerts = useRealtimeStatus("cc-overview-alerts", (ch) =>
    ch
      .on("postgres_changes", { event: "*", schema: "public", table: "admin_alerts" }, load)
      .on("postgres_changes", { event: "*", schema: "public", table: "error_logs" }, load));
  const rtMod = useRealtimeStatus("cc-overview-mod", (ch) =>
    ch
      .on("postgres_changes", { event: "*", schema: "public", table: "moderation_queue" }, load)
      .on("postgres_changes", { event: "*", schema: "public", table: "reports" }, load));

  const fmt = (n: number | null) => (n === null ? "—" : n.toLocaleString());

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-end gap-3 flex-wrap">
        <ConnectionStatus status={rtAlerts.status} retryIn={rtAlerts.retryIn} label="alerts/errors" />
        <ConnectionStatus status={rtMod.status} retryIn={rtMod.retryIn} label="mod/reports" />
        <ExportDiagnosticsButton
          name="overview"
          sections={[
            {
              label: "Stat snapshot",
              filename: "stats",
              rows: [{ captured_at: new Date().toISOString(), ...stats }],
            },
            { label: "Recent alerts", filename: "alerts", rows: recent },
            { label: "Issues", filename: "issues", rows: issues.map((m) => ({ message: m })) },
          ]}
        />
      </div>

      {issues.length > 0 && (
        <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 p-2.5 text-[11px] text-amber-300">
          <div className="font-mono uppercase tracking-wider mb-1">Some metrics couldn't load</div>
          <ul className="list-disc pl-4 space-y-0.5">
            {issues.map((m) => <li key={m}>{m}</li>)}
          </ul>
          <div className="mt-1 opacity-70">Usually means your role can't read that table — ask a super_admin to grant access.</div>
        </div>
      )}

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        <StatTile label="Total Users" value={fmt(stats.users)} />
        <StatTile label="Posts (24h)" value={fmt(stats.posts24h)} />
        <StatTile label="Active Pass" value={fmt(stats.pass)} tone="good" />
        <StatTile label="Open Reports" value={fmt(stats.reportsOpen)} tone={stats.reportsOpen && stats.reportsOpen > 0 ? "warn" : "default"} />
        <StatTile label="Mod Queue" value={fmt(stats.modQueueOpen)} tone={stats.modQueueOpen && stats.modQueueOpen > 5 ? "warn" : "default"} />
        <StatTile label="Open Tickets" value={fmt(stats.ticketsOpen)} />
        <StatTile label="Unack Alerts" value={fmt(stats.unackAlerts)} tone={stats.unackAlerts && stats.unackAlerts > 0 ? "bad" : "good"} />
        <StatTile label="Errors (24h)" value={fmt(stats.errors24h)} tone={stats.errors24h && stats.errors24h > 10 ? "bad" : "default"} />
      </div>

      <SectionCard title="Recent Alerts">
        {recentErr ? (
          <div className="text-[11px] text-rose-300">Couldn't load alerts: {recentErr}</div>
        ) : recent.length === 0 ? (
          <EmptyState message="No alerts yet — all systems quiet." />
        ) : (
          <ul className="divide-y divide-border/40">
            {recent.map((a) => (
              <li key={a.id} className="py-2 flex items-start gap-2">
                <PillBadge tone={a.severity === "critical" ? "bad" : a.severity === "warning" ? "warn" : "default"}>
                  {a.severity}
                </PillBadge>
                <div className="flex-1 min-w-0">
                  <div className="text-sm truncate">{a.title}</div>
                  {a.body ? <div className="text-[11px] text-muted-foreground line-clamp-2">{a.body}</div> : null}
                </div>
                <div className="text-[10px] text-muted-foreground">
                  {new Date(a.created_at).toLocaleTimeString()}
                </div>
              </li>
            ))}
          </ul>
        )}
      </SectionCard>
    </div>
  );
}
