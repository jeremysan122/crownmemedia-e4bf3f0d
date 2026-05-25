import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { SectionCard, EmptyState, PillBadge, StatTile } from "@/components/admin/cc/CommandCenterUI";
import ExportDiagnosticsButton from "@/components/admin/cc/ExportDiagnosticsButton";
import { Button } from "@/components/ui/button";
import { acknowledgeAlert } from "@/lib/admin";
import { toast } from "sonner";

interface Loaded<T> { data: T[]; error: string | null; }
const empty = <T,>(): Loaded<T> => ({ data: [], error: null });

export default function CommandCenterSecurity() {
  const [alerts, setAlerts] = useState<Loaded<any>>(empty());
  const [errors, setErrors] = useState<Loaded<any>>(empty());
  const [sessions, setSessions] = useState<Loaded<any>>(empty());

  const load = async () => {
    const [a, e, s] = await Promise.allSettled([
      supabase.from("admin_alerts").select("*").order("created_at", { ascending: false }).limit(50),
      supabase.from("error_logs").select("*").order("created_at", { ascending: false }).limit(50),
      supabase.from("admin_sessions").select("id, admin_id, started_at, last_seen_at, ended_at, user_agent").is("ended_at", null).order("last_seen_at", { ascending: false }).limit(30),
    ]);
    const unwrap = <T,>(r: PromiseSettledResult<any>): Loaded<T> => {
      if (r.status === "rejected") return { data: [], error: r.reason?.message ?? "Query failed" };
      if (r.value?.error) return { data: [], error: r.value.error.message };
      return { data: r.value?.data ?? [], error: null };
    };
    setAlerts(unwrap(a));
    setErrors(unwrap(e));
    setSessions(unwrap(s));
  };

  useEffect(() => {
    load();
    const ch = supabase
      .channel("cc-security")
      .on("postgres_changes", { event: "*", schema: "public", table: "admin_alerts" }, load)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "error_logs" }, load)
      .subscribe();
    const t = window.setInterval(load, 30_000);
    return () => { supabase.removeChannel(ch); window.clearInterval(t); };
  }, []);

  const ack = async (id: string) => {
    try { await acknowledgeAlert(id); toast.success("Acknowledged"); load(); }
    catch (e: any) { toast.error(e.message ?? "Failed"); }
  };

  const unack = alerts.data.filter((a) => !a.acknowledged).length;
  const critical = alerts.data.filter((a) => a.severity === "critical" && !a.acknowledged).length;
  const errs24 = errors.data.filter((e) => Date.now() - new Date(e.created_at).getTime() < 86_400_000).length;

  const accessIssue =
    [alerts.error, errors.error, sessions.error]
      .filter(Boolean)
      .find((m) => /permission|denied|policy|RLS|row-level/i.test(m || ""));

  const ErrLine = ({ msg }: { msg: string }) => (
    <div className="text-[11px] text-rose-300">Couldn't load: {msg}</div>
  );

  return (
    <div className="space-y-3">
      <div className="flex justify-end">
        <ExportDiagnosticsButton
          name="security"
          sections={[
            { label: "Alerts", filename: "alerts", rows: alerts.data },
            { label: "Error log", filename: "errors", rows: errors.data },
            { label: "Active admin sessions", filename: "sessions", rows: sessions.data },
          ]}
        />
      </div>
      {accessIssue && (
        <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 p-2.5 text-[11px] text-amber-300">
          Some security data is restricted to <strong>admin</strong>, <strong>super_admin</strong>, or <strong>security_admin</strong>.
          Ask a super_admin to grant your account that role.
        </div>
      )}

      <div className="grid grid-cols-3 gap-2">
        <StatTile label="Unack Alerts" value={unack} tone={unack > 0 ? "bad" : "good"} />
        <StatTile label="Critical" value={critical} tone={critical > 0 ? "bad" : "default"} />
        <StatTile label="Errors 24h" value={errs24} tone={errs24 > 10 ? "warn" : "default"} />
      </div>

      <SectionCard title="Alerts">
        {alerts.error ? <ErrLine msg={alerts.error} />
          : alerts.data.length === 0 ? <EmptyState message="No alerts captured." /> : (
          <ul className="divide-y divide-border/40">
            {alerts.data.map((a) => (
              <li key={a.id} className="py-2 flex items-start gap-2">
                <PillBadge tone={a.severity === "critical" ? "bad" : a.severity === "warning" ? "warn" : "default"}>{a.severity}</PillBadge>
                <div className="flex-1 min-w-0">
                  <div className="text-sm">{a.title}</div>
                  {a.body ? <div className="text-[11px] text-muted-foreground line-clamp-2">{a.body}</div> : null}
                  <div className="text-[10px] text-muted-foreground mt-0.5">{a.category} · {new Date(a.created_at).toLocaleString()}</div>
                </div>
                {a.acknowledged
                  ? <PillBadge tone="good">ack</PillBadge>
                  : <Button size="sm" variant="outline" className="h-7 text-[10px]" onClick={() => ack(a.id)}>Ack</Button>}
              </li>
            ))}
          </ul>
        )}
      </SectionCard>

      <SectionCard title="Error Log">
        {errors.error ? <ErrLine msg={errors.error} />
          : errors.data.length === 0 ? <EmptyState message="No errors logged." /> : (
          <ul className="divide-y divide-border/40 text-xs">
            {errors.data.map((e) => (
              <li key={e.id} className="py-1.5">
                <div className="flex items-center gap-2">
                  <PillBadge tone={e.level === "fatal" ? "bad" : e.level === "error" ? "warn" : "default"}>{e.level}</PillBadge>
                  <span className="font-mono text-[10px] text-muted-foreground">{e.source}</span>
                  <span className="text-[10px] text-muted-foreground ml-auto">{new Date(e.created_at).toLocaleString()}</span>
                </div>
                <div className="mt-0.5 line-clamp-2">{e.message}</div>
              </li>
            ))}
          </ul>
        )}
      </SectionCard>

      <SectionCard title="Active Admin Sessions">
        {sessions.error ? <ErrLine msg={sessions.error} />
          : sessions.data.length === 0 ? <EmptyState message="No active admin sessions tracked." /> : (
          <ul className="divide-y divide-border/40 text-xs">
            {sessions.data.map((s) => (
              <li key={s.id} className="py-1.5 flex items-center gap-2">
                <span className="font-mono text-[10px] text-muted-foreground truncate flex-1">{String(s.admin_id ?? "").slice(0, 8)}…</span>
                <span className="text-[10px] text-muted-foreground hidden sm:inline truncate max-w-[40%]">{s.user_agent ?? "—"}</span>
                <span className="text-[10px] text-muted-foreground">{s.last_seen_at ? new Date(s.last_seen_at).toLocaleTimeString() : "—"}</span>
              </li>
            ))}
          </ul>
        )}
      </SectionCard>
    </div>
  );
}
