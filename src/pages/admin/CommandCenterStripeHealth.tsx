import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { getStripeEnvironment } from "@/lib/stripe";
import { SectionCard, EmptyState, StatTile } from "@/components/admin/cc/CommandCenterUI";
import { Loader2, RefreshCw, CheckCircle2, AlertTriangle, RotateCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

interface StripeEvent { id: string; type: string; received_at: string }
interface LedgerRow {
  id: string; kind: string; shekels_delta: number; usd_amount: number | null;
  label: string; stripe_session_id: string | null; user_id: string; created_at: string;
}
interface PayoutRow {
  id: string; user_id: string; amount_usd: number; status: string;
  stripe_payout_id: string | null; created_at: string; paid_at: string | null;
}
interface ConnectAcct {
  user_id: string; stripe_account_id: string;
  charges_enabled: boolean; payouts_enabled: boolean; details_submitted: boolean;
  updated_at: string;
}

export default function CommandCenterStripeHealth() {
  const [loading, setLoading] = useState(true);
  const [events, setEvents] = useState<StripeEvent[]>([]);
  const [ledger, setLedger] = useState<LedgerRow[]>([]);
  const [payouts, setPayouts] = useState<PayoutRow[]>([]);
  const [connects, setConnects] = useState<ConnectAcct[]>([]);
  const [lastPurchaseAt, setLastPurchaseAt] = useState<string | null>(null);
  const [lastPayoutAt, setLastPayoutAt] = useState<string | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [lastSyncedAt, setLastSyncedAt] = useState<number | null>(null);

  const refreshRoyalPassEntitlements = async () => {
    setSyncing(true);
    const t = toast.loading("Re-checking Stripe & Royal Pass entitlements…");
    try {
      const { data, error } = await supabase.functions.invoke("royal-pass-sync", {
        body: { environment: getStripeEnvironment() },
      });
      if (error) throw error;
      const errMsg = (data as { error?: string })?.error;
      if (errMsg) throw new Error(errMsg);
      setLastSyncedAt(Date.now());
      toast.success("Entitlements refreshed from Stripe", { id: t });
    } catch (e) {
      toast.error((e as Error).message || "Refresh failed", { id: t });
    } finally {
      setSyncing(false);
    }
  };

  const load = async () => {
    setLoading(true);
    const [evs, led, pay, conn] = await Promise.all([
      supabase.from("stripe_events").select("*").order("received_at", { ascending: false }).limit(50),
      supabase.from("shekel_ledger").select("*")
        .not("stripe_session_id", "is", null)
        .order("created_at", { ascending: false }).limit(25),
      supabase.from("payouts").select("*").order("created_at", { ascending: false }).limit(25),
      supabase.from("connect_accounts").select("*").order("updated_at", { ascending: false }).limit(25),
    ]);
    setEvents((evs.data as StripeEvent[]) || []);
    setLedger((led.data as LedgerRow[]) || []);
    setPayouts((pay.data as PayoutRow[]) || []);
    setConnects((conn.data as ConnectAcct[]) || []);
    setLastPurchaseAt(((led.data as LedgerRow[]) || [])[0]?.created_at || null);
    setLastPayoutAt(((pay.data as PayoutRow[]) || []).find((p) => p.paid_at)?.paid_at || null);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const lastEventAt = events[0]?.received_at;
  const fmt = (s: string | null) => s ? new Date(s).toLocaleString() : "—";
  const ago = (s: string | null) => {
    if (!s) return "never";
    const m = Math.floor((Date.now() - new Date(s).getTime()) / 60000);
    if (m < 1) return "just now";
    if (m < 60) return `${m}m ago`;
    const h = Math.floor(m / 60);
    if (h < 24) return `${h}h ago`;
    return `${Math.floor(h / 24)}d ago`;
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="font-display text-lg">Stripe Health</h2>
          <p className="text-xs text-muted-foreground">Webhook events, ledger entries, payouts, and connected accounts</p>
        </div>
        <Button variant="outline" size="sm" onClick={load} disabled={loading}>
          {loading ? <Loader2 size={14} className="mr-1.5 animate-spin" /> : <RefreshCw size={14} className="mr-1.5" />}
          Refresh
        </Button>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatTile label="Last webhook" value={ago(lastEventAt)} />
        <StatTile label="Last purchase credited" value={ago(lastPurchaseAt)} />
        <StatTile label="Last payout paid" value={ago(lastPayoutAt)} />
        <StatTile label="Webhook events (50)" value={String(events.length)} />
      </div>

      <SectionCard title="Royal Pass admin tools">
        <div className="p-4 space-y-2">
          <p className="text-xs text-muted-foreground">
            Re-hydrate the Royal Pass subscription row directly from Stripe. Useful for testing without waiting for a webhook retry.
          </p>
          <Button
            onClick={refreshRoyalPassEntitlements}
            disabled={syncing}
            variant="outline"
            className="w-full border-gold/40 text-gold hover:bg-gold/10"
          >
            {syncing
              ? <Loader2 size={14} className="animate-spin mr-2" />
              : <RotateCw size={14} className="mr-2" />}
            Refresh Entitlements from Stripe
          </Button>
          {lastSyncedAt && (
            <p className="text-[10px] text-muted-foreground text-center">
              Last refreshed {new Date(lastSyncedAt).toLocaleTimeString(undefined, {
                hour: "numeric", minute: "2-digit", second: "2-digit",
              })}
            </p>
          )}
        </div>
      </SectionCard>


      <SectionCard title="Latest webhook events">
        {loading ? <div className="p-6 flex items-center justify-center text-muted-foreground"><Loader2 size={14} className="animate-spin mr-2" /> Loading…</div> :
          events.length === 0 ? <EmptyState message="No events yet" /> : (
            <div className="divide-y divide-border/60 text-xs max-h-80 overflow-y-auto">
              {events.map((e) => (
                <div key={e.id} className="p-2 grid grid-cols-12 gap-2 items-center">
                  <span className="col-span-5 font-mono truncate">{e.type}</span>
                  <span className="col-span-5 font-mono truncate text-muted-foreground">{e.id}</span>
                  <span className="col-span-2 text-right text-muted-foreground tabular-nums">{ago(e.received_at)}</span>
                </div>
              ))}
            </div>
          )}
      </SectionCard>

      <SectionCard title="Recent purchase ledger entries">
        {loading ? <div className="p-6 flex items-center justify-center text-muted-foreground"><Loader2 size={14} className="animate-spin mr-2" /> Loading…</div> :
          ledger.length === 0 ? <EmptyState message="No purchases yet" /> : (
            <div className="divide-y divide-border/60 text-xs max-h-80 overflow-y-auto">
              {ledger.map((l) => (
                <div key={l.id} className="p-2 grid grid-cols-12 gap-2 items-center">
                  <span className="col-span-3 font-mono text-muted-foreground truncate">{l.user_id.slice(0, 8)}…</span>
                  <span className="col-span-3 truncate">{l.label}</span>
                  <span className="col-span-2 text-muted-foreground">{l.kind}</span>
                  <span className="col-span-2 tabular-nums">{l.shekels_delta > 0 ? "+" : ""}{l.shekels_delta} · ${Number(l.usd_amount ?? 0).toFixed(2)}</span>
                  <span className="col-span-2 text-right text-muted-foreground tabular-nums">{ago(l.created_at)}</span>
                </div>
              ))}
            </div>
          )}
      </SectionCard>

      <SectionCard title="Recent payouts">
        {loading ? <div className="p-6 flex items-center justify-center text-muted-foreground"><Loader2 size={14} className="animate-spin mr-2" /> Loading…</div> :
          payouts.length === 0 ? <EmptyState message="No payouts yet" /> : (
            <div className="divide-y divide-border/60 text-xs max-h-80 overflow-y-auto">
              {payouts.map((p) => (
                <div key={p.id} className="p-2 grid grid-cols-12 gap-2 items-center">
                  <span className="col-span-3 font-mono text-muted-foreground truncate">{p.user_id.slice(0, 8)}…</span>
                  <span className="col-span-2 tabular-nums">${Number(p.amount_usd).toFixed(2)}</span>
                  <span className={`col-span-2 uppercase font-bold ${p.status === "paid" ? "text-emerald-500" : p.status === "frozen" ? "text-destructive" : "text-gold"}`}>{p.status}</span>
                  <span className="col-span-3 font-mono text-muted-foreground truncate">{p.stripe_payout_id || "—"}</span>
                  <span className="col-span-2 text-right text-muted-foreground tabular-nums">{ago(p.created_at)}</span>
                </div>
              ))}
            </div>
          )}
      </SectionCard>

      <SectionCard title="Connected accounts">
        {loading ? <div className="p-6 flex items-center justify-center text-muted-foreground"><Loader2 size={14} className="animate-spin mr-2" /> Loading…</div> :
          connects.length === 0 ? <EmptyState message="No connected accounts yet" /> : (
            <div className="divide-y divide-border/60 text-xs max-h-80 overflow-y-auto">
              {connects.map((c) => {
                const ready = c.charges_enabled && c.payouts_enabled && c.details_submitted;
                return (
                  <div key={c.user_id} className="p-2 grid grid-cols-12 gap-2 items-center">
                    <span className="col-span-3 font-mono text-muted-foreground truncate">{c.user_id.slice(0, 8)}…</span>
                    <span className="col-span-4 font-mono truncate">{c.stripe_account_id}</span>
                    <span className="col-span-3 flex items-center gap-1">
                      {ready ? <CheckCircle2 size={12} className="text-emerald-500" /> : <AlertTriangle size={12} className="text-gold" />}
                      <span className="text-muted-foreground">
                        {c.details_submitted ? "details" : "—"} · {c.charges_enabled ? "charges" : "—"} · {c.payouts_enabled ? "payouts" : "—"}
                      </span>
                    </span>
                    <span className="col-span-2 text-right text-muted-foreground tabular-nums">{ago(c.updated_at)}</span>
                  </div>
                );
              })}
            </div>
          )}
      </SectionCard>
    </div>
  );
}
