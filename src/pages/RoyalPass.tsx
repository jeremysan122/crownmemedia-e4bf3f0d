import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import AppShell from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { supabase } from "@/integrations/supabase/client";
import { getStripeEnvironment } from "@/lib/stripe";
import { useAuth } from "@/context/AuthContext";
import { useRoyalPass } from "@/hooks/useRoyalPass";
import { useRoyalEntitlements } from "@/hooks/useRoyalEntitlements";
import { useAdminRoles } from "@/hooks/useAdminRoles";
import {
  Crown, Loader2, ExternalLink, Receipt, RefreshCw, ShieldCheck, X, Zap,
  Sparkles, Star, TrendingUp, History, RotateCw,
} from "lucide-react";
import { toast } from "sonner";
import BoostPostPicker from "@/components/store/BoostPostPicker";

interface BoostRow {
  id: string;
  post_id: string | null;
  started_at: string;
  expires_at: string | null;
  active: boolean;
  status: "succeeded" | "failed";
  error?: string;
}

const FAILED_BOOSTS_KEY = "royal_pass_failed_boosts_v1";
function loadFailedBoosts(userId: string): BoostRow[] {
  try {
    const raw = localStorage.getItem(`${FAILED_BOOSTS_KEY}:${userId}`);
    if (!raw) return [];
    const arr = JSON.parse(raw) as BoostRow[];
    return Array.isArray(arr) ? arr : [];
  } catch { return []; }
}
function recordFailedBoost(userId: string, err: string) {
  try {
    const existing = loadFailedBoosts(userId);
    const next: BoostRow = {
      id: `fail-${Date.now()}`,
      post_id: null,
      started_at: new Date().toISOString(),
      expires_at: null,
      active: false,
      status: "failed",
      error: err.slice(0, 200),
    };
    const trimmed = [next, ...existing].slice(0, 30);
    localStorage.setItem(`${FAILED_BOOSTS_KEY}:${userId}`, JSON.stringify(trimmed));
  } catch { /* ignore */ }
}



interface PlanInfo { name: string; usd: number; interval: string }
interface DailyStatus { eligible: boolean; claimed_today?: boolean; post_id?: string | null; expires_at?: string | null }

export default function RoyalPassSettings() {
  const { user } = useAuth();
  const nav = useNavigate();
  const pass = useRoyalPass();
  const entitlements = useRoyalEntitlements();
  const { roles } = useAdminRoles();
  const isAdmin = roles.length > 0;
  const [plan, setPlan] = useState<PlanInfo | null>(null);
  const [working, setWorking] = useState<
    "portal" | "cancel" | "resume" | "claim" | "sync" | null
  >(null);
  const [confirmCancel, setConfirmCancel] = useState(false);
  const [daily, setDaily] = useState<DailyStatus | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [boostHistory, setBoostHistory] = useState<BoostRow[]>([]);
  const [historyLoading, setHistoryLoading] = useState(true);


  useEffect(() => {
    if (!pass.planId) { setPlan(null); return; }
    let cancelled = false;
    (async () => {
      const { data } = await supabase
        .from("royal_pass_plans")
        .select("name, usd, interval")
        .eq("id", pass.planId)
        .maybeSingle();
      if (!cancelled && data) setPlan(data as PlanInfo);
    })();
    return () => { cancelled = true; };
  }, [pass.planId]);

  const openPortal = async () => {
    setWorking("portal");
    try {
      const { data, error } = await supabase.functions.invoke("royal-pass-portal", { body: { environment: getStripeEnvironment() } });
      if (error) throw error;
      const url = (data as { url?: string; error?: string })?.url;
      const errMsg = (data as { error?: string })?.error;
      if (errMsg) throw new Error(errMsg);
      if (!url) throw new Error("No portal URL returned");
      window.location.href = url;
    } catch (e) {
      toast.error((e as Error).message || "Could not open billing portal");
    } finally { setWorking(null); }
  };

  const setCancel = async (resume: boolean) => {
    setWorking(resume ? "resume" : "cancel");
    try {
      const { data, error } = await supabase.functions.invoke("royal-pass-cancel", {
        body: { resume, environment: getStripeEnvironment() },
      });
      if (error) throw error;
      const errMsg = (data as { error?: string })?.error;
      if (errMsg) throw new Error(errMsg);
      toast.success(resume ? "Subscription resumed" : "Cancellation scheduled");
      pass.refresh();
    } catch (e) {
      toast.error((e as Error).message || "Could not update subscription");
    } finally {
      setWorking(null);
      setConfirmCancel(false);
    }
  };

  const renews = pass.currentPeriodEnd
    ? new Date(pass.currentPeriodEnd).toLocaleDateString(undefined, { month: "long", day: "numeric", year: "numeric" })
    : null;

  const loadDaily = useCallback(async () => {
    if (!pass.active) { setDaily(null); return; }
    const { data } = await (supabase as any).rpc("royal_pass_daily_boost_status");
    setDaily((data as DailyStatus) ?? { eligible: false });
  }, [pass.active]);

  useEffect(() => { loadDaily(); }, [loadDaily]);

  const claimDaily = async (postId: string) => {
    setPickerOpen(false);
    setWorking("claim");
    try {
      const { data, error } = await (supabase as any).rpc("claim_daily_royal_boost", { p_post_id: postId });
      if (error) throw error;
      const errMsg = (data as { error?: string })?.error;
      if (errMsg) throw new Error(errMsg);
      toast.success("Daily Royal Boost claimed — 1.5× score for 24h");
      await loadDaily();
    } catch (e) {
      toast.error((e as Error).message || "Could not claim daily boost");
    } finally {
      setWorking(null);
    }
  };

  const loadBoostHistory = useCallback(async () => {
    if (!user || !pass.active) { setBoostHistory([]); setHistoryLoading(false); return; }
    setHistoryLoading(true);
    const { data } = await supabase
      .from("boosts")
      .select("id, post_id, started_at, expires_at, active")
      .eq("user_id", user.id)
      .eq("source", "royal_pass_daily")
      .order("started_at", { ascending: false })
      .limit(30);
    setBoostHistory((data as BoostRow[]) ?? []);
    setHistoryLoading(false);
  }, [user?.id, pass.active]);

  useEffect(() => { void loadBoostHistory(); }, [loadBoostHistory]);

  const refreshEntitlements = async () => {
    setWorking("sync");
    try {
      const { data, error } = await supabase.functions.invoke("royal-pass-sync", {
        body: { environment: getStripeEnvironment() },
      });
      if (error) throw error;
      const errMsg = (data as { error?: string })?.error;
      if (errMsg) throw new Error(errMsg);
      toast.success("Entitlements refreshed from Stripe");
      await Promise.all([pass.refresh(), entitlements.refresh(), loadDaily(), loadBoostHistory()]);
    } catch (e) {
      toast.error((e as Error).message || "Refresh failed");
    } finally {
      setWorking(null);
    }
  };

  const activePerks = useMemo(() => ([
    {
      icon: Zap, label: "Daily 1.5× Royal Boost",
      status: daily?.claimed_today ? "Claimed today" : "Available",
      ok: true,
    },
    {
      icon: ShieldCheck, label: "5 Crown Shields / month",
      status: `${entitlements.shields_remaining} / ${entitlements.shields_granted || 5} remaining`,
      ok: true,
    },
    { icon: Sparkles, label: "Royal Profile Glow", status: "Active", ok: true },
    { icon: TrendingUp, label: "Priority Feed Placement", status: "Active", ok: true },
    { icon: Star, label: "Royal Crown Badge", status: "Active", ok: true },
  ]), [daily?.claimed_today, entitlements.shields_remaining, entitlements.shields_granted]);

  const shieldTotal = entitlements.shields_granted || 5;
  const shieldPct = shieldTotal > 0
    ? Math.min(100, (entitlements.shields_used / shieldTotal) * 100)
    : 0;
  const shieldResets = entitlements.period_end
    ? new Date(entitlements.period_end).toLocaleDateString(undefined, { month: "long", day: "numeric", year: "numeric" })
    : null;




  return (
    <AppShell title="ROYAL PASS">
      <div className="px-4 py-4 max-w-2xl mx-auto space-y-5">
        <div className="flex items-center justify-between">
          <h1 className="font-display text-2xl text-gold flex items-center gap-2">
            <Crown size={22} className="text-gold" /> Royal Pass
          </h1>
          <Button variant="ghost" size="sm" onClick={() => pass.refresh()} disabled={pass.loading}>
            <RefreshCw size={14} className={pass.loading ? "animate-spin" : ""} />
          </Button>
        </div>

        {pass.loading ? (
          <div className="royal-card p-8 flex items-center justify-center text-muted-foreground text-sm">
            <Loader2 size={16} className="animate-spin mr-2" /> Checking subscription…
          </div>
        ) : !pass.active ? (
          <div className="royal-card p-6 text-center space-y-3">
            <ShieldCheck size={28} className="mx-auto text-muted-foreground" />
            <h2 className="font-display text-lg">No active Royal Pass</h2>
            <p className="text-xs text-muted-foreground">
              Subscribe from the Royal Store to unlock crown-tier perks.
            </p>
            <Button onClick={() => nav("/store?tab=pass")} className="bg-gradient-gold text-primary-foreground">
              See Royal Pass plans
            </Button>
          </div>
        ) : (
          <>
            <div className="royal-card p-5 space-y-4 relative overflow-hidden">
              <div className="absolute inset-0 bg-gradient-gold opacity-[0.08] pointer-events-none" />
              <div className="relative flex items-center gap-3">
                <div className="size-12 rounded-xl bg-gradient-gold flex items-center justify-center text-primary-foreground gold-shadow">
                  <Crown size={22} />
                </div>
                <div className="flex-1">
                  <div className="font-display text-lg text-gold leading-none">{plan?.name ?? "Royal Pass"}</div>
                  <div className="text-[11px] text-muted-foreground mt-1">
                    {plan ? `$${Number(plan.usd).toFixed(2)} / ${plan.interval}` : ""}
                  </div>
                </div>
                <span className={`relative px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider border ${
                  pass.cancelAtPeriodEnd
                    ? "bg-amber-500/15 text-amber-500 border-amber-500/30"
                    : "bg-emerald-500/15 text-emerald-500 border-emerald-500/30"
                }`}>
                  {pass.cancelAtPeriodEnd ? "Cancelling" : pass.status ?? "Active"}
                </span>
              </div>

              <dl className="relative grid grid-cols-2 gap-3 text-xs pt-2 border-t border-border/50">
                <div>
                  <dt className="text-[10px] uppercase tracking-wider text-muted-foreground">Status</dt>
                  <dd className="font-semibold capitalize">{pass.status ?? "—"}</dd>
                </div>
                <div>
                  <dt className="text-[10px] uppercase tracking-wider text-muted-foreground">
                    {pass.cancelAtPeriodEnd ? "Ends on" : "Renews on"}
                  </dt>
                  <dd className="font-semibold">{renews ?? "—"}</dd>
                </div>
              </dl>
            </div>

            {/* Active perks */}
            <div className="royal-card p-4 space-y-3">
              <h2 className="font-display text-sm tracking-widest text-gold flex items-center gap-2">
                <Sparkles size={14} /> Active Perks
              </h2>
              <ul className="grid gap-2">
                {activePerks.map((p) => {
                  const Icon = p.icon;
                  return (
                    <li key={p.label} className="flex items-center gap-3 text-sm">
                      <div className="size-8 rounded-lg bg-gold/10 text-gold flex items-center justify-center shrink-0">
                        <Icon size={14} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="font-semibold truncate">{p.label}</div>
                        <div className="text-[11px] text-muted-foreground">{p.status}</div>
                      </div>
                      <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-500 bg-emerald-500/10 border border-emerald-500/20 px-2 py-0.5 rounded-full">
                        On
                      </span>
                    </li>
                  );
                })}
              </ul>
            </div>

            {/* Crown Shields allowance */}
            <div className="royal-card p-5 space-y-3">
              <div className="flex items-center gap-3">
                <div className="size-10 rounded-xl bg-gold/15 text-gold flex items-center justify-center">
                  <ShieldCheck size={18} />
                </div>
                <div className="flex-1">
                  <div className="font-display text-base text-gold leading-none">Crown Shields</div>
                  <div className="text-[11px] text-muted-foreground mt-1">
                    Protect a crowned post from being dethroned for 24h. Resets monthly.
                  </div>
                </div>
                <div className="text-right">
                  <div className="font-display text-2xl text-gold tabular-nums leading-none">
                    {entitlements.shields_remaining}
                  </div>
                  <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
                    of {shieldTotal} left
                  </div>
                </div>
              </div>
              <div className="h-1.5 rounded-full bg-secondary overflow-hidden">
                <div className="h-full bg-gradient-gold" style={{ width: `${shieldPct}%` }} />
              </div>
              <p className="text-[11px] text-muted-foreground">
                {entitlements.shields_used} used this period
                {shieldResets && <> · Resets {shieldResets}</>}
              </p>
            </div>



            <div className="royal-card p-5 space-y-3 relative overflow-hidden">
              <div className="flex items-center gap-3">
                <div className="size-10 rounded-xl bg-gold/15 text-gold flex items-center justify-center">
                  <Zap size={18} />
                </div>
                <div className="flex-1">
                  <div className="font-display text-base text-gold leading-none">Daily Royal Boost</div>
                  <div className="text-[11px] text-muted-foreground mt-1">
                    1.5× Crown Score for 24h on a post you choose. One claim per day.
                  </div>
                </div>
              </div>

              {daily?.claimed_today ? (
                <div className="text-xs text-muted-foreground bg-muted/30 rounded-lg p-3 flex items-center gap-2">
                  <ShieldCheck size={14} className="text-emerald-500 shrink-0" />
                  <span>
                    Claimed today
                    {daily.expires_at
                      ? ` · active until ${new Date(daily.expires_at).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })}`
                      : ""}
                    . Come back tomorrow for your next boost.
                  </span>
                </div>
              ) : (
                <Button
                  onClick={() => setPickerOpen(true)}
                  disabled={working !== null}
                  className="w-full bg-gradient-gold text-primary-foreground"
                >
                  {working === "claim" ? <Loader2 size={14} className="animate-spin mr-2" /> : <Zap size={14} className="mr-2" />}
                  Claim today's Royal Boost
                </Button>
              )}
            </div>

            {/* Daily Royal Boost history */}
            <div className="royal-card p-4 space-y-3">
              <h2 className="font-display text-sm tracking-widest text-gold flex items-center gap-2">
                <History size={14} /> Boost claim history
              </h2>
              {historyLoading ? (
                <div className="flex items-center justify-center py-4 text-muted-foreground text-xs">
                  <Loader2 size={14} className="animate-spin mr-2" /> Loading…
                </div>
              ) : boostHistory.length === 0 ? (
                <p className="text-xs text-muted-foreground py-2">
                  No Royal Boosts claimed yet. Claim today's above.
                </p>
              ) : (
                <ul className="divide-y divide-border/50">
                  {boostHistory.map((b) => {
                    const started = new Date(b.started_at);
                    const expires = b.expires_at ? new Date(b.expires_at) : null;
                    const stillActive = b.active && expires && expires.getTime() > Date.now();
                    return (
                      <li key={b.id} className="py-2 flex items-center gap-3 text-xs">
                        <div className={`size-7 rounded-lg flex items-center justify-center shrink-0 ${
                          stillActive ? "bg-emerald-500/15 text-emerald-500" : "bg-muted/40 text-muted-foreground"
                        }`}>
                          <Zap size={12} />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="font-semibold">
                            {started.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })}
                            <span className="text-muted-foreground font-normal">
                              {" "}· {started.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })}
                            </span>
                          </div>
                          <div className="text-[10px] text-muted-foreground truncate">
                            {b.post_id ? (
                              <Link to={`/post/${b.post_id}`} className="hover:text-primary hover:underline">
                                View boosted post
                              </Link>
                            ) : "Post unavailable"}
                            {expires && (
                              <> · {stillActive ? "expires" : "expired"} {expires.toLocaleDateString(undefined, { month: "short", day: "numeric" })}</>
                            )}
                          </div>
                        </div>
                        <span className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full border ${
                          stillActive
                            ? "bg-emerald-500/10 text-emerald-500 border-emerald-500/20"
                            : "bg-muted/30 text-muted-foreground border-border/40"
                        }`}>
                          {stillActive ? "Active" : "Claimed"}
                        </span>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>

            {isAdmin && (
              <div className="royal-card p-4 space-y-2 border-2 border-dashed border-gold/40">
                <div className="flex items-center gap-2 text-[10px] uppercase tracking-widest text-gold font-bold">
                  <Star size={12} /> Admin tools
                </div>
                <p className="text-[11px] text-muted-foreground">
                  Re-hydrate the Royal Pass subscription row directly from Stripe.
                  Useful for testing without waiting for a webhook retry.
                </p>
                <Button
                  onClick={refreshEntitlements}
                  disabled={working !== null}
                  variant="outline"
                  className="w-full border-gold/40 text-gold hover:bg-gold/10"
                >
                  {working === "sync"
                    ? <Loader2 size={14} className="animate-spin mr-2" />
                    : <RotateCw size={14} className="mr-2" />}
                  Refresh Entitlements from Stripe
                </Button>
              </div>
            )}

            <div className="royal-card p-4 space-y-2">



              <Button onClick={openPortal} disabled={working !== null} className="w-full bg-gradient-gold text-primary-foreground">
                {working === "portal" ? <Loader2 size={14} className="animate-spin mr-2" /> : <ExternalLink size={14} className="mr-2" />}
                Manage billing in Stripe
              </Button>

              {pass.cancelAtPeriodEnd ? (
                <Button onClick={() => setCancel(true)} disabled={working !== null} variant="outline" className="w-full">
                  {working === "resume" ? <Loader2 size={14} className="animate-spin mr-2" /> : <RefreshCw size={14} className="mr-2" />}
                  Resume subscription
                </Button>
              ) : (
                <Button onClick={() => setConfirmCancel(true)} disabled={working !== null} variant="outline"
                  className="w-full text-destructive border-destructive/40">
                  <X size={14} className="mr-2" /> Cancel at period end
                </Button>
              )}

              <Button asChild variant="ghost" className="w-full">
                <Link to="/wallet"><Receipt size={14} className="mr-2" /> View billing history</Link>
              </Button>
            </div>
          </>
        )}

        <p className="text-[10px] text-center text-muted-foreground">
          Subscriptions are billed and processed by Stripe.
        </p>
      </div>

      <AlertDialog open={confirmCancel} onOpenChange={setConfirmCancel}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Cancel Royal Pass?</AlertDialogTitle>
            <AlertDialogDescription>
              Your Royal Pass perks will remain active until {renews ?? "the end of the current period"}.
              You can resume any time before then.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep subscription</AlertDialogCancel>
            <AlertDialogAction onClick={() => setCancel(false)} className="bg-destructive text-destructive-foreground">
              Yes, cancel
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <BoostPostPicker
        open={pickerOpen}
        userId={user?.id}
        boostLabel="Daily Royal Boost (1.5× for 24h)"
        onClose={() => setPickerOpen(false)}
        onPick={(id) => claimDaily(id)}
      />
    </AppShell>
  );
}
