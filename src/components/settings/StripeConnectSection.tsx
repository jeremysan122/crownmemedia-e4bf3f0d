import { useEffect, useState, useCallback, useRef } from "react";
import { useLocation } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { getStripeEnvironment } from "@/lib/stripe";
import { useAuth } from "@/context/AuthContext";
import { Button } from "@/components/ui/button";
import {
  Banknote,
  CheckCircle2,
  AlertCircle,
  Loader2,
  ExternalLink,
  ShieldCheck,
  Sparkles,
  CreditCard,
  Receipt,
  ArrowRight,
  Circle,
} from "lucide-react";
import { toast } from "sonner";

interface ConnectAccount {
  stripe_account_id: string;
  charges_enabled: boolean;
  payouts_enabled: boolean;
  details_submitted: boolean;
  updated_at?: string;
}

interface LiveStatus extends ConnectAccount {
  connected: true;
  fully_set_up: boolean;
  requirements_due: number;
  requirements_disabled_reason: string | null;
  stale?: boolean;
}

export default function StripeConnectSection() {
  const { user } = useAuth();
  const location = useLocation();
  const [account, setAccount] = useState<ConnectAccount | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [showOnboardingScreen, setShowOnboardingScreen] = useState(false);
  const [polling, setPolling] = useState(false);
  const [lastVerified, setLastVerified] = useState<string | null>(null);
  const pollAbort = useRef<{ stop: boolean }>({ stop: false });

  /** Pull live Stripe status (also upserts the cached row). Source of truth. */
  const refreshLive = useCallback(async () => {
    if (!user) return;
    try {
      const { data, error } = await supabase.functions.invoke("connect-account-status", { body: { environment: getStripeEnvironment() } });
      if (error) throw error;
      if (data?.connected) {
        const live = data as LiveStatus;
        setAccount({
          stripe_account_id: live.stripe_account_id,
          charges_enabled: live.charges_enabled,
          payouts_enabled: live.payouts_enabled,
          details_submitted: live.details_submitted,
          updated_at: new Date().toISOString(),
        });
        setLastVerified(new Date().toISOString());
        return live;
      } else {
        setAccount(null);
      }
    } catch (e) {
      console.warn("[StripeConnect] live status failed, falling back to cache:", e);
      // Fallback: read cached row
      const { data } = await supabase
        .from("connect_accounts")
        .select("stripe_account_id, charges_enabled, payouts_enabled, details_submitted, updated_at")
        .eq("user_id", user.id)
        .maybeSingle();
      setAccount((data as ConnectAccount) || null);
      if (data?.updated_at) setLastVerified(data.updated_at);
    }
    return null;
  }, [user]);

  const pollLiveStatus = useCallback(async (maxMs = 60_000) => {
    pollAbort.current.stop = false;
    setPolling(true);
    const start = Date.now();
    let delay = 1500;
    try {
      while (!pollAbort.current.stop && Date.now() - start < maxMs) {
        const live = await refreshLive();
        if (live?.fully_set_up) {
          toast.success("Stripe account fully connected");
          break;
        }
        await new Promise((r) => setTimeout(r, delay));
        delay = Math.min(delay * 1.4, 5000);
      }
    } finally {
      setPolling(false);
    }
  }, [refreshLive]);

  // Initial load — always live so cross-domain caching never misleads us.
  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      await refreshLive();
      if (!cancelled) setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [user, refreshLive]);

  // On return from Stripe (?connect=done|refresh) → poll.
  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const flag = params.get("connect");
    if (flag === "done" || flag === "refresh") {
      const url = new URL(window.location.href);
      url.searchParams.delete("connect");
      window.history.replaceState({}, "", url.toString());
      toast.message(flag === "done" ? "Verifying your Stripe account…" : "Refreshing onboarding…");
      void pollLiveStatus();
    }
    return () => { pollAbort.current.stop = true; };
  }, [location.search, pollLiveStatus]);

  // Realtime updates from Connect webhook
  useEffect(() => {
    if (!user) return;
    const uid = user.id;
    const ch = supabase
      .channel(`connect-${uid}-${crypto.randomUUID()}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "connect_accounts", filter: `user_id=eq.${uid}` },
        () => { void refreshLive(); }
      )
      .subscribe();
    return () => { supabase.removeChannel(ch); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  const startOnboarding = async () => {
    setBusy(true);
    try {
      // Always return to the exact page the user is on, on the exact origin.
      const returnPath = location.pathname || "/settings";
      const { data, error } = await supabase.functions.invoke("create-connect-account", {
        body: { return_path: returnPath, environment: getStripeEnvironment() },
      });
      if (error) throw error;
      const url = (data as { url?: string })?.url;
      if (!url) throw new Error("No onboarding URL returned");
      try {
        if (window.top && window.top !== window.self) {
          window.open(url, "_blank", "noopener,noreferrer");
        } else {
          window.location.href = url;
        }
      } catch {
        window.open(url, "_blank", "noopener,noreferrer");
      }
      void pollLiveStatus();
    } catch (e) {
      toast.error((e as Error).message || "Could not start onboarding");
    } finally {
      setBusy(false);
    }
  };

  const onConnectClick = () => {
    if (!account) {
      setShowOnboardingScreen(true);
      return;
    }
    void startOnboarding();
  };

  const fullySetUp = !!account && account.charges_enabled && account.payouts_enabled && account.details_submitted;
  const incomplete = !!account && !fullySetUp;

  // Three steps for the progress strip
  const steps = [
    { key: "created",   label: "Account created",        done: !!account },
    { key: "details",   label: "Details submitted",      done: !!account?.details_submitted },
    { key: "enabled",   label: "Charges & payouts on",   done: !!(account?.charges_enabled && account?.payouts_enabled) },
  ];

  let nextLabel = "Connect Stripe Account";
  if (account && !fullySetUp) nextLabel = "Continue Onboarding";
  if (fullySetUp) nextLabel = "Manage / Refresh";

  return (
    <>
      <section className="royal-card p-4 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="font-display text-sm uppercase tracking-widest text-muted-foreground flex items-center gap-2">
            <Banknote size={16} /> Creator Payouts
          </h2>
          {lastVerified && (
            <span className="text-[10px] text-muted-foreground">
              Verified {new Date(lastVerified).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
            </span>
          )}
        </div>

        {loading ? (
          <div className="flex items-center text-sm text-muted-foreground">
            <Loader2 size={14} className="animate-spin mr-2" /> Loading…
          </div>
        ) : (
          <>
            {/* Status badge */}
            {polling && !fullySetUp ? (
              <div className="flex items-center gap-2 text-xs text-amber-300 bg-amber-500/10 border border-amber-500/30 rounded-lg px-2.5 py-1.5">
                <Loader2 size={12} className="animate-spin" /> Verifying with Stripe…
              </div>
            ) : fullySetUp ? (
              <div className="flex items-center gap-2 text-xs text-emerald-300 bg-emerald-500/10 border border-emerald-500/30 rounded-lg px-2.5 py-1.5">
                <CheckCircle2 size={12} /> Connected — ready to receive payouts
              </div>
            ) : account ? (
              <div className="flex items-center gap-2 text-xs text-amber-300 bg-amber-500/10 border border-amber-500/30 rounded-lg px-2.5 py-1.5">
                <AlertCircle size={12} /> Onboarding incomplete — finish the next step below
              </div>
            ) : (
              <div className="flex items-center gap-2 text-xs text-muted-foreground bg-muted/30 border border-border/60 rounded-lg px-2.5 py-1.5">
                <Circle size={10} /> Not connected
              </div>
            )}

            {/* Progress strip */}
            <ol className="grid grid-cols-3 gap-2">
              {steps.map((s, i) => (
                <li key={s.key} className="flex flex-col items-center text-center gap-1">
                  <div className={`size-7 rounded-full flex items-center justify-center text-[11px] font-bold border ${
                    s.done
                      ? "bg-gradient-gold text-primary-foreground border-transparent"
                      : "bg-muted/30 text-muted-foreground border-border"
                  }`}>
                    {s.done ? <CheckCircle2 size={14} /> : i + 1}
                  </div>
                  <span className={`text-[10px] leading-tight ${s.done ? "text-foreground" : "text-muted-foreground"}`}>
                    {s.label}
                  </span>
                </li>
              ))}
            </ol>

            {account && (
              <p className="text-[10px] text-muted-foreground break-all">
                Account: {account.stripe_account_id}
              </p>
            )}

            <Button
              onClick={onConnectClick}
              disabled={busy}
              variant={fullySetUp ? "outline" : "default"}
              className={fullySetUp ? "w-full" : "w-full bg-gradient-gold text-primary-foreground"}
            >
              {busy ? <Loader2 size={14} className="animate-spin mr-2" /> : <ExternalLink size={14} className="mr-2" />}
              {nextLabel}
            </Button>

            {incomplete && (
              <p className="text-[11px] text-muted-foreground leading-snug">
                Stripe still needs more information from you. Click <span className="text-foreground font-semibold">Continue Onboarding</span> to finish — your progress is saved.
              </p>
            )}
          </>
        )}
      </section>

      {showOnboardingScreen && (
        <OnboardingProgressScreen
          busy={busy}
          onClose={() => setShowOnboardingScreen(false)}
          onStart={async () => {
            setShowOnboardingScreen(false);
            await startOnboarding();
          }}
        />
      )}
    </>
  );
}

function OnboardingProgressScreen({
  busy,
  onStart,
  onClose,
}: { busy: boolean; onStart: () => void; onClose: () => void }) {
  const steps = [
    { icon: ShieldCheck, title: "Verify your identity", text: "Stripe will ask for your name, date of birth, and address. Required by law for payouts." },
    { icon: CreditCard, title: "Connect a payout method", text: "Add a bank account or debit card so your earnings can land instantly." },
    { icon: Receipt, title: "Tax details", text: "Provide a quick W-9 / W-8 form. Encrypted, never shared with CrownMe." },
    { icon: Sparkles, title: "Start receiving gifts", text: "Once approved, every Royal Gift is converted to USD and queued for payout." },
  ];

  return (
    <div className="fixed inset-0 z-[60] bg-background/95 backdrop-blur-md overflow-y-auto">
      <div className="min-h-full flex items-center justify-center p-4 sm:p-6">
        <div className="relative w-full max-w-lg royal-card p-6 sm:p-8 space-y-6 border border-primary/30 shadow-[0_30px_80px_-20px_hsl(43_95%_60%/0.35)]">
          <div className="text-center space-y-2">
            <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-gradient-gold text-primary-foreground shadow-lg">
              <Banknote size={26} />
            </div>
            <h2 className="font-display text-2xl text-gold">Set up Creator Payouts</h2>
            <p className="text-xs text-muted-foreground max-w-sm mx-auto">
              CrownMe partners with <span className="text-foreground font-semibold">Stripe</span> — the same payments platform used by Shopify, Lyft and Amazon. Takes about 2 minutes.
            </p>
          </div>

          <ol className="space-y-3">
            {steps.map((s, i) => (
              <li key={s.title} className="flex gap-3 items-start rounded-xl border border-border/60 bg-card/40 p-3 hover:border-primary/40 transition">
                <div className="shrink-0 w-9 h-9 rounded-lg bg-primary/10 text-primary flex items-center justify-center font-display text-sm">{i + 1}</div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold flex items-center gap-1.5">
                    <s.icon size={14} className="text-primary" />
                    {s.title}
                  </p>
                  <p className="text-[11px] text-muted-foreground leading-snug mt-0.5">{s.text}</p>
                </div>
              </li>
            ))}
          </ol>

          <div className="flex items-center gap-2 text-[10px] text-muted-foreground bg-muted/30 rounded-lg p-2.5">
            <ShieldCheck size={12} className="text-emerald-400 shrink-0" />
            <span>Bank-grade encryption. CrownMe never sees your tax ID or full bank number.</span>
          </div>

          <div className="space-y-2">
            <Button onClick={onStart} disabled={busy} className="w-full h-11 bg-gradient-gold text-primary-foreground font-semibold">
              {busy ? <Loader2 size={16} className="animate-spin mr-2" /> : <ArrowRight size={16} className="mr-2" />}
              Continue to Stripe
            </Button>
            <Button onClick={onClose} variant="ghost" className="w-full text-xs">Not now</Button>
          </div>
        </div>
      </div>
    </div>
  );
}
