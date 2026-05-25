import { useEffect, useMemo, useState } from "react";
import AppShell from "@/components/AppShell";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/context/AuthContext";
import { Navigate } from "react-router-dom";
import { Loader2, Activity, CreditCard, BarChart3, RefreshCcw } from "lucide-react";
import { timeAgo } from "@/lib/crown";
import AdminSessionHint from "@/components/admin/AdminSessionHint";

type Tab = "stripe" | "analytics" | "connect";

interface StripeEvent { id: string; type: string; received_at: string }
interface ConnectRow {
  stripe_account_id: string;
  user_id: string;
  charges_enabled: boolean;
  payouts_enabled: boolean;
  details_submitted: boolean;
  updated_at: string;
}
interface AnalyticsRow {
  id: string;
  event_name: string;
  user_hash: string | null;
  post_id: string | null;
  category: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
}

export default function AdminSystemAudit() {
  const { isAdmin, loading } = useAuth();
  const [tab, setTab] = useState<Tab>("stripe");
  const [stripe, setStripe] = useState<StripeEvent[]>([]);
  const [analytics, setAnalytics] = useState<AnalyticsRow[]>([]);
  const [connect, setConnect] = useState<ConnectRow[]>([]);
  const [busy, setBusy] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    if (!isAdmin) return;
    let cancelled = false;
    (async () => {
      setBusy(true);
      const [s, a, c] = await Promise.all([
        supabase.from("stripe_events").select("id, type, received_at").order("received_at", { ascending: false }).limit(100),
        supabase.from("analytics_events").select("id, event_name, user_hash, post_id, category, metadata, created_at").order("created_at", { ascending: false }).limit(150),
        supabase.from("connect_accounts").select("stripe_account_id, user_id, charges_enabled, payouts_enabled, details_submitted, updated_at").order("updated_at", { ascending: false }).limit(50),
      ]);
      if (cancelled) return;
      setStripe((s.data as StripeEvent[]) ?? []);
      setAnalytics((a.data as AnalyticsRow[]) ?? []);
      setConnect((c.data as ConnectRow[]) ?? []);
      setBusy(false);
    })();
    return () => { cancelled = true; };
  }, [isAdmin, refreshKey]);

  const summary = useMemo(() => ({
    stripe: stripe.length,
    analytics: analytics.length,
    connect: connect.length,
    eventTypeBreakdown: stripe.reduce<Record<string, number>>((acc, e) => {
      acc[e.type] = (acc[e.type] ?? 0) + 1;
      return acc;
    }, {}),
    analyticsBreakdown: analytics.reduce<Record<string, number>>((acc, e) => {
      acc[e.event_name] = (acc[e.event_name] ?? 0) + 1;
      return acc;
    }, {}),
  }), [stripe, analytics, connect]);

  if (loading) return <AppShell><div className="py-20 text-center">Loading…</div></AppShell>;
  if (!isAdmin) return <Navigate to="/feed" replace />;

  return (
    <AppShell title="SYSTEM AUDIT">
      <div className="px-4 py-4 space-y-4">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Activity size={20} className="text-gold" />
            <h1 className="font-display text-2xl text-gold">System Audit</h1>
          </div>
          <button
            onClick={() => setRefreshKey((k) => k + 1)}
            className="text-[11px] inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-muted/40 hover:bg-muted/60 border border-border/50"
          >
            <RefreshCcw size={12} /> Refresh
          </button>
        </div>

        <AdminSessionHint />

        {/* Summary chips */}
        <div className="grid grid-cols-3 gap-2">
          <SummaryCard icon={<CreditCard size={14} />} label="Stripe events" value={summary.stripe} active={tab === "stripe"} onClick={() => setTab("stripe")} />
          <SummaryCard icon={<RefreshCcw size={14} />} label="Connect refreshes" value={summary.connect} active={tab === "connect"} onClick={() => setTab("connect")} />
          <SummaryCard icon={<BarChart3 size={14} />} label="Analytics inserts" value={summary.analytics} active={tab === "analytics"} onClick={() => setTab("analytics")} />
        </div>

        {busy && (
          <div className="py-10 flex items-center justify-center text-muted-foreground">
            <Loader2 size={16} className="animate-spin mr-2" /> Loading entries…
          </div>
        )}

        {!busy && tab === "stripe" && (
          <Section
            title="Recent Stripe Webhook Events"
            subtitle="Deduplicated event ledger from `stripe_events`. Used by both the main webhook and Connect webhook for idempotency."
            breakdown={summary.eventTypeBreakdown}
          >
            {stripe.length === 0 ? (
              <Empty>No Stripe events recorded yet.</Empty>
            ) : (
              stripe.map((e) => (
                <Row key={e.id} title={e.type} subtitle={`event_id ${e.id.slice(0, 18)}…`} time={e.received_at} pillTone="primary" />
              ))
            )}
          </Section>
        )}

        {!busy && tab === "connect" && (
          <Section
            title="Stripe Connect Account Refreshes"
            subtitle="Most recent updates to `connect_accounts` — captures both webhook-driven and polling-driven status changes."
          >
            {connect.length === 0 ? (
              <Empty>No connected accounts yet.</Empty>
            ) : (
              connect.map((c) => {
                const fully = c.charges_enabled && c.payouts_enabled && c.details_submitted;
                return (
                  <Row
                    key={c.stripe_account_id}
                    title={fully ? "Fully connected" : "Incomplete"}
                    subtitle={`${c.stripe_account_id} · user ${c.user_id.slice(0, 8)}…`}
                    time={c.updated_at}
                    pillTone={fully ? "success" : "warn"}
                    detail={
                      <div className="flex flex-wrap gap-1.5 text-[10px]">
                        <Pill label="details" ok={c.details_submitted} />
                        <Pill label="charges" ok={c.charges_enabled} />
                        <Pill label="payouts" ok={c.payouts_enabled} />
                      </div>
                    }
                  />
                );
              })
            )}
          </Section>
        )}

        {!busy && tab === "analytics" && (
          <Section
            title="Privacy-Safe Analytics Inserts"
            subtitle="Pseudonymous events (sha256 of user_id + daily salt). Never includes raw uid, IP or UA."
            breakdown={summary.analyticsBreakdown}
          >
            {analytics.length === 0 ? (
              <Empty>No analytics events recorded yet.</Empty>
            ) : (
              analytics.map((a) => (
                <Row
                  key={a.id}
                  title={a.event_name}
                  subtitle={`hash ${(a.user_hash ?? "anon").slice(0, 12)}…${a.category ? ` · ${a.category}` : ""}${a.post_id ? ` · post ${a.post_id.slice(0, 8)}` : ""}`}
                  time={a.created_at}
                  pillTone="primary"
                  detail={
                    a.metadata && Object.keys(a.metadata).length > 0 ? (
                      <pre className="bg-muted/40 rounded p-1.5 text-[10px] overflow-x-auto">
                        {JSON.stringify(a.metadata)}
                      </pre>
                    ) : null
                  }
                />
              ))
            )}
          </Section>
        )}
      </div>
    </AppShell>
  );
}

function SummaryCard({ icon, label, value, active, onClick }: { icon: React.ReactNode; label: string; value: number; active: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={`royal-card p-3 text-left transition ${active ? "ring-1 ring-primary/60 bg-primary/5" : "hover:bg-muted/30"}`}
    >
      <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-muted-foreground">
        {icon} {label}
      </div>
      <div className="font-display text-2xl text-foreground tabular-nums mt-0.5">{value}</div>
    </button>
  );
}

function Section({ title, subtitle, children, breakdown }: { title: string; subtitle: string; children: React.ReactNode; breakdown?: Record<string, number> }) {
  return (
    <div className="space-y-2">
      <div>
        <h2 className="font-display text-sm uppercase tracking-widest text-muted-foreground">{title}</h2>
        <p className="text-[11px] text-muted-foreground/70 mt-0.5">{subtitle}</p>
      </div>
      {breakdown && Object.keys(breakdown).length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {Object.entries(breakdown).map(([k, v]) => (
            <span key={k} className="text-[10px] px-2 py-0.5 rounded-full bg-primary/10 text-primary border border-primary/20">
              {k} <span className="opacity-70">({v})</span>
            </span>
          ))}
        </div>
      )}
      <div className="space-y-2">{children}</div>
    </div>
  );
}

function Row({
  title, subtitle, time, pillTone = "primary", detail,
}: {
  title: string; subtitle: string; time: string; pillTone?: "primary" | "success" | "warn"; detail?: React.ReactNode;
}) {
  const toneClass = pillTone === "success"
    ? "bg-emerald-500/10 text-emerald-300 border-emerald-500/30"
    : pillTone === "warn"
      ? "bg-amber-500/10 text-amber-300 border-amber-500/30"
      : "bg-primary/10 text-primary border-primary/20";
  return (
    <div className="royal-card p-3 space-y-1.5">
      <div className="flex items-center justify-between gap-2">
        <span className={`text-[11px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full border ${toneClass}`}>{title}</span>
        <span className="text-[10px] text-muted-foreground">{timeAgo(time)}</span>
      </div>
      <div className="text-[11px] text-muted-foreground break-all">{subtitle}</div>
      {detail}
    </div>
  );
}

function Pill({ label, ok }: { label: string; ok: boolean }) {
  return (
    <span className={`px-1.5 py-0.5 rounded-full border ${ok ? "bg-emerald-500/10 text-emerald-300 border-emerald-500/30" : "bg-amber-500/10 text-amber-300 border-amber-500/30"}`}>
      {label}: {ok ? "✓" : "—"}
    </span>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return <p className="text-center text-sm text-muted-foreground py-10">{children}</p>;
}
