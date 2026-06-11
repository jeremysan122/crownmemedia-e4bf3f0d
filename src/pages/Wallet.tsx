import { useEffect, useMemo, useState } from "react";
import AppShell from "@/components/AppShell";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/context/AuthContext";
import { useWallet } from "@/hooks/useWallet";
import { SHEKEL, formatShekels } from "@/lib/gifts";
import { Coins, Zap, Gift, ArrowDownCircle, ArrowUpCircle, Loader2, Crown, Wallet as WalletIcon, Banknote, ShoppingBag, Sparkles, ShieldCheck, ShieldAlert, Clock } from "lucide-react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

const SHEKELS_PER_USD = 100;
const MIN_PAYOUT_USD = 25;
const MIN_SHEKELS_PAYOUT = MIN_PAYOUT_USD * SHEKELS_PER_USD;

interface PayoutRow {
  id: string;
  amount_usd: number;
  status: string;
  created_at: string;
  paid_at: string | null;
}

interface ConnectAccount {
  charges_enabled: boolean;
  payouts_enabled: boolean;
  details_submitted: boolean;
}

interface LedgerRow {
  id: string;
  kind: string;
  shekels_delta: number;
  usd_amount: number | null;
  label: string;
  stripe_session_id: string | null;
  metadata: Record<string, unknown> | null;
  created_at: string;
}

interface ActiveBoost {
  id: string;
  boost_type: string;
  expires_at: string | null;
  started_at: string;
}

const BOOST_LABELS: Record<string, string> = {
  royal_boost: "Royal Boost",
  vote_boost: "Vote Boost",
  crown_spotlight: "Crown Spotlight",
  profile_glow: "Profile Glow",
  crown_shield: "Crown Shield",
};

function formatRemaining(expiresAt: string | null): string {
  if (!expiresAt) return "No expiry";
  const ms = new Date(expiresAt).getTime() - Date.now();
  if (ms <= 0) return "Expired";
  const totalMin = Math.floor(ms / 60000);
  const d = Math.floor(totalMin / 1440);
  const h = Math.floor((totalMin % 1440) / 60);
  const m = totalMin % 60;
  if (d > 0) return `${d}d ${h}h left`;
  if (h > 0) return `${h}h ${m}m left`;
  return `${m}m left`;
}

const KIND_META: Record<string, { icon: typeof Coins; tone: string; title: string }> = {
  bundle_purchase:   { icon: Coins,           tone: "text-gold",      title: "Shekel bundle" },
  boost_purchase:    { icon: Zap,             tone: "text-primary",   title: "Boost (Shekels)" },
  boost_stripe:      { icon: Zap,             tone: "text-primary",   title: "Boost (Stripe)" },
  royal_pass:        { icon: Crown,           tone: "text-gold",      title: "Royal Pass" },
  gift_sent:         { icon: ArrowUpCircle,   tone: "text-destructive", title: "Gift sent" },
  gift_received:     { icon: ArrowDownCircle, tone: "text-emerald-500", title: "Gift received" },
};

function formatDate(s: string) {
  return new Date(s).toLocaleString(undefined, {
    month: "short", day: "numeric", hour: "2-digit", minute: "2-digit",
  });
}

type VerStatus = "pending" | "approved" | "rejected" | "more_info_required" | null;
interface ProfileFlags {
  verified: boolean;
  is_banned: boolean;
  is_suspended: boolean;
}

type Eligibility =
  | { kind: "banned" }
  | { kind: "suspended" }
  | { kind: "verification_required" }
  | { kind: "under_review" }
  | { kind: "verification_rejected" }
  | { kind: "stripe_not_ready" }
  | { kind: "no_balance" }
  | { kind: "below_minimum" }
  | { kind: "eligible" };

export default function Wallet() {
  const { user } = useAuth();
  const { wallet } = useWallet();
  const [rows, setRows] = useState<LedgerRow[]>([]);
  const [boosts, setBoosts] = useState<ActiveBoost[]>([]);
  const [payouts, setPayouts] = useState<PayoutRow[]>([]);
  const [connect, setConnect] = useState<ConnectAccount | null>(null);
  const [profile, setProfile] = useState<ProfileFlags | null>(null);
  const [verStatus, setVerStatus] = useState<VerStatus>(null);
  const [loading, setLoading] = useState(true);
  const [requestingPayout, setRequestingPayout] = useState(false);
  const [, setTick] = useState(0);

  const reload = async () => {
    if (!user) return;
    const [ledger, activeBoosts, payoutRows, connectRow, profileRow, verRow] = await Promise.all([
      supabase.from("shekel_ledger").select("*").order("created_at", { ascending: false }).limit(200),
      supabase.from("boosts").select("id, boost_type, expires_at, started_at")
        .eq("user_id", user.id).eq("active", true).order("expires_at", { ascending: true }),
      supabase.from("payouts").select("id, amount_usd, status, created_at, paid_at")
        .eq("user_id", user.id).order("created_at", { ascending: false }).limit(20),
      supabase.from("connect_accounts").select("charges_enabled, payouts_enabled, details_submitted")
        .eq("user_id", user.id).maybeSingle(),
      supabase.from("profiles").select("verified, is_banned, is_suspended").eq("id", user.id).maybeSingle(),
      supabase.from("verification_requests").select("status").eq("user_id", user.id)
        .order("created_at", { ascending: false }).limit(1).maybeSingle(),
    ]);
    setRows((ledger.data as LedgerRow[]) || []);
    setBoosts(((activeBoosts.data as ActiveBoost[]) || []).filter(
      (b) => !b.expires_at || new Date(b.expires_at).getTime() > Date.now(),
    ));
    setPayouts((payoutRows.data as PayoutRow[]) || []);
    setConnect((connectRow.data as ConnectAccount) || null);
    setProfile((profileRow.data as ProfileFlags) || null);
    setVerStatus(((verRow.data as { status: VerStatus } | null)?.status) ?? null);
  };

  useEffect(() => {
    if (!user) return;
    (async () => { setLoading(true); await reload(); setLoading(false); })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  useEffect(() => {
    if (boosts.length === 0) return;
    const id = setInterval(() => setTick((t) => t + 1), 30_000);
    return () => clearInterval(id);
  }, [boosts.length]);

  const breakdown = useMemo(() => {
    const purchased = rows
      .filter((r) => r.kind === "bundle_purchase" || r.kind === "boost_stripe")
      .reduce((s, r) => s + Math.max(0, Number(r.shekels_delta)), 0);
    const earnedFromGifts = rows
      .filter((r) => r.kind === "gift_received")
      .reduce((s, r) => s + Math.max(0, Number(r.shekels_delta)), 0);
    return { purchased, earnedFromGifts };
  }, [rows]);

  const lockedUsd = payouts
    .filter((p) => p.status === "pending" || p.status === "paid")
    .reduce((s, p) => s + Number(p.amount_usd), 0);
  const lockedShekels = lockedUsd * SHEKELS_PER_USD;
  const availablePayoutShekels = Math.max(0, wallet.totalEarned - lockedShekels);
  const availablePayoutUsd = availablePayoutShekels / SHEKELS_PER_USD;

  const stripeReady = !!connect?.charges_enabled && !!connect?.payouts_enabled && !!connect?.details_submitted;

  // Server-authoritative checks are duplicated in /functions/request-payout — this
  // is only the UI gate so disabled states and CTAs render correctly.
  const eligibility: Eligibility = useMemo(() => {
    if (profile?.is_banned) return { kind: "banned" };
    if (profile?.is_suspended) return { kind: "suspended" };
    if (!profile?.verified) {
      if (verStatus === "pending" || verStatus === "more_info_required") return { kind: "under_review" };
      if (verStatus === "rejected") return { kind: "verification_rejected" };
      return { kind: "verification_required" };
    }
    if (!stripeReady) return { kind: "stripe_not_ready" };
    if (availablePayoutShekels <= 0) return { kind: "no_balance" };
    if (availablePayoutShekels < MIN_SHEKELS_PAYOUT) return { kind: "below_minimum" };
    return { kind: "eligible" };
  }, [profile, verStatus, stripeReady, availablePayoutShekels]);

  const canPayout = eligibility.kind === "eligible";

  const requestPayout = async () => {
    setRequestingPayout(true);
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
      setRequestingPayout(false);
    }
  };

  const payoutStatusTone = (s: string) =>
    s === "paid" ? "text-emerald-500" :
    s === "pending" ? "text-gold" :
    s === "frozen" ? "text-destructive" : "text-muted-foreground";

  return (
    <AppShell title="WALLET">
      <div className="px-4 py-4 space-y-5 max-w-2xl mx-auto">
        <div className="royal-card p-5 text-center space-y-2">
          <div className="text-[10px] uppercase tracking-widest text-muted-foreground">Balance</div>
          <div className="font-display text-4xl text-gold tabular-nums flex items-center justify-center gap-1">
            {SHEKEL}{formatShekels(wallet.shekelBalance)}
          </div>
          <div className="grid grid-cols-2 gap-3 pt-2 text-[11px] text-muted-foreground">
            <div>Earned <span className="text-foreground font-semibold tabular-nums">{formatShekels(wallet.totalEarned)}</span></div>
            <div>Spent <span className="text-foreground font-semibold tabular-nums">{formatShekels(wallet.totalSpent)}</span></div>
          </div>
          <Button asChild className="mt-3 bg-gradient-gold text-primary-foreground w-full">
            <Link to="/store">Buy more Shekels</Link>
          </Button>
        </div>

        <section className="royal-card p-4 space-y-3">
          <div className="flex items-center gap-2">
            <WalletIcon size={14} className="text-gold" />
            <h2 className="font-display text-sm uppercase tracking-widest text-muted-foreground">Breakdown</h2>
          </div>
          <div className="grid grid-cols-2 gap-2 text-xs">
            <div className="rounded-lg bg-muted/30 p-3">
              <div className="flex items-center gap-1.5 text-muted-foreground"><ShoppingBag size={12} /> Purchased</div>
              <div className="font-bold tabular-nums text-foreground mt-0.5">{SHEKEL}{formatShekels(breakdown.purchased)}</div>
            </div>
            <div className="rounded-lg bg-muted/30 p-3">
              <div className="flex items-center gap-1.5 text-muted-foreground"><Sparkles size={12} /> Earned (gifts)</div>
              <div className="font-bold tabular-nums text-foreground mt-0.5">{SHEKEL}{formatShekels(breakdown.earnedFromGifts)}</div>
            </div>
            <div className="rounded-lg bg-muted/30 p-3">
              <div className="flex items-center gap-1.5 text-muted-foreground"><ArrowUpCircle size={12} /> Spent</div>
              <div className="font-bold tabular-nums text-foreground mt-0.5">{SHEKEL}{formatShekels(wallet.totalSpent)}</div>
            </div>
            <div className="rounded-lg bg-gradient-to-br from-gold/10 to-transparent border border-gold/20 p-3">
              <div className="flex items-center gap-1.5 text-muted-foreground"><Banknote size={12} /> Available payout</div>
              <div className="font-bold tabular-nums text-gold mt-0.5">${availablePayoutUsd.toFixed(2)}</div>
              <div className="text-[10px] text-muted-foreground">{formatShekels(availablePayoutShekels)} {SHEKEL}</div>
            </div>
          </div>
        </section>

        <section className="royal-card p-4 space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Banknote size={14} className="text-gold" />
              <h2 className="font-display text-sm uppercase tracking-widest text-muted-foreground">Payout</h2>
            </div>
            <span className="text-[10px] text-muted-foreground">{SHEKELS_PER_USD} {SHEKEL} = $1 · Min ${MIN_PAYOUT_USD}</span>
          </div>

          {/* Eligibility banner — server enforces, this just mirrors the state */}
          {eligibility.kind === "banned" && (
            <div className="text-xs bg-destructive/10 border border-destructive/30 text-destructive rounded-lg p-3 flex items-start gap-2">
              <ShieldAlert size={14} className="mt-0.5 shrink-0" />
              <span>Your account is banned. Payouts are not available.</span>
            </div>
          )}
          {eligibility.kind === "suspended" && (
            <div className="text-xs bg-destructive/10 border border-destructive/30 text-destructive rounded-lg p-3 flex items-start gap-2">
              <ShieldAlert size={14} className="mt-0.5 shrink-0" />
              <span>Your account is suspended. Payouts are paused until this is resolved.</span>
            </div>
          )}
          {eligibility.kind === "verification_required" && (
            <div className="rounded-lg bg-gradient-to-br from-gold/10 to-transparent border border-gold/30 p-3 space-y-2">
              <div className="flex items-start gap-2 text-xs">
                <ShieldCheck size={14} className="mt-0.5 shrink-0 text-gold" />
                <div>
                  <p className="font-semibold text-foreground">Verification required</p>
                  <p className="text-muted-foreground mt-0.5">You must be verified before receiving payouts. Your shekels keep accumulating in the meantime.</p>
                </div>
              </div>
              <Button asChild size="sm" className="w-full bg-gradient-gold text-primary-foreground">
                <Link to="/verification">Start verification</Link>
              </Button>
            </div>
          )}
          {eligibility.kind === "under_review" && (
            <div className="text-xs bg-primary/10 border border-primary/30 rounded-lg p-3 flex items-start gap-2">
              <Clock size={14} className="mt-0.5 shrink-0 text-primary" />
              <div>
                <p className="font-semibold text-foreground">Verification under review</p>
                <p className="text-muted-foreground mt-0.5">We'll unlock payouts as soon as your verification is approved.</p>
              </div>
            </div>
          )}
          {eligibility.kind === "verification_rejected" && (
            <div className="rounded-lg bg-destructive/10 border border-destructive/30 p-3 space-y-2 text-xs">
              <div className="flex items-start gap-2">
                <ShieldAlert size={14} className="mt-0.5 shrink-0 text-destructive" />
                <div>
                  <p className="font-semibold text-destructive">Verification was not approved</p>
                  <p className="text-muted-foreground mt-0.5">You can submit a new verification request to unlock payouts.</p>
                </div>
              </div>
              <Button asChild size="sm" variant="outline" className="w-full">
                <Link to="/verification">Resubmit verification</Link>
              </Button>
            </div>
          )}
          {eligibility.kind === "stripe_not_ready" && (
            <div className="text-xs text-muted-foreground bg-muted/30 rounded-lg p-3">
              Connect your Stripe account in <Link to="/settings" className="text-primary underline">Settings</Link> before you can request payouts.
            </div>
          )}
          {eligibility.kind === "no_balance" && (
            <div className="text-xs text-muted-foreground bg-muted/30 rounded-lg p-3">
              Receive gifts from other users to start earning Shekels you can cash out.
            </div>
          )}
          {(eligibility.kind === "below_minimum" || eligibility.kind === "eligible") && (
            <>
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Expected payout</span>
                <span className="font-bold tabular-nums text-gold">${availablePayoutUsd.toFixed(2)}</span>
              </div>
              <Button
                onClick={requestPayout}
                disabled={!canPayout || requestingPayout}
                className="w-full bg-gradient-gold text-primary-foreground"
              >
                {requestingPayout ? <Loader2 size={14} className="mr-1.5 animate-spin" /> : <Banknote size={14} className="mr-1.5" />}
                {canPayout ? `Request payout · $${availablePayoutUsd.toFixed(2)}` : `Need $${MIN_PAYOUT_USD} minimum`}
              </Button>
            </>
          )}
          {canPayout && (
            <p className="text-[10px] text-muted-foreground inline-flex items-center gap-1">
              <ShieldCheck size={10} className="text-emerald-500" /> Verified · eligible for payout
            </p>
          )}

          {payouts.length > 0 && (
            <div className="border-t border-border/60 pt-2 space-y-1.5">
              <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Recent payouts</div>
              {payouts.slice(0, 5).map((p) => (
                <div key={p.id} className="flex items-center justify-between text-xs">
                  <span className="text-muted-foreground">
                    {new Date(p.created_at).toLocaleDateString(undefined, { month: "short", day: "numeric" })}
                  </span>
                  <span className="tabular-nums">${Number(p.amount_usd).toFixed(2)}</span>
                  <span className={`uppercase text-[10px] font-bold ${payoutStatusTone(p.status)}`}>{p.status}</span>
                </div>
              ))}
            </div>
          )}
        </section>

        <section className="royal-card overflow-hidden">
          <div className="p-3 border-b border-border/60 flex items-center justify-between">
            <h2 className="font-display text-sm uppercase tracking-widest text-muted-foreground">Active Boosts</h2>
            <span className="text-[10px] text-muted-foreground">{boosts.length} active</span>
          </div>
          {boosts.length === 0 ? (
            <div className="p-6 text-center text-xs text-muted-foreground">
              No active boosts. Activate one in the <Link to="/store" className="text-primary underline">Store</Link>.
            </div>
          ) : (
            <ul className="divide-y divide-border/60">
              {boosts.map((b) => {
                const label = BOOST_LABELS[b.boost_type] ?? b.boost_type;
                const remaining = formatRemaining(b.expires_at);
                const expired = remaining === "Expired";
                return (
                  <li key={b.id} className="p-3 flex items-center gap-3">
                    <div className="size-10 rounded-xl bg-gradient-gold flex items-center justify-center text-primary-foreground">
                      <Zap size={16} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-semibold truncate">{label}</div>
                      <div className="text-[10px] text-muted-foreground">
                        Started {new Date(b.started_at).toLocaleString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}
                      </div>
                    </div>
                    <div className={`text-xs font-bold tabular-nums ${expired ? "text-destructive" : "text-gold"}`}>
                      {remaining}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        <section className="royal-card overflow-hidden">
          <div className="p-3 border-b border-border/60 flex items-center justify-between">
            <h2 className="font-display text-sm uppercase tracking-widest text-muted-foreground">Transactions</h2>
            <span className="text-[10px] text-muted-foreground">{rows.length} entr{rows.length === 1 ? "y" : "ies"}</span>
          </div>
          {loading && (
            <div className="p-8 flex items-center justify-center text-muted-foreground">
              <Loader2 size={16} className="animate-spin mr-2" /> Loading…
            </div>
          )}
          {!loading && rows.length === 0 && (
            <div className="p-8 text-center text-sm text-muted-foreground">
              No transactions yet — your purchases and gifts will appear here.
            </div>
          )}
          <ul className="divide-y divide-border/60">
            {rows.map((r) => {
              const meta = KIND_META[r.kind] ?? { icon: Coins, tone: "text-muted-foreground", title: r.kind };
              const Icon = meta.icon;
              const positive = Number(r.shekels_delta) > 0;
              const zeroDelta = Number(r.shekels_delta) === 0;
              const md = (r.metadata ?? {}) as Record<string, unknown>;
              const isRoyal = r.kind === "royal_pass";
              const subId = typeof md.stripe_subscription_id === "string" ? (md.stripe_subscription_id as string) : null;
              const status = typeof md.status === "string" ? (md.status as string) : null;
              const periodEnd = typeof md.current_period_end === "string"
                ? new Date(md.current_period_end as string).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })
                : null;
              return (
                <li key={r.id} className="p-3 flex items-start gap-3">
                  <div className={`size-10 rounded-xl bg-muted/50 flex items-center justify-center ${meta.tone}`}>
                    <Icon size={16} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-semibold truncate">{r.label}</div>
                    <div className="text-[10px] text-muted-foreground">
                      {meta.title} · {formatDate(r.created_at)}
                      {r.stripe_session_id ? " · Stripe" : ""}
                    </div>
                    {isRoyal && (status || periodEnd) && (
                      <div className="text-[10px] text-muted-foreground mt-0.5">
                        {status && <span className="capitalize">{status}</span>}
                        {status && periodEnd && " · "}
                        {periodEnd && <>Renews {periodEnd}</>}
                      </div>
                    )}
                    {isRoyal && subId && (
                      <div className="text-[10px] text-muted-foreground/80 break-all mt-0.5 font-mono">
                        {subId}
                      </div>
                    )}
                    {isRoyal && r.stripe_session_id && (
                      <div className="text-[10px] text-muted-foreground/60 break-all font-mono">
                        Session: {r.stripe_session_id}
                      </div>
                    )}
                  </div>
                  <div className="text-right shrink-0">
                    {!zeroDelta && (
                      <div className={`text-sm font-bold tabular-nums ${positive ? "text-emerald-500" : "text-destructive"}`}>
                        {positive ? "+" : ""}{formatShekels(Number(r.shekels_delta))} {SHEKEL}
                      </div>
                    )}
                    {r.usd_amount ? (
                      <div className="text-[10px] text-muted-foreground tabular-nums">${Number(r.usd_amount).toFixed(2)}</div>
                    ) : null}
                  </div>
                </li>
              );
            })}
          </ul>
        </section>
      </div>
    </AppShell>
  );
}
