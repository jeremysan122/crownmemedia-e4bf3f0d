import { useEffect, useState } from "react";
import { Crown, Sparkles, Zap, Shield, Check, Loader2 } from "lucide-react";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/context/AuthContext";
import { useRoyalPass } from "@/hooks/useRoyalPass";
import { useStripeCheckout } from "@/hooks/useStripeCheckout";

interface Plan {
  id: string;
  name: string;
  description: string;
  usd: number;
  interval: string;
}

const PERKS: Array<{ icon: typeof Zap; label: string; detail: string }> = [
  {
    icon: Zap,
    label: "Daily Royal Boost",
    detail: "Multiply one post's Crown Score by 1.5× every day for 24 hours — stack it on your best content to climb the leaderboards faster.",
  },
  {
    icon: Shield,
    label: "Permanent Crown Shield",
    detail: "Keep your crowns safe from being dethroned overnight. Your rank sticks around even on your slower days.",
  },
  {
    icon: Sparkles,
    label: "Royal-tier profile glow",
    detail: "A gold-accented avatar ring and glow that shows up everywhere your profile appears — in comments, battles, and the feed.",
  },
  {
    icon: Crown,
    label: "Priority regional placement",
    detail: "Your posts get prioritized in your city and country feeds so more of the right people see (and vote on) your content.",
  },
];

export default function RoyalPassCard() {
  const { user } = useAuth();
  const pass = useRoyalPass();
  const [plans, setPlans] = useState<Plan[]>([]);
  const [loading, setLoading] = useState(true);
  const [pending] = useState<string | null>(null);
  const { openCheckout, checkoutElement } = useStripeCheckout();

  useEffect(() => {
    let cancelled = false;
    (async () => {
      // NOTE: never select stripe_price_id — resolved server-side.
      const { data } = await supabase
        .from("royal_pass_plans")
        .select("id, name, description, usd, interval")
        .eq("active", true)
        .order("sort_order", { ascending: true });
      if (cancelled) return;
      setPlans((data as Plan[]) ?? []);
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const subscribe = (plan: Plan) => {
    if (!user) return;
    openCheckout({
      fnName: "create-royal-pass-checkout",
      extraBody: { plan_id: plan.id },
      title: plan.name,
      returnUrl: `${window.location.origin}/store/success?kind=royal_pass`,
    });
  };

  if (loading || pass.loading) {
    return (
      <div className="royal-card p-6 flex items-center justify-center text-muted-foreground text-sm">
        <Loader2 size={16} className="animate-spin mr-2" /> Loading Royal Pass…
      </div>
    );
  }

  // Active member view
  if (pass.active) {
    const renewsOn = pass.currentPeriodEnd
      ? new Date(pass.currentPeriodEnd).toLocaleDateString(undefined, {
          month: "short",
          day: "numeric",
          year: "numeric",
        })
      : null;
    return (
      <div className="royal-card p-5 space-y-4 animate-fade-in relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-gold opacity-[0.08] pointer-events-none" />

        <div className="relative flex items-center gap-3">
          <div className="size-12 rounded-xl bg-gradient-gold flex items-center justify-center text-primary-foreground gold-shadow">
            <Crown size={22} />
          </div>
          <div className="flex-1">
            <h2 className="font-display text-xl text-gold leading-none">Royal Pass active</h2>
            <p className="text-[11px] text-muted-foreground mt-1">
              {pass.cancelAtPeriodEnd
                ? `Cancels on ${renewsOn}`
                : renewsOn
                  ? `Renews on ${renewsOn}`
                  : "Active subscription"}
            </p>
          </div>
          <span className="px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider bg-emerald-500/15 text-emerald-500 border border-emerald-500/30">
            Member
          </span>
        </div>

        <ul className="relative space-y-3">
          {PERKS.map((p) => {
            const Icon = p.icon;
            return (
              <li key={p.label} className="flex items-start gap-3 text-sm">
                <div className="size-8 rounded-full bg-gold/20 flex items-center justify-center text-gold shrink-0 mt-0.5">
                  <Icon size={14} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-foreground">{p.label}</span>
                    <Check size={13} className="text-emerald-500 shrink-0" />
                  </div>
                  <p className="text-[11px] text-muted-foreground leading-snug mt-0.5">{p.detail}</p>
                </div>
              </li>
            );
          })}
        </ul>

        <div className="relative flex gap-2 pt-2 border-t border-border/50">
          <Link
            to="/wallet"
            className="flex-1 h-9 rounded-full bg-muted/40 border border-border text-xs font-bold uppercase tracking-wider flex items-center justify-center hover:bg-muted/60"
          >
            View billing
          </Link>
          <Link
            to="/royal-pass"
            className="flex-1 h-9 rounded-full bg-gradient-gold text-primary-foreground text-xs font-bold uppercase tracking-wider flex items-center justify-center gold-shadow"
          >
            Manage
          </Link>
        </div>
      </div>
    );
  }

  // No plans configured
  if (plans.length === 0) {
    return (
      <div className="royal-card p-6 text-center text-sm text-muted-foreground">
        Royal Pass plans not yet configured.
      </div>
    );
  }

  // Subscribe view
  return (
    <div className="space-y-3">
      {plans.map((plan) => (
        <div
          key={plan.id}
          className="royal-card p-5 space-y-4 animate-fade-in relative overflow-hidden"
        >
          <div className="absolute inset-0 bg-gradient-gold opacity-[0.06] pointer-events-none" />

          <div className="relative flex items-center gap-3">
            <div className="size-12 rounded-xl bg-gradient-gold flex items-center justify-center text-primary-foreground gold-shadow">
              <Crown size={22} />
            </div>
            <div className="flex-1">
              <h2 className="font-display text-xl text-gold leading-none">{plan.name}</h2>
              <p className="text-[11px] text-muted-foreground mt-1">
                Cancel anytime · billed {plan.interval}ly
              </p>
            </div>
          </div>

          {plan.description && (
            <p className="relative text-xs text-muted-foreground">{plan.description}</p>
          )}

          <ul className="relative space-y-3">
            {PERKS.map((p) => {
              const Icon = p.icon;
              return (
                <li key={p.label} className="flex items-start gap-3 text-sm">
                  <div className="size-8 rounded-full bg-muted/40 flex items-center justify-center text-gold shrink-0 mt-0.5">
                    <Icon size={14} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-foreground">{p.label}</span>
                      <Check size={13} className="text-emerald-500/70 shrink-0" />
                    </div>
                    <p className="text-[11px] text-muted-foreground leading-snug mt-0.5">{p.detail}</p>
                  </div>
                </li>
              );
            })}
          </ul>

          <div className="relative flex items-end justify-between pt-2 border-t border-border/50">
            <div>
              <p className="font-display text-3xl text-gold leading-none">
                ${Number(plan.usd).toFixed(2)}
                <span className="text-sm text-muted-foreground font-sans">/{plan.interval}</span>
              </p>
            </div>
            <button
              onClick={() => subscribe(plan)}
              disabled={pending !== null}
              className="px-5 py-2.5 rounded-full bg-gradient-gold text-primary-foreground text-sm font-bold gold-shadow active:scale-95 disabled:opacity-60 flex items-center gap-2"
            >
              {pending === plan.id ? (
                <>
                  <Loader2 size={14} className="animate-spin" /> Starting…
                </>
              ) : (
                "Subscribe"
              )}
            </button>
          </div>
        </div>
      ))}
      {checkoutElement}
    </div>
  );
}
