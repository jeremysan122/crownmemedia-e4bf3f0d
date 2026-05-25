import { useEffect, useState } from "react";
import { Crown, Sparkles, Zap, Shield, Check, Loader2 } from "lucide-react";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/context/AuthContext";
import { useRoyalPass } from "@/hooks/useRoyalPass";
import { toast } from "sonner";

interface Plan {
  id: string;
  name: string;
  description: string;
  usd: number;
  interval: string;
  stripe_price_id: string;
}

const PERKS = [
  { icon: Zap, label: "Daily Royal Boost (1.5× Crown Score)" },
  { icon: Shield, label: "Permanent Crown Shield" },
  { icon: Sparkles, label: "Exclusive royal-tier profile glow" },
  { icon: Crown, label: "Priority placement in regional feeds" },
];

export default function RoyalPassCard() {
  const { user } = useAuth();
  const pass = useRoyalPass();
  const [plans, setPlans] = useState<Plan[]>([]);
  const [loading, setLoading] = useState(true);
  const [pending, setPending] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data } = await supabase
        .from("royal_pass_plans")
        .select("id, name, description, usd, interval, stripe_price_id")
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

  const subscribe = async (plan: Plan) => {
    if (!user) return;
    setPending(plan.id);
    try {
      const { data, error } = await supabase.functions.invoke("create-royal-pass-checkout", {
        body: { plan_id: plan.id, return_path: "/store/success?kind=royal_pass" },
      });
      if (error) throw error;
      const url = (data as { url?: string; error?: string })?.url;
      const errMsg = (data as { error?: string })?.error;
      if (errMsg) throw new Error(errMsg);
      if (!url) throw new Error("No checkout URL returned");
      window.location.href = url;
    } catch (e) {
      toast.error((e as Error).message || "Could not start checkout");
    } finally {
      setPending(null);
    }
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

        <ul className="relative space-y-2">
          {PERKS.map((p) => {
            const Icon = p.icon;
            return (
              <li key={p.label} className="flex items-center gap-3 text-sm">
                <div className="size-7 rounded-full bg-gold/20 flex items-center justify-center text-gold">
                  <Icon size={14} />
                </div>
                <span className="flex-1">{p.label}</span>
                <Check size={14} className="text-emerald-500" />
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

          <ul className="relative space-y-2">
            {PERKS.map((p) => {
              const Icon = p.icon;
              return (
                <li key={p.label} className="flex items-center gap-3 text-sm">
                  <div className="size-7 rounded-full bg-muted/40 flex items-center justify-center text-gold">
                    <Icon size={14} />
                  </div>
                  <span className="flex-1">{p.label}</span>
                  <Check size={14} className="text-emerald-500/70" />
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
    </div>
  );
}
