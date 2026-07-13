import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import AppShell from "@/components/AppShell";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/context/AuthContext";
import { useWallet } from "@/hooks/useWallet";
import { useRoyalPass } from "@/hooks/useRoyalPass";
import { useAdminRoles } from "@/hooks/useAdminRoles";
import { Button } from "@/components/ui/button";
import { CheckCircle2, Loader2, Receipt, Coins, Zap, Crown, Circle, AlertTriangle, RefreshCw } from "lucide-react";
import { SHEKEL, formatShekels } from "@/lib/gifts";
import { toast } from "sonner";

interface LedgerRow {
  id: string;
  kind: string;
  shekels_delta: number;
  usd_amount: number | null;
  label: string;
  stripe_session_id: string | null;
  created_at: string;
  metadata: Record<string, unknown>;
}

type StepState = "pending" | "active" | "done" | "error";

function StepRow({ state, title, hint }: { state: StepState; title: string; hint?: string }) {
  const Icon =
    state === "done" ? CheckCircle2 :
    state === "active" ? Loader2 :
    state === "error" ? AlertTriangle : Circle;
  const tone =
    state === "done" ? "text-emerald-500" :
    state === "active" ? "text-gold" :
    state === "error" ? "text-destructive" : "text-muted-foreground/60";
  return (
    <div className="flex items-start gap-3 py-2">
      <Icon size={18} className={`${tone} ${state === "active" ? "animate-spin" : ""} mt-0.5 shrink-0`} />
      <div className="flex-1 min-w-0">
        <div className={`text-sm font-semibold ${state === "pending" ? "text-muted-foreground" : ""}`}>{title}</div>
        {hint && <div className="text-[10px] text-muted-foreground">{hint}</div>}
      </div>
    </div>
  );
}

export default function PurchaseSuccess() {
  const [params] = useSearchParams();
  const sessionId = params.get("session_id");
  const isRoyalPass = params.get("kind") === "royal_pass";
  const { user } = useAuth();
  const { wallet, refreshWallet } = useWallet();
  const royalPass = useRoyalPass();
  const { roles } = useAdminRoles();
  const isAdminView = roles.length > 0;
  const [rows, setRows] = useState<LedgerRow[]>([]);
  const [walletCreditedAt, setWalletCreditedAt] = useState<number | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const [timedOut, setTimedOut] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [verifyError, setVerifyError] = useState<string | null>(null);

  const ledgerConfirmed = rows.length > 0;
  const expectedDelta = rows.reduce((s, r) => s + Number(r.shekels_delta), 0);
  const creditConfirmed = ledgerConfirmed && (
    isRoyalPass ? !!royalPass.active : (expectedDelta === 0 || walletCreditedAt !== null)
  );

  // Step states
  const stripeStep: StepState = sessionId ? "done" : "error";
  const webhookStep: StepState = ledgerConfirmed ? "done" : (timedOut ? "error" : "active");
  const ledgerStep: StepState = ledgerConfirmed ? "done" : (timedOut ? "error" : (stripeStep === "done" ? "active" : "pending"));
  const creditStep: StepState = creditConfirmed ? "done" : (timedOut && ledgerConfirmed ? "error" : (ledgerConfirmed ? "active" : "pending"));

  useEffect(() => {
    if (!sessionId || !user || ledgerConfirmed) return;
    let cancelled = false;

    const fetchRows = async () => {
      const { data } = await supabase
        .from("shekel_ledger")
        .select("*")
        .eq("stripe_session_id", sessionId)
        .order("created_at", { ascending: true });
      if (cancelled) return;
      if (data && data.length > 0) {
        setRows(data as LedgerRow[]);
        refreshWallet();
        if (isRoyalPass) royalPass.refresh();
      }
    };

    fetchRows();

    const channel = supabase
      .channel(`ledger-success-${sessionId}-${crypto.randomUUID()}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "shekel_ledger", filter: `user_id=eq.${user.id}` },
        (payload) => {
          const row = payload.new as LedgerRow;
          if (row.stripe_session_id === sessionId) fetchRows();
        },
      )
      .subscribe();

    const tick = setInterval(async () => {
      setElapsed((e) => {
        const next = e + 1;
        if (next >= 20) setTimedOut(true);
        return next;
      });
      await fetchRows();
    }, 1500);

    return () => {
      cancelled = true;
      clearInterval(tick);
      supabase.removeChannel(channel);
    };
  }, [sessionId, user, ledgerConfirmed, refreshWallet]);

  // Mark wallet credited the first time wallet refresh sees a higher balance after ledger arrival
  useEffect(() => {
    if (ledgerConfirmed && expectedDelta > 0 && walletCreditedAt === null && !wallet.loading) {
      // Wallet hook updates via realtime; assume credit confirmed shortly after ledger insert.
      const t = setTimeout(() => setWalletCreditedAt(Date.now()), 500);
      return () => clearTimeout(t);
    }
  }, [ledgerConfirmed, expectedDelta, wallet.shekelBalance, wallet.loading, walletCreditedAt]);

  const runFallbackVerify = async () => {
    if (!sessionId) return;
    setVerifying(true);
    setVerifyError(null);
    try {
      const { getStripeEnvironment } = await import("@/lib/stripe");
      const { data, error } = await supabase.functions.invoke("verify-purchase", {
        body: { session_id: sessionId, environment: getStripeEnvironment() },
      });
      if (error) throw error;
      const errMsg = (data as { error?: string })?.error;
      if (errMsg) throw new Error(errMsg);
      toast.success("Verification triggered");
      // Re-fetch
      const { data: rs } = await supabase
        .from("shekel_ledger").select("*")
        .eq("stripe_session_id", sessionId)
        .order("created_at", { ascending: true });
      setRows((rs as LedgerRow[]) || []);
      refreshWallet();
      if (isRoyalPass) royalPass.refresh();
      setTimedOut(false);
      setElapsed(0);
    } catch (e) {
      setVerifyError((e as Error).message || "Verification failed");
    } finally {
      setVerifying(false);
    }
  };

  const totalShekels = rows.reduce((s, r) => s + Number(r.shekels_delta), 0);
  const totalUsd = rows.reduce((s, r) => s + Number(r.usd_amount || 0), 0);

  return (
    <AppShell title="PURCHASE COMPLETE">
      <div className="px-4 py-6 max-w-md mx-auto space-y-5">
        <div className="text-center space-y-2">
          <div className={`size-16 mx-auto rounded-full flex items-center justify-center ${creditConfirmed ? "bg-gradient-gold" : "bg-muted/50"}`}>
            {creditConfirmed
              ? <CheckCircle2 size={32} className="text-primary-foreground" />
              : <Loader2 size={28} className="animate-spin text-muted-foreground" />}
          </div>
          <h1 className="font-display text-2xl text-gold">
            {creditConfirmed ? "Thank you!" : "Finalizing…"}
          </h1>
          <p className="text-xs text-muted-foreground">
            {creditConfirmed
              ? "Your royal purchase is confirmed"
              : "Verifying every step of your purchase"}
          </p>
        </div>

        {/* 4-step verification timeline — admin/debug only */}
        {isAdminView && (
        <div className="royal-card p-4 space-y-1">
          <StepRow
            state={stripeStep}
            title="Stripe payment received"
            hint={sessionId ? `Session ${sessionId.slice(0, 14)}…` : "Missing session id"}
          />
          <StepRow
            state={webhookStep}
            title="Webhook delivered"
            hint={ledgerConfirmed ? "Stripe notified our backend" : "Waiting for Stripe to ping our webhook"}
          />
          <StepRow
            state={ledgerStep}
            title="Ledger entry recorded"
            hint={ledgerConfirmed ? `${rows.length} entr${rows.length === 1 ? "y" : "ies"} created` : "Will appear once webhook fires"}
          />
          <StepRow
            state={creditStep}
            title={isRoyalPass ? "Royal Pass activated" : "Shekels credited to wallet"}
            hint={
              creditConfirmed
                ? (isRoyalPass ? "Pass is now active" : `+${formatShekels(totalShekels)} ${SHEKEL} on your balance`)
                : "Final wallet update"
            }
          />
          {!creditConfirmed && !timedOut && (
            <div className="h-1.5 bg-muted/40 rounded-full overflow-hidden mt-2">
              <div
                className="h-full bg-gradient-gold transition-all duration-500"
                style={{ width: `${Math.min(100, (elapsed / 20) * 100)}%` }}
              />
            </div>
          )}
        </div>
        )}


        {!ledgerConfirmed && timedOut && (
          <div className="royal-card p-4 space-y-3">
            <div className="text-sm font-semibold flex items-center gap-2">
              <AlertTriangle size={16} className="text-destructive" /> Taking longer than expected
            </div>
            <p className="text-xs text-muted-foreground">
              Stripe may not have called our webhook yet. Re-verify directly with Stripe to credit your purchase now.
            </p>
            {verifyError && <p className="text-xs text-destructive">{verifyError}</p>}
            <Button onClick={runFallbackVerify} disabled={verifying} className="w-full bg-gradient-gold text-primary-foreground">
              {verifying ? <Loader2 size={14} className="mr-1.5 animate-spin" /> : <RefreshCw size={14} className="mr-1.5" />}
              Verify with Stripe now
            </Button>
          </div>
        )}

        {rows.length > 0 && (
          <div className="royal-card p-4 space-y-3">
            {totalShekels > 0 && (
              <div className="flex items-center justify-center gap-2 text-2xl font-bold tabular-nums text-gold py-2">
                <Coins size={22} /> +{SHEKEL}{formatShekels(totalShekels)}
              </div>
            )}
            <div className="divide-y divide-border/60">
              {rows.map((r) => (
                <div key={r.id} className="py-2.5 flex items-center gap-3">
                  <div className="size-9 rounded-lg bg-muted/50 flex items-center justify-center">
                    {r.kind === "royal_pass" ? <Crown size={14} className="text-gold" /> :
                      r.kind === "boost_stripe" ? <Zap size={14} className="text-primary" /> :
                      <Coins size={14} className="text-gold" />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-semibold truncate">{r.label}</div>
                    <div className="text-[10px] text-muted-foreground">
                      {r.kind === "royal_pass"
                        ? "Royal Pass active"
                        : Number(r.shekels_delta) > 0
                          ? `+${formatShekels(Number(r.shekels_delta))} Shekels`
                          : "Boost activated"}
                      {r.usd_amount ? ` · $${Number(r.usd_amount).toFixed(2)}` : ""}
                    </div>
                  </div>
                </div>
              ))}
            </div>
            {totalUsd > 0 && (
              <div className="flex items-center justify-between pt-2 border-t border-border/60 text-xs">
                <span className="text-muted-foreground">Total charged</span>
                <span className="font-bold tabular-nums">${totalUsd.toFixed(2)}</span>
              </div>
            )}
            {sessionId && (
              <div className="text-[10px] text-muted-foreground break-all pt-1">
                Receipt ID: {sessionId}
              </div>
            )}
          </div>
        )}

        <div className="grid grid-cols-2 gap-2">
          <Button asChild variant="outline">
            <Link to="/wallet"><Receipt size={14} className="mr-1.5" /> View ledger</Link>
          </Button>
          {isRoyalPass ? (
            <Button asChild className="bg-gradient-gold text-primary-foreground">
              <Link to="/royal-pass"><Crown size={14} className="mr-1.5" /> Manage Royal Pass</Link>
            </Button>
          ) : (
            <Button asChild className="bg-gradient-gold text-primary-foreground">
              <Link to="/store">Back to Store</Link>
            </Button>
          )}
        </div>
      </div>
    </AppShell>
  );
}
