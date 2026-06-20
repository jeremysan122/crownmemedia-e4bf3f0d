import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/context/AuthContext";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Banknote,
  Loader2,
  ArrowDownCircle,
  AlertCircle,
  CheckCircle2,
  ShoppingBag,
  Gift,
  ScrollText,
  ChevronDown,
  ChevronUp,
  Lock,
} from "lucide-react";
import { toast } from "sonner";
import { SHEKEL, formatShekels } from "@/lib/gifts";

// Keep in sync with supabase/functions/request-payout/index.ts
const SHEKELS_PER_USD = 1000;
const USD_PER_SHEKEL = 1 / SHEKELS_PER_USD;
const MIN_PAYOUT_USD = 25;
const MIN_SHEKELS_PAYOUT = MIN_PAYOUT_USD * SHEKELS_PER_USD;

interface PayoutRow {
  id: string;
  amount_usd: number;
  status: string;
  created_at: string;
  paid_at: string | null;
  shekels_locked: number | null;
  metadata: {
    conversion?: { shekels_per_usd?: number; usd_per_shekel?: number };
    eligible_batch?: Array<{ id: string; created_at: string; shekels: number; partial?: boolean }>;
    batch_size?: number;
    totals?: Record<string, number>;
  } | null;
}
interface ConnectAccount {
  charges_enabled: boolean;
  payouts_enabled: boolean;
  details_submitted: boolean;
}

const statusTone = (s: string) =>
  s === "paid" ? "text-emerald-400" :
  s === "pending" ? "text-gold" :
  s === "frozen" ? "text-destructive" : "text-muted-foreground";

const fmtDate = (s: string) =>
  new Date(s).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });

export default function PayoutPanel() {
  const { user } = useAuth();
  const [giftEarnedShekels, setGiftEarnedShekels] = useState(0);
  const [nonCompletedCount, setNonCompletedCount] = useState(0);
  const [walletTotalEarned, setWalletTotalEarned] = useState(0);
  const [walletBalance, setWalletBalance] = useState(0);
  const [payouts, setPayouts] = useState<PayoutRow[]>([]);
  const [connect, setConnect] = useState<ConnectAccount | null>(null);
  const [loading, setLoading] = useState(true);
  const [requesting, setRequesting] = useState(false);
  const [expandedAudit, setExpandedAudit] = useState<string | null>(null);

  const reload = useCallback(async () => {
    if (!user) return;
    const [payoutRows, connectRow, giftRows, walletRow, liveStatus] = await Promise.all([
      supabase.from("payouts")
        .select("id, amount_usd, status, created_at, paid_at, shekels_locked, metadata")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false })
        .limit(20),
      supabase.from("connect_accounts")
        .select("charges_enabled, payouts_enabled, details_submitted")
        .eq("user_id", user.id)
        .maybeSingle(),
      supabase.from("gift_transactions")
        .select("receiver_earnings_shekels, status")
        .eq("receiver_id", user.id),
      supabase.from("wallets")
        .select("shekel_balance, total_earned")
        .eq("user_id", user.id)
        .maybeSingle(),
      // Live source of truth — matches StripeConnectSection so the two panels
      // never disagree when the cached connect_accounts row is stale/missing.
      supabase.functions.invoke("connect-account-status", { body: {} })
        .then((r) => r.data as { connected?: boolean; charges_enabled?: boolean; payouts_enabled?: boolean; details_submitted?: boolean } | null)
        .catch(() => null),
    ]);
    setPayouts((payoutRows.data as PayoutRow[]) || []);
    const cached = (connectRow.data as ConnectAccount) || null;
    if (liveStatus?.connected) {
      setConnect({
        charges_enabled: !!liveStatus.charges_enabled,
        payouts_enabled: !!liveStatus.payouts_enabled,
        details_submitted: !!liveStatus.details_submitted,
      });
    } else {
      setConnect(cached);
    }
    const all = (giftRows.data ?? []) as Array<{ receiver_earnings_shekels: number | string; status: string }>;
    setGiftEarnedShekels(
      all.filter((r) => r.status === "completed")
        .reduce((s, r) => s + Number(r.receiver_earnings_shekels ?? 0), 0),
    );
    setNonCompletedCount(all.filter((r) => r.status !== "completed").length);
    const w = walletRow.data as { shekel_balance: number | string; total_earned: number | string } | null;
    setWalletTotalEarned(Number(w?.total_earned ?? 0));
    setWalletBalance(Number(w?.shekel_balance ?? 0));
  }, [user]);

  useEffect(() => {
    if (!user) return;
    (async () => { setLoading(true); await reload(); setLoading(false); })();
  }, [user, reload]);

  // Polling fallback. payouts is no longer in the Realtime publication
  // (financial CDC events could leak across users via crafted topics).
  useEffect(() => {
    if (!user) return;
    const onFocus = () => { void reload(); };
    const interval = window.setInterval(() => { void reload(); }, 30_000);
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onFocus);
    return () => {
      window.clearInterval(interval);
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onFocus);
    };
  }, [user, reload]);

  const lockedShekels = useMemo(
    () => payouts
      .filter((p) => p.status === "pending" || p.status === "paid")
      .reduce((s, p) => {
        const locked = Number(p.shekels_locked ?? 0);
        return s + (locked > 0 ? locked : Number(p.amount_usd ?? 0) * SHEKELS_PER_USD);
      }, 0),
    [payouts],
  );
  const lockedUsd = lockedShekels / SHEKELS_PER_USD;
  const availableShekels = Math.max(0, giftEarnedShekels - lockedShekels);
  const availableUsd = availableShekels * USD_PER_SHEKEL;
  // Anything in total_earned beyond completed gift earnings is non-cashable
  // (invite bonuses, future promo credits, etc.) Surfaced for transparency.
  const nonCashableEarned = Math.max(0, walletTotalEarned - giftEarnedShekels);
  const purchasedOrPromo = Math.max(0, walletBalance - availableShekels);

  const stripeReady = !!connect?.charges_enabled && !!connect?.payouts_enabled && !!connect?.details_submitted;
  const hasConnect = !!connect;
  const meetsThreshold = availableShekels >= MIN_SHEKELS_PAYOUT;
  const noPending = nonCompletedCount === 0;
  const canPayout = stripeReady && meetsThreshold && noPending;

  const blockingReason = !hasConnect
    ? "Connect a Stripe account to receive payouts."
    : !stripeReady
    ? "Finish Stripe onboarding above — charges, payouts, and details must all be enabled."
    : !noPending
    ? `${nonCompletedCount} gift transaction${nonCompletedCount === 1 ? "" : "s"} still pending review — payout locked until resolved.`
    : !meetsThreshold
    ? `You need at least ${MIN_SHEKELS_PAYOUT.toLocaleString()} ${SHEKEL} ($${MIN_PAYOUT_USD}) of eligible gift earnings.`
    : null;

  const requestPayout = async () => {
    setRequesting(true);
    try {
      const { data, error } = await supabase.functions.invoke("request-payout", { body: {} });
      if (error) throw error;
      const errMsg = (data as { error?: string; message?: string })?.error;
      if (errMsg) throw new Error((data as { message?: string })?.message || errMsg);
      toast.success(`Payout requested · $${Number((data as { amount_usd: number }).amount_usd).toFixed(2)}`);
      await reload();
    } catch (e) {
      toast.error((e as Error).message || "Could not request payout");
    } finally {
      setRequesting(false);
    }
  };

  return (
    <section className="royal-card p-4 space-y-4" aria-label="Payout balance">
      <div className="flex items-center justify-between">
        <h2 className="font-display text-sm uppercase tracking-widest text-muted-foreground flex items-center gap-2">
          <Banknote size={16} /> Receive Payout
        </h2>
        <Link to="/wallet" className="text-[11px] text-primary hover:underline">Wallet history →</Link>
      </div>

      {loading ? (
        <>
          <Skeleton className="h-20 w-full" />
          <Skeleton className="h-10 w-full" />
        </>
      ) : (
        <>
          {/* Breakdown: gifts vs purchased vs eligible */}
          <div className="rounded-lg border border-border/60 bg-card/30 p-3 space-y-2">
            <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
              Wallet breakdown
            </div>
            <BreakdownRow
              icon={<Gift size={12} className="text-gold" />}
              label="Gift earnings (cashable)"
              shekels={giftEarnedShekels}
              tone="gold"
            />
            <BreakdownRow
              icon={<ShoppingBag size={12} className="text-muted-foreground" />}
              label="Purchased / bonus Shekels"
              shekels={purchasedOrPromo + nonCashableEarned}
              tone="muted"
              hint="Not eligible for cashout"
            />
            <div className="border-t border-border/40 pt-2 mt-1">
              <BreakdownRow
                icon={<Lock size={12} className="text-foreground" />}
                label="Locked by pending/paid payouts"
                shekels={lockedShekels}
                tone="muted"
              />
              <BreakdownRow
                icon={<CheckCircle2 size={12} className="text-emerald-400" />}
                label="Eligible for payout"
                shekels={availableShekels}
                tone="emerald"
                bold
              />
            </div>
          </div>

          {/* Conversion + live USD preview */}
          <div className="grid grid-cols-2 gap-2">
            <div className="rounded-lg bg-muted/30 border border-border/60 p-3">
              <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Conversion rate</div>
              <div className="font-bold tabular-nums text-foreground text-base">
                {SHEKELS_PER_USD} {SHEKEL} = $1
              </div>
              <div className="text-[10px] text-muted-foreground tabular-nums">
                ${USD_PER_SHEKEL.toFixed(4)} per {SHEKEL}
              </div>
            </div>
            <div className="rounded-lg bg-muted/30 border border-border/60 p-3">
              <div className="text-[10px] uppercase tracking-wider text-muted-foreground">You'll receive</div>
              <div className="font-bold tabular-nums text-gold text-lg">${availableUsd.toFixed(2)}</div>
              <div className="text-[10px] text-muted-foreground tabular-nums">
                from {formatShekels(availableShekels)} {SHEKEL}
              </div>
            </div>
          </div>

          {/* Eligibility checklist */}
          <div className="rounded-lg border border-border/60 bg-card/30 p-3 space-y-1.5">
            <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">
              Eligibility
            </div>
            <CheckItem ok={hasConnect} label="Stripe account connected" />
            <CheckItem ok={stripeReady} label="Stripe charges + payouts + details enabled" />
            <CheckItem ok={noPending} label="No gift earnings pending review" />
            <CheckItem
              ok={meetsThreshold}
              label={`At least $${MIN_PAYOUT_USD} (${MIN_SHEKELS_PAYOUT.toLocaleString()} ${SHEKEL}) eligible`}
            />
          </div>

          {canPayout ? (
            <div className="flex items-start gap-2 text-[11px] text-emerald-300 bg-emerald-500/10 border border-emerald-500/30 rounded-lg px-2.5 py-2">
              <CheckCircle2 size={12} className="mt-0.5 shrink-0" />
              <span>You're eligible. Requests are reviewed and paid via Stripe — usually within 1–3 business days.</span>
            </div>
          ) : (
            <div className="flex items-start gap-2 text-[11px] text-amber-300 bg-amber-500/10 border border-amber-500/30 rounded-lg px-2.5 py-2">
              <AlertCircle size={12} className="mt-0.5 shrink-0" />
              <span>{blockingReason}</span>
            </div>
          )}

          {lockedUsd > 0 && (
            <div className="text-[10px] text-muted-foreground tabular-nums text-right">
              Currently locked: ${lockedUsd.toFixed(2)} · {formatShekels(lockedShekels)} {SHEKEL}
            </div>
          )}

          <Button
            onClick={requestPayout}
            disabled={!canPayout || requesting}
            className="w-full bg-gradient-gold text-primary-foreground"
          >
            {requesting ? (
              <Loader2 size={14} className="mr-1.5 animate-spin" />
            ) : (
              <ArrowDownCircle size={14} className="mr-1.5" />
            )}
            {canPayout ? `Request payout · $${availableUsd.toFixed(2)}` : `Need $${MIN_PAYOUT_USD} minimum`}
          </Button>

          {/* Audit panel: per-payout eligible batches */}
          {payouts.length > 0 && (
            <div className="space-y-2 pt-3 border-t border-border/40">
              <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-muted-foreground">
                <ScrollText size={11} /> Payout audit log
              </div>
              <div className="space-y-1.5">
                {payouts.map((p) => {
                  const open = expandedAudit === p.id;
                  const batch = p.metadata?.eligible_batch ?? [];
                  const rate = p.metadata?.conversion?.shekels_per_usd ?? SHEKELS_PER_USD;
                  const locked = Number(p.shekels_locked ?? 0);
                  return (
                    <div key={p.id} className="rounded-md border border-border/50 bg-muted/10">
                      <button
                        type="button"
                        onClick={() => setExpandedAudit(open ? null : p.id)}
                        className="w-full flex items-center gap-2 px-2.5 py-2 text-left hover:bg-muted/20 rounded-md"
                      >
                        <span className="text-muted-foreground tabular-nums text-[11px] w-20">
                          {fmtDate(p.created_at)}
                        </span>
                        <span className="font-semibold tabular-nums text-xs">
                          ${Number(p.amount_usd).toFixed(2)}
                        </span>
                        <span className={`uppercase text-[10px] font-bold ${statusTone(p.status)}`}>
                          {p.status}
                        </span>
                        <span className="text-[10px] text-muted-foreground ml-auto tabular-nums">
                          {batch.length} gift{batch.length === 1 ? "" : "s"}
                        </span>
                        {open ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
                      </button>
                      {open && (
                        <div className="px-2.5 pb-2.5 pt-1 space-y-1.5 text-[11px] border-t border-border/40">
                          <div className="grid grid-cols-2 gap-2 text-muted-foreground">
                            <div>Locked: <span className="text-foreground tabular-nums">{formatShekels(locked)} {SHEKEL}</span></div>
                            <div>Rate: <span className="text-foreground tabular-nums">{rate} {SHEKEL} = $1</span></div>
                            {p.paid_at && (
                              <div className="col-span-2">
                                Paid: <span className="text-emerald-400">{fmtDate(p.paid_at)}</span>
                              </div>
                            )}
                          </div>
                          {batch.length === 0 ? (
                            <div className="text-muted-foreground italic">
                              Legacy payout — pre-dates per-request batch tracking.
                            </div>
                          ) : (
                            <div className="max-h-48 overflow-y-auto divide-y divide-border/30 rounded border border-border/40">
                              {batch.map((b) => (
                                <Link
                                  key={b.id}
                                  to={`/wallet?gift=${b.id}`}
                                  className="grid grid-cols-12 gap-1 px-2 py-1 hover:bg-muted/20 transition-colors font-mono text-[10px]"
                                  title={b.id}
                                >
                                  <span className="col-span-5 truncate text-muted-foreground">{b.id.slice(0, 8)}…</span>
                                  <span className="col-span-4 text-muted-foreground tabular-nums">
                                    {fmtDate(b.created_at)}
                                  </span>
                                  <span className="col-span-3 text-right tabular-nums text-gold">
                                    {formatShekels(b.shekels)}{b.partial ? "*" : ""}
                                  </span>
                                </Link>
                              ))}
                            </div>
                          )}
                          {batch.some((b) => b.partial) && (
                            <div className="text-[10px] text-muted-foreground">* partially consumed by this payout</div>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </>
      )}
    </section>
  );
}

function BreakdownRow({
  icon,
  label,
  shekels,
  tone,
  hint,
  bold,
}: {
  icon: React.ReactNode;
  label: string;
  shekels: number;
  tone: "gold" | "muted" | "emerald";
  hint?: string;
  bold?: boolean;
}) {
  const valueTone =
    tone === "gold" ? "text-gold" : tone === "emerald" ? "text-emerald-400" : "text-foreground";
  const usd = shekels * USD_PER_SHEKEL;
  return (
    <div className="flex items-center justify-between gap-2 text-xs">
      <span className="flex items-center gap-1.5 text-muted-foreground">
        {icon}
        <span className={bold ? "text-foreground font-semibold" : ""}>{label}</span>
      </span>
      <span className="text-right">
        <span className={`tabular-nums ${bold ? "font-bold" : "font-semibold"} ${valueTone}`}>
          {formatShekels(shekels)} {SHEKEL}
        </span>
        <span className="text-[10px] text-muted-foreground tabular-nums ml-1">
          (${usd.toFixed(2)})
        </span>
        {hint && <div className="text-[10px] text-muted-foreground/80">{hint}</div>}
      </span>
    </div>
  );
}

function CheckItem({ ok, label }: { ok: boolean; label: string }) {
  return (
    <div className="flex items-center gap-2 text-[11px]">
      {ok ? (
        <CheckCircle2 size={12} className="text-emerald-400 shrink-0" />
      ) : (
        <AlertCircle size={12} className="text-amber-400 shrink-0" />
      )}
      <span className={ok ? "text-foreground" : "text-muted-foreground"}>{label}</span>
    </div>
  );
}
