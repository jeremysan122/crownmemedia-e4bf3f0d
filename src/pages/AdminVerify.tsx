import { useEffect, useMemo, useState } from "react";
import AppShell from "@/components/AppShell";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/context/AuthContext";
import { Navigate } from "react-router-dom";
import { Loader2, CheckCircle2, AlertTriangle, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SHEKEL, formatShekels } from "@/lib/gifts";
import AdminSessionHint from "@/components/admin/AdminSessionHint";

interface ShekelBundle {
  id: string;
  stripe_price_id: string;
  shekels: number;
  usd: number;
  label: string;
  active: boolean;
  sort_order: number;
}
interface BoostBundle {
  id: string;
  stripe_price_id: string;
  boost_type: string;
  label: string;
  usd: number;
  duration_hours: number;
  active: boolean;
  sort_order: number;
}
interface LedgerRow {
  id: string;
  user_id: string;
  kind: string;
  shekels_delta: number;
  usd_amount: number | null;
  label: string;
  stripe_session_id: string | null;
  stripe_event_id: string | null;
  metadata: Record<string, unknown> | null;
  created_at: string;
}

interface Issue { level: "ok" | "warn" | "error"; msg: string }

export default function AdminVerify() {
  const { isModerator, loading } = useAuth();
  const [shekels, setShekels] = useState<ShekelBundle[]>([]);
  const [boosts, setBoosts] = useState<BoostBundle[]>([]);
  const [ledger, setLedger] = useState<LedgerRow[]>([]);
  const [busy, setBusy] = useState(true);




  const reload = async () => {
    setBusy(true);
    const [s, b, l] = await Promise.all([
      supabase.from("shekel_bundles").select("*").order("sort_order"),
      supabase.from("boost_bundles").select("*").order("sort_order"),
      supabase.from("shekel_ledger").select("*").order("created_at", { ascending: false }).limit(500),
    ]);
    setShekels((s.data as ShekelBundle[]) || []);
    setBoosts((b.data as BoostBundle[]) || []);
    setLedger((l.data as LedgerRow[]) || []);
    setBusy(false);
  };

  useEffect(() => { if (isModerator) reload(); }, [isModerator]);

  const priceIdMap = useMemo(() => {
    const m = new Map<string, { kind: "shekel" | "boost"; expectedShekels: number; expectedUsd: number; label: string }>();
    shekels.forEach((s) => m.set(s.stripe_price_id, {
      kind: "shekel",
      expectedShekels: Number(s.shekels),
      expectedUsd: Number(s.usd),
      label: s.label,
    }));
    boosts.forEach((b) => m.set(b.stripe_price_id, {
      kind: "boost",
      expectedShekels: 0,
      expectedUsd: Number(b.usd),
      label: b.label,
    }));
    return m;
  }, [shekels, boosts]);

  // Bundle config issues
  const bundleIssues = useMemo(() => {
    const issues: { id: string; label: string; problems: Issue[] }[] = [];
    const seen = new Map<string, string>();
    [...shekels.map((s) => ({ ...s, _kind: "shekel" as const })), ...boosts.map((b) => ({ ...b, _kind: "boost" as const, shekels: 0 }))].forEach((row) => {
      const probs: Issue[] = [];
      if (!row.stripe_price_id?.startsWith("price_")) probs.push({ level: "error", msg: "Invalid Stripe price_id format" });
      if (Number(row.usd) <= 0) probs.push({ level: "error", msg: "USD must be > 0" });
      if (row._kind === "shekel" && Number((row as ShekelBundle).shekels) <= 0) probs.push({ level: "error", msg: "Shekels must be > 0" });
      const dup = seen.get(row.stripe_price_id);
      if (dup) probs.push({ level: "error", msg: `Duplicate price_id (also used by "${dup}")` });
      else seen.set(row.stripe_price_id, row.label);
      if (!row.active) probs.push({ level: "warn", msg: "Inactive (won't be sold)" });
      if (probs.length === 0) probs.push({ level: "ok", msg: "Configuration valid" });
      issues.push({ id: row.id, label: row.label, problems: probs });
    });
    return issues;
  }, [shekels, boosts]);

  // Ledger row checks
  const ledgerChecks = useMemo(() => {
    return ledger.map((row) => {
      const priceId = (row.metadata?.["price_id"] as string | undefined) ?? null;
      const expected = priceId ? priceIdMap.get(priceId) : null;
      const problems: Issue[] = [];

      if (!priceId && (row.kind === "bundle_purchase" || row.kind === "boost_stripe")) {
        problems.push({ level: "warn", msg: "Stripe row has no price_id in metadata" });
      }
      if (priceId && !expected) {
        problems.push({ level: "error", msg: `Unknown price_id ${priceId} (no bundle mapping)` });
      }
      if (priceId && expected) {
        const qty = Number(row.metadata?.["quantity"] ?? 1);
        if (row.kind === "bundle_purchase") {
          const expShekels = expected.expectedShekels * qty;
          if (Math.abs(Number(row.shekels_delta) - expShekels) > 0.001) {
            problems.push({ level: "error", msg: `Credited ${formatShekels(Number(row.shekels_delta))} but expected ${formatShekels(expShekels)} ${SHEKEL}` });
          }
        }
        if (row.kind === "boost_stripe" && Number(row.shekels_delta) !== 0) {
          problems.push({ level: "warn", msg: "Boost row should not credit Shekels" });
        }
        if (row.usd_amount != null) {
          const expUsd = expected.expectedUsd * qty;
          if (Math.abs(Number(row.usd_amount) - expUsd) > 0.01) {
            problems.push({ level: "warn", msg: `USD charged $${Number(row.usd_amount).toFixed(2)} ≠ expected $${expUsd.toFixed(2)}` });
          }
        }
      }
      if (problems.length === 0) problems.push({ level: "ok", msg: "Matches expected" });

      return { row, expected, problems };
    });
  }, [ledger, priceIdMap]);

  const summary = useMemo(() => {
    const all = [...bundleIssues.flatMap((b) => b.problems), ...ledgerChecks.flatMap((c) => c.problems)];
    return {
      ok: all.filter((p) => p.level === "ok").length,
      warn: all.filter((p) => p.level === "warn").length,
      error: all.filter((p) => p.level === "error").length,
    };
  }, [bundleIssues, ledgerChecks]);

  if (loading) return <AppShell><div className="py-20 text-center">Loading…</div></AppShell>;
  if (!isModerator) return <Navigate to="/feed" replace />;

  return (
    <AppShell title="ADMIN VERIFY">
      <div className="px-4 py-4 space-y-5 max-w-3xl mx-auto">
        <AdminSessionHint />
        <div className="flex items-center justify-between">
          <h1 className="font-display text-2xl text-gold flex items-center gap-2">
            <ShieldCheck size={20} /> Stripe ↔ Ledger Verification
          </h1>
          <Button size="sm" variant="outline" onClick={reload} disabled={busy}>
            {busy ? <Loader2 size={12} className="animate-spin mr-1.5" /> : null} Reload
          </Button>
        </div>

        {/* Stripe sync */}
        <section className="royal-card p-3 space-y-2">
          <div className="flex items-center justify-between gap-2">
            <div>
              <h2 className="font-display text-sm uppercase tracking-widest text-muted-foreground">Stripe Product Sync</h2>
              <p className="text-[10px] text-muted-foreground mt-0.5">Pushes names, descriptions, tax_code & metadata to all 11 Stripe products and verifies prices.</p>
            </div>
            <div className="flex gap-2">
              <Button size="sm" variant="outline" onClick={() => runSync(true)} disabled={syncing}>
                {syncing ? <Loader2 size={12} className="animate-spin mr-1.5" /> : null} Dry run
              </Button>
              <Button size="sm" onClick={() => runSync(false)} disabled={syncing}>
                {syncing ? <Loader2 size={12} className="animate-spin mr-1.5" /> : null} Sync now
              </Button>
            </div>
          </div>
          {syncReport && (
            <div className="text-[11px] space-y-1 mt-2">
              <div className="flex gap-3">
                <span>Total: <b>{syncReport.total}</b></span>
                <span className={syncReport.errors ? "text-destructive" : "text-emerald-500"}>Errors: <b>{syncReport.errors}</b></span>
                <span className={syncReport.price_mismatches ? "text-yellow-500" : "text-emerald-500"}>Price mismatches: <b>{syncReport.price_mismatches}</b></span>
              </div>
              <details className="bg-muted/30 rounded p-2">
                <summary className="cursor-pointer text-muted-foreground">View per-product report</summary>
                <pre className="text-[10px] overflow-auto max-h-72 mt-2">{JSON.stringify(syncReport.report, null, 2)}</pre>
              </details>
            </div>
          )}
        </section>


        <div className="grid grid-cols-3 gap-2">
          <StatCard label="OK" value={summary.ok} tone="text-emerald-500" />
          <StatCard label="Warnings" value={summary.warn} tone="text-yellow-500" />
          <StatCard label="Errors" value={summary.error} tone="text-destructive" />
        </div>

        {/* Bundle config */}
        <section className="royal-card overflow-hidden">
          <div className="p-3 border-b border-border/60">
            <h2 className="font-display text-sm uppercase tracking-widest text-muted-foreground">Bundle Config</h2>
            <p className="text-[10px] text-muted-foreground mt-0.5">{shekels.length} Shekel + {boosts.length} Boost bundles</p>
          </div>
          <ul className="divide-y divide-border/60">
            {[...shekels.map((s) => ({ ...s, _kind: "shekel" as const })), ...boosts.map((b) => ({ ...b, _kind: "boost" as const, shekels: 0 }))].map((row) => {
              const issues = bundleIssues.find((x) => x.id === row.id);
              return (
                <li key={row.id} className="p-3 space-y-2">
                  <div className="flex items-center gap-3">
                    <span className={`text-[10px] px-1.5 py-0.5 rounded font-bold uppercase ${row._kind === "shekel" ? "bg-gold/20 text-gold" : "bg-primary/20 text-primary"}`}>
                      {row._kind}
                    </span>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-semibold truncate">{row.label}</div>
                      <div className="text-[10px] text-muted-foreground truncate">
                        {row.stripe_price_id} · ${Number(row.usd).toFixed(2)}
                        {row._kind === "shekel" ? ` → ${formatShekels(Number((row as ShekelBundle).shekels))} ${SHEKEL}` : ` → ${(row as BoostBundle).boost_type} (${(row as BoostBundle).duration_hours}h)`}
                      </div>
                    </div>
                  </div>
                  {issues?.problems.map((p, i) => <IssueLine key={i} {...p} />)}
                </li>
              );
            })}
          </ul>
        </section>

        {/* Ledger verification */}
        <section className="royal-card overflow-hidden">
          <div className="p-3 border-b border-border/60">
            <h2 className="font-display text-sm uppercase tracking-widest text-muted-foreground">Ledger Verification</h2>
            <p className="text-[10px] text-muted-foreground mt-0.5">Latest {ledger.length} entries — comparing actual credits to bundle config</p>
          </div>
          {ledger.length === 0 ? (
            <div className="p-6 text-center text-xs text-muted-foreground">No ledger entries yet.</div>
          ) : (
            <ul className="divide-y divide-border/60">
              {ledgerChecks.map(({ row, expected, problems }) => (
                <li key={row.id} className="p-3 space-y-1.5">
                  <div className="flex items-center gap-2 text-xs">
                    <span className="text-[9px] px-1.5 py-0.5 rounded bg-muted/60 uppercase font-bold tracking-wider">{row.kind}</span>
                    <span className="font-semibold truncate flex-1">{row.label}</span>
                    <span className="tabular-nums text-muted-foreground">
                      {Number(row.shekels_delta) !== 0 ? `${Number(row.shekels_delta) > 0 ? "+" : ""}${formatShekels(Number(row.shekels_delta))}${SHEKEL}` : "—"}
                      {row.usd_amount ? ` · $${Number(row.usd_amount).toFixed(2)}` : ""}
                    </span>
                  </div>
                  <div className="text-[10px] text-muted-foreground truncate">
                    {expected ? `Expected: ${expected.label} · $${expected.expectedUsd.toFixed(2)}${expected.expectedShekels ? ` → ${formatShekels(expected.expectedShekels)}${SHEKEL}` : ""}` : "No mapped bundle"}
                    {row.stripe_event_id ? ` · evt ${row.stripe_event_id.slice(0, 14)}…` : ""}
                  </div>
                  {problems.map((p, i) => <IssueLine key={i} {...p} />)}
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </AppShell>
  );
}

function StatCard({ label, value, tone }: { label: string; value: number; tone: string }) {
  return (
    <div className="royal-card p-3 text-center">
      <div className={`text-2xl font-bold tabular-nums ${tone}`}>{value}</div>
      <div className="text-[10px] uppercase tracking-widest text-muted-foreground">{label}</div>
    </div>
  );
}

function IssueLine({ level, msg }: Issue) {
  const cls = level === "ok"
    ? "text-emerald-500"
    : level === "warn"
      ? "text-yellow-500"
      : "text-destructive";
  const Icon = level === "ok" ? CheckCircle2 : AlertTriangle;
  return (
    <div className={`flex items-start gap-1.5 text-[11px] ${cls}`}>
      <Icon size={11} className="mt-0.5 shrink-0" /> <span>{msg}</span>
    </div>
  );
}
