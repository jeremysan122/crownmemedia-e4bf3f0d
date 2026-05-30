import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { SectionCard, EmptyState, StatTile, PillBadge } from "@/components/admin/cc/CommandCenterUI";
import { ConnectionStatus } from "@/components/admin/cc/ConnectionStatus";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { freezePayout, unfreezePayout, markPayoutPaid } from "@/lib/admin";
import { useAdminRoles } from "@/hooks/useAdminRoles";
import { useRealtimeStatus } from "@/hooks/useRealtimeStatus";
import { toast } from "sonner";

const fmt = (n: number) => `$${n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const PAGE = 25;

type Payout = {
  id: string;
  user_id: string;
  amount_usd: number;
  status: string;
  frozen?: boolean | null;
  frozen_reason?: string | null;
  created_at: string;
  paid_at?: string | null;
};

export default function CommandCenterFinance() {
  const [snapshots, setSnapshots] = useState<any[]>([]);
  const [ledgerToday, setLedgerToday] = useState<number>(0);
  const [payoutsTotal, setPayoutsTotal] = useState<number>(0);
  const [activeSubs, setActiveSubs] = useState<number>(0);
  const [recentLedger, setRecentLedger] = useState<any[]>([]);

  const [payouts, setPayouts] = useState<Payout[]>([]);
  const [page, setPage] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | "pending" | "paid" | "frozen">("all");
  const roles = useAdminRoles();

  // Returns true if a payout matches the active filter+search (used to gate realtime merges)
  const matches = (r: Payout) => {
    if (statusFilter === "frozen" && !r.frozen) return false;
    if (statusFilter !== "all" && statusFilter !== "frozen" && r.status !== statusFilter) return false;
    if (search.trim() && !r.user_id.includes(search.trim())) return false;
    return true;
  };

  const loadStats = async () => {
    const dayStart = new Date(); dayStart.setHours(0,0,0,0);
    const [snaps, ledger, paidPayouts, subs, recent] = await Promise.all([
      supabase.from("finance_snapshots").select("*").order("snapshot_date", { ascending: false }).limit(30),
      supabase.from("shekel_ledger").select("usd_amount").not("usd_amount","is",null).gte("created_at", dayStart.toISOString()),
      supabase.from("payouts").select("amount_usd").eq("status","paid"),
      supabase.from("royal_pass_subscriptions").select("id", { count: "exact", head: true }).eq("status","active"),
      supabase.from("shekel_ledger").select("id, kind, label, shekels_delta, usd_amount, created_at").order("created_at", { ascending: false }).limit(15),
    ]);
    setSnapshots(snaps.data ?? []);
    setLedgerToday((ledger.data ?? []).reduce((sum: number, r: any) => sum + Number(r.usd_amount ?? 0), 0));
    setPayoutsTotal((paidPayouts.data ?? []).reduce((sum: number, r: any) => sum + Number(r.amount_usd ?? 0), 0));
    setActiveSubs(subs.count ?? 0);
    setRecentLedger(recent.data ?? []);
  };

  const loadPayouts = async () => {
    let q = supabase
      .from("payouts")
      .select("*")
      .order("created_at", { ascending: false })
      .range(page * PAGE, page * PAGE + PAGE);
    if (statusFilter === "frozen") q = q.eq("frozen", true);
    else if (statusFilter !== "all") q = q.eq("status", statusFilter);
    if (search.trim()) q = q.ilike("user_id", `%${search.trim()}%`);
    const { data } = await q;
    const items = (data ?? []) as Payout[];
    setHasMore(items.length > PAGE);
    setPayouts(items.slice(0, PAGE));
  };

  useEffect(() => { loadStats(); }, []);
  useEffect(() => { loadPayouts(); /* eslint-disable-next-line */ }, [page, statusFilter, search]);

  // Polling fallback. payouts + shekel_ledger were removed from the Realtime
  // publication (financial CDC events could leak across users via crafted topics).
  // Admin Finance refreshes every 15s while mounted and on window focus.
  useEffect(() => {
    const tick = () => { void loadStats(); void loadPayouts(); };
    const interval = window.setInterval(tick, 15_000);
    const onFocus = () => tick();
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onFocus);
    return () => {
      window.clearInterval(interval);
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onFocus);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, statusFilter, search]);
  const rt = { status: "polling" as const, retryIn: 0 };

  const onFreeze = async (id: string) => {
    if (!roles.canFreezePayouts) { toast.error("Not authorized"); return; }
    const reason = window.prompt("Freeze reason:");
    if (!reason) return;
    try { await freezePayout(id, reason); toast.success("Payout frozen"); }
    catch (e: any) { toast.error(e.message ?? "Failed"); }
  };
  const onUnfreeze = async (id: string) => {
    if (!roles.canFreezePayouts) { toast.error("Not authorized"); return; }
    if (!window.confirm("Unfreeze this payout?")) return;
    try { await unfreezePayout(id); toast.success("Unfrozen"); }
    catch (e: any) { toast.error(e.message ?? "Failed"); }
  };
  const onMarkPaid = async (id: string) => {
    if (!roles.canMarkPaid) { toast.error("Not authorized"); return; }
    if (!window.confirm("Mark payout as paid?")) return;
    try { await markPayoutPaid(id); toast.success("Marked paid"); loadStats(); }
    catch (e: any) { toast.error(e.message ?? "Failed"); }
  };

  const pendingTotal = useMemo(() => payouts.filter(p => p.status === "pending").reduce((s, p) => s + Number(p.amount_usd ?? 0), 0), [payouts]);
  const frozenCount = useMemo(() => payouts.filter(p => p.frozen).length, [payouts]);

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-end">
        <ConnectionStatus status={rt.status} retryIn={rt.retryIn} label="payouts" />
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        <StatTile label="Revenue Today" value={fmt(ledgerToday)} tone="good" />
        <StatTile label="Payouts (paid)" value={fmt(payoutsTotal)} />
        <StatTile label="Active Subs" value={activeSubs} tone="good" />
        <StatTile label="Pending (page)" value={fmt(pendingTotal)} tone={frozenCount > 0 ? "warn" : "default"} hint={`${frozenCount} frozen`} />
      </div>

      <SectionCard
        title={`Payouts · page ${page + 1}`}
        action={
          <div className="flex gap-1.5">
            <Input
              value={search}
              onChange={(e) => { setPage(0); setSearch(e.target.value); }}
              placeholder="user_id…"
              className="h-7 w-32 text-[11px]"
            />
            <select
              value={statusFilter}
              onChange={(e) => { setPage(0); setStatusFilter(e.target.value as any); }}
              className="h-7 rounded border border-border/60 bg-background px-2 text-[11px]"
            >
              <option value="all">All</option>
              <option value="pending">Pending</option>
              <option value="paid">Paid</option>
              <option value="frozen">Frozen</option>
            </select>
          </div>
        }
      >
        {payouts.length === 0 ? <EmptyState message="No payouts match." /> : (
          <ul className="divide-y divide-border/40">
            {payouts.map((p) => (
              <li key={p.id} className="py-2 space-y-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <PillBadge tone={p.status === "paid" ? "good" : p.frozen ? "bad" : "warn"}>{p.status}</PillBadge>
                  {p.frozen ? <PillBadge tone="bad">frozen</PillBadge> : null}
                  <span className="font-mono text-[11px] text-muted-foreground">{p.user_id.slice(0,8)}…</span>
                  <span className="ml-auto font-medium">{fmt(Number(p.amount_usd))}</span>
                </div>
                {p.frozen_reason ? <div className="text-[11px] text-muted-foreground">Frozen: {p.frozen_reason}</div> : null}
                <div className="flex items-center gap-2">
                  <span className="text-[10px] text-muted-foreground">{new Date(p.created_at).toLocaleString()}</span>
                  <div className="ml-auto flex gap-2">
                    {p.status !== "paid" && !p.frozen && roles.canFreezePayouts && (
                      <Button size="sm" variant="destructive" className="h-7 text-[10px]" onClick={() => onFreeze(p.id)}>Freeze</Button>
                    )}
                    {p.frozen && roles.canFreezePayouts && (
                      <Button size="sm" variant="outline" className="h-7 text-[10px]" onClick={() => onUnfreeze(p.id)}>Unfreeze</Button>
                    )}
                    {p.status !== "paid" && !p.frozen && roles.canMarkPaid && (
                      <Button size="sm" className="h-7 text-[10px]" onClick={() => onMarkPaid(p.id)}>Mark paid</Button>
                    )}
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
        <div className="mt-3 flex items-center justify-between">
          <Button size="sm" variant="outline" className="h-7 text-[10px]" disabled={page === 0} onClick={() => setPage(p => Math.max(0, p - 1))}>Prev</Button>
          <span className="text-[10px] text-muted-foreground">Page {page + 1}</span>
          <Button size="sm" variant="outline" className="h-7 text-[10px]" disabled={!hasMore} onClick={() => setPage(p => p + 1)}>Next</Button>
        </div>
      </SectionCard>

      <SectionCard title="Daily Snapshots">
        {snapshots.length === 0 ? (
          <EmptyState message="No daily snapshots yet — run the finance roll-up job to populate." />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="text-[10px] uppercase tracking-wider text-muted-foreground">
                <tr><th className="text-left py-1.5">Date</th><th className="text-right">Revenue</th><th className="text-right">Payouts</th><th className="text-right">Refunds</th><th className="text-right">Net</th><th className="text-right">Subs</th></tr>
              </thead>
              <tbody className="divide-y divide-border/40">
                {snapshots.map((s) => (
                  <tr key={s.id}>
                    <td className="py-1.5">{s.snapshot_date}</td>
                    <td className="text-right text-emerald-400">{fmt(Number(s.revenue_usd))}</td>
                    <td className="text-right">{fmt(Number(s.payouts_usd))}</td>
                    <td className="text-right text-rose-400">{fmt(Number(s.refunds_usd))}</td>
                    <td className="text-right">{fmt(Number(s.net_usd))}</td>
                    <td className="text-right">{s.active_subscriptions}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </SectionCard>

      <SectionCard title="Recent Ledger Entries">
        {recentLedger.length === 0 ? <EmptyState message="No ledger activity yet." /> : (
          <ul className="divide-y divide-border/40 text-xs">
            {recentLedger.map((l) => (
              <li key={l.id} className="py-1.5 flex items-center gap-2">
                <span className="font-mono text-[10px] text-muted-foreground">{l.kind}</span>
                <span className="flex-1 truncate">{l.label}</span>
                <span className={Number(l.shekels_delta) >= 0 ? "text-emerald-400" : "text-rose-400"}>{l.shekels_delta}</span>
                {l.usd_amount ? <span className="text-muted-foreground">{fmt(Number(l.usd_amount))}</span> : null}
              </li>
            ))}
          </ul>
        )}
      </SectionCard>
    </div>
  );
}
