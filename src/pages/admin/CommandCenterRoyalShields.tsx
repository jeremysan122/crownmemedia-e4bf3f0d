/**
 * Wave 8.2b Stage 2.1 — Admin: Royal Shield accounting + integrity check.
 *
 * Shows per-user shield balances (granted, net-spent, active sessions)
 * from the canonical `royal_shield_accounting` view via the admin RPC,
 * flags drift rows, exposes a manual "Run integrity check" button, and
 * renders recent audit-log entries.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import AppShell from "@/components/AppShell";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/context/AuthContext";
import { Navigate } from "react-router-dom";
import { Loader2, ShieldCheck, AlertTriangle, PlayCircle, ScrollText } from "lucide-react";
import { timeAgo } from "@/lib/crown";

type AccountingRow = {
  user_id: string;
  grant_id: string;
  allowance_id: string;
  shields_granted: number;
  shields_used: number;
  shields_reversed: number;
  net_spent_credits: number;
  active_shield_sessions: number;
  grant_status: string;
};

type CheckRow = {
  user_id: string;
  shields_granted: number;
  net_spent_credits: number;
  active_shield_sessions: number;
  drift_amount: number;
  status: "ok" | "drift";
};

type AuditRow = {
  id: string;
  user_id: string;
  event_type: string;
  reason_code: string;
  delta: number;
  shields_granted: number | null;
  net_spent_credits: number | null;
  active_shield_sessions: number | null;
  drift_amount: number | null;
  battle_id: string | null;
  post_id: string | null;
  metadata: Record<string, unknown> | null;
  created_at: string;
};

type RuntimeAuditResult = {
  ok: boolean;
  passed: number;
  total: number;
  results: Array<{ scenario: string; ok: boolean; steps: Array<{ name: string; ok: boolean; detail?: string }> }>;
  ran_at: string;
};

type ReconciliationSnapshot = {
  flags: Array<{ key: string; enabled: boolean; rollout_percentage: number; updated_at: string }>;
  aggregate: {
    grants_needing_reconciliation: number;
    unrecovered_shekels_total: number;
    unrecovered_boost_tokens_total: number;
    shekel_allocation_reversals_total: number;
    boost_token_allocation_reversals_total: number;
    refunded_grants_total: number;
    disputed_grants_total: number;
  };
  grants: Array<{
    id: string;
    user_id: string;
    status: string;
    reconciliation_reason: string | null;
    unrecovered_promotional_shekels: number;
    unrecovered_promotional_boost_tokens: number;
    shekels_reversed: number;
    boost_tokens_reversed: number;
    active_shields_reversed: number;
    reversed_at: string | null;
  }>;
  generated_at: string;

export default function CommandCenterRoyalShields() {
  const { isModerator, loading } = useAuth();
  const [rows, setRows] = useState<AccountingRow[]>([]);
  const [audit, setAudit] = useState<AuditRow[]>([]);
  const [busy, setBusy] = useState(true);
  const [checking, setChecking] = useState(false);
  const [lastCheck, setLastCheck] = useState<CheckRow[] | null>(null);
  const [runtimeBusy, setRuntimeBusy] = useState(false);
  const [runtime, setRuntime] = useState<RuntimeAuditResult | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const load = useCallback(async () => {
    setBusy(true);
    setErr(null);
    const [acct, log] = await Promise.all([
      // admin_royal_shield_accounting returns the full view for admins only.
      supabase.rpc("admin_royal_shield_accounting" as never),
      supabase
        .from("royal_shield_audit_log")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(100),
    ]);
    if (acct.error) setErr(acct.error.message);
    setRows(((acct.data as AccountingRow[] | null) ?? []));
    setAudit(((log.data as AuditRow[] | null) ?? []));
    setBusy(false);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const runCheck = useCallback(async () => {
    setChecking(true);
    setErr(null);
    const { data, error } = await supabase.rpc(
      "admin_run_royal_shield_integrity_check" as never,
      { _reason: "manual_admin_run" } as never,
    );
    if (error) setErr(error.message);
    setLastCheck((data as CheckRow[] | null) ?? []);
    setChecking(false);
    // Refresh audit log so the new invariant_* rows appear.
    void load();
  }, [load]);

  const runRuntimeAudit = useCallback(async () => {
    setRuntimeBusy(true);
    setErr(null);
    const { data, error } = await supabase.functions.invoke("admin-royal-runtime-audit", { body: {} });
    if (error) setErr(error.message);
    setRuntime((data as RuntimeAuditResult | null) ?? null);
    setRuntimeBusy(false);
    void load();
  }, [load]);

  const summary = useMemo(() => {
    const byUser = new Map<string, { granted: number; net: number; active: number; drift: number }>();
    for (const r of rows) {
      const cur = byUser.get(r.user_id) ?? { granted: 0, net: 0, active: 0, drift: 0 };
      cur.granted += r.shields_granted;
      cur.net += r.net_spent_credits;
      cur.active += r.active_shield_sessions;
      byUser.set(r.user_id, cur);
    }
    for (const v of byUser.values()) v.drift = Math.max(v.active - v.net, 0);
    return Array.from(byUser.entries()).sort((a, b) => b[1].drift - a[1].drift || b[1].active - a[1].active);
  }, [rows]);

  const driftCount = summary.filter(([, v]) => v.drift > 0).length;

  if (loading) return <AppShell><div className="py-20 text-center">Loading…</div></AppShell>;
  if (!isModerator) return <Navigate to="/feed" replace />;

  return (
    <AppShell title="ROYAL SHIELD INTEGRITY">
      <div className="px-4 py-4 space-y-4">
        <header className="flex items-center gap-2">
          <ShieldCheck size={22} className="text-gold" />
          <h1 className="font-display text-2xl text-gold">Royal Shield Integrity</h1>
        </header>

        <div className="royal-card p-4 space-y-3">
          <div className="flex items-center justify-between gap-3">
            <div className="text-sm text-muted-foreground">
              {summary.length} users tracked ·{" "}
              <span className={driftCount > 0 ? "text-destructive font-medium" : "text-emerald-500"}>
                {driftCount} with drift
              </span>
            </div>
            <button
              onClick={runCheck}
              disabled={checking}
              className="inline-flex items-center gap-2 rounded-lg bg-primary text-primary-foreground px-3 py-1.5 text-sm font-medium disabled:opacity-60"
            >
              {checking ? <Loader2 size={14} className="animate-spin" /> : <PlayCircle size={14} />}
              Run integrity check
            </button>
          </div>

          {err && (
            <div className="flex items-center gap-2 text-sm text-destructive">
              <AlertTriangle size={14} /> {err}
            </div>
          )}

          {lastCheck && (
            <p className="text-xs text-muted-foreground">
              Last run: {lastCheck.length} rows · {lastCheck.filter((r) => r.status === "drift").length} drift
            </p>
          )}

          <div className="pt-3 border-t border-border/50 space-y-2">
            <div className="flex items-center justify-between gap-3">
              <div className="text-xs text-muted-foreground">
                Lifecycle runtime audit — creates an ephemeral test user and exercises every Royal Pass RPC (grant, refund, dispute created/won/reinstated/lost, shield invariants), then cleans up.
              </div>
              <button
                onClick={runRuntimeAudit}
                disabled={runtimeBusy}
                className="inline-flex items-center gap-2 rounded-lg border border-gold/40 text-gold px-3 py-1.5 text-sm font-medium disabled:opacity-60 shrink-0"
              >
                {runtimeBusy ? <Loader2 size={14} className="animate-spin" /> : <PlayCircle size={14} />}
                Run runtime audit
              </button>
            </div>
            {runtime && (
              <div className={`text-xs rounded-lg p-2 ${runtime.ok ? "bg-emerald-500/10 text-emerald-500" : "bg-destructive/10 text-destructive"}`}>
                <div className="font-medium mb-1">
                  Runtime audit: {runtime.passed}/{runtime.total} scenarios passed
                </div>
                <ul className="space-y-0.5">
                  {runtime.results.map((r) => (
                    <li key={r.scenario} className="flex items-start gap-2">
                      <span>{r.ok ? "✓" : "✗"}</span>
                      <span className="flex-1">
                        <code>{r.scenario}</code>
                        {!r.ok && (
                          <span className="ml-2 opacity-80">
                            — {r.steps.filter((s) => !s.ok).map((s) => `${s.name}: ${s.detail ?? "fail"}`).join(", ")}
                          </span>
                        )}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </div>

        <section className="space-y-2">
          <h2 className="font-display text-lg text-foreground/90">Per-user balances</h2>
          {busy && (
            <div className="py-10 flex items-center justify-center text-muted-foreground">
              <Loader2 size={16} className="animate-spin mr-2" /> Loading…
            </div>
          )}
          {!busy && summary.length === 0 && (
            <p className="text-center text-sm text-muted-foreground py-6">No royal-shield users yet.</p>
          )}
          <div className="space-y-1.5">
            {summary.map(([uid, v]) => (
              <div
                key={uid}
                className={`royal-card p-3 text-xs grid grid-cols-5 gap-2 ${
                  v.drift > 0 ? "border-destructive/60" : ""
                }`}
              >
                <code className="col-span-2 truncate text-foreground/70">{uid}</code>
                <span>granted <b className="text-foreground">{v.granted}</b></span>
                <span>net-spent <b className="text-foreground">{v.net}</b></span>
                <span>
                  active <b className={v.drift > 0 ? "text-destructive" : "text-foreground"}>{v.active}</b>
                  {v.drift > 0 && <span className="ml-1 text-destructive">(+{v.drift} drift)</span>}
                </span>
              </div>
            ))}
          </div>
        </section>

        <section className="space-y-2">
          <div className="flex items-center gap-2">
            <ScrollText size={16} className="text-gold" />
            <h2 className="font-display text-lg text-foreground/90">Audit log (last 100)</h2>
          </div>
          {audit.length === 0 && !busy && (
            <p className="text-center text-sm text-muted-foreground py-6">No audit entries yet.</p>
          )}
          <div className="space-y-1.5">
            {audit.map((r) => (
              <div key={r.id} className="royal-card p-2.5 text-[11px] space-y-1">
                <div className="flex items-center justify-between gap-2">
                  <span
                    className={`font-bold ${
                      r.event_type === "invariant_drift" ? "text-destructive" :
                      r.event_type === "invariant_ok" ? "text-emerald-500" :
                      "text-primary"
                    }`}
                  >
                    {r.event_type}
                  </span>
                  <span className="text-muted-foreground">{timeAgo(r.created_at)}</span>
                </div>
                <div className="text-muted-foreground">
                  reason <code className="text-foreground/80">{r.reason_code}</code>
                  {r.delta !== 0 && <> · Δ <b className="text-foreground">{r.delta}</b></>}
                  {r.drift_amount != null && r.drift_amount > 0 && (
                    <> · drift <b className="text-destructive">{r.drift_amount}</b></>
                  )}
                  {r.battle_id && <> · battle <code>{r.battle_id.slice(0, 8)}</code></>}
                  {r.post_id && <> · post <code>{r.post_id.slice(0, 8)}</code></>}
                </div>
                <code className="text-foreground/60 block truncate">user {r.user_id}</code>
              </div>
            ))}
          </div>
        </section>
      </div>
    </AppShell>
  );
}
