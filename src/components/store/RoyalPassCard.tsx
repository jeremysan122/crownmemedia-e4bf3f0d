import { useEffect, useRef, useState } from "react";
import {
  Crown, Sparkles, Zap, Shield, Check, Loader2, TrendingUp, Gift, Palette,
  MessageCircle, Star, Rocket, Percent, FlaskConical, CalendarClock, Trophy,
  BadgeCheck, Lock,
} from "lucide-react";
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

const BENEFITS: Array<{ icon: typeof Zap; label: string; detail: string }> = [
  {
    icon: Rocket,
    label: "Daily Royal Boost",
    detail: "Boost one post every day to reach more people, earn more votes, and climb the rankings faster.",
  },
  {
    icon: Shield,
    label: "Permanent Crown Shield",
    detail: "Protect your crowns from overnight dethroning so your achievements stay secure even when you're offline.",
  },
  {
    icon: Sparkles,
    label: "Royal Profile Glow",
    detail: "Stand out everywhere with an exclusive animated gold profile frame and premium Royal identity visible throughout CrownMe.",
  },
  {
    icon: TrendingUp,
    label: "Priority Placement",
    detail: "Your posts receive priority exposure within your city, state, and country feeds so more people discover your content.",
  },
];

const MONTHLY_REWARDS: Array<{ icon: typeof Gift; label: string; sub: string }> = [
  { icon: Gift, label: "500 FREE Shekels", sub: "Deposited every month" },
  { icon: Rocket, label: "3 FREE Boost Tokens", sub: "Use them anytime" },
  { icon: Palette, label: "Royal Profile Themes", sub: "Members only" },
  { icon: Crown, label: "Royal Gifts & Reactions", sub: "Exclusive drops" },
  { icon: Sparkles, label: "Animated Royal Frame", sub: "Gold, always on" },
  { icon: MessageCircle, label: "Royal Chat Badge", sub: "Seen in every DM" },
];

const SAVINGS = [
  { icon: Percent, label: "10% OFF every Shekel purchase" },
  { icon: Star, label: "Early access to new features" },
  { icon: FlaskConical, label: "Priority access to beta releases" },
  { icon: CalendarClock, label: "Exclusive seasonal collectibles" },
];

const OUTCOMES = [
  "Get discovered faster",
  "Receive more profile visits",
  "Earn more votes",
  "Grow followers faster",
  "Stand out everywhere",
  "Unlock exclusive cosmetics",
];

const FOUNDER_PERKS = [
  { icon: Crown, label: "Founder Royal Badge" },
  { icon: Sparkles, label: "Exclusive Founder Profile Frame" },
  { icon: Trophy, label: "Early Supporter Recognition" },
  { icon: BadgeCheck, label: "Limited Edition Founder Title" },
];

const COMPARE_ROWS: Array<{ label: string; free: boolean | string; royal: boolean | string }> = [
  { label: "Basic profile", free: true, royal: true },
  { label: "Feed placement", free: "Standard", royal: "Priority" },
  { label: "Daily Royal Boost", free: false, royal: true },
  { label: "Permanent Crown Shield", free: false, royal: true },
  { label: "Monthly Shekels", free: "—", royal: "500" },
  { label: "Monthly Boost Tokens", free: "—", royal: "3" },
  { label: "Exclusive themes", free: false, royal: true },
  { label: "Animated Royal frame", free: false, royal: true },
  { label: "Royal badge", free: false, royal: true },
  { label: "Member discounts", free: false, royal: true },
  { label: "Founder rewards (launch)", free: false, royal: true },
];

function SectionTitle({ children, kicker }: { children: React.ReactNode; kicker?: string }) {
  return (
    <div className="text-center space-y-1">
      {kicker && (
        <div className="text-[10px] uppercase tracking-[0.3em] text-gold/70 font-bold">{kicker}</div>
      )}
      <h3 className="font-display text-2xl text-gold leading-tight">{children}</h3>
    </div>
  );
}

export default function RoyalPassCard() {
  const { user } = useAuth();
  const pass = useRoyalPass();
  const [plans, setPlans] = useState<Plan[]>([]);
  const [loading, setLoading] = useState(true);
  const [pending] = useState<string | null>(null);
  const { openCheckout, checkoutElement } = useStripeCheckout();
  const ctaRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data } = await supabase
        .from("royal_pass_plans")
        .select("id, name, description, usd, interval")
        .eq("active", true)
        .order("sort_order", { ascending: true });
      if (cancelled) return;
      setPlans((data as Plan[]) ?? []);
      setLoading(false);
    })();
    return () => { cancelled = true; };
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

  const scrollToCta = () => {
    ctaRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
  };

  if (loading || pass.loading) {
    return (
      <div className="royal-card p-6 flex items-center justify-center text-muted-foreground text-sm">
        <Loader2 size={16} className="animate-spin mr-2" /> Loading Royal Pass…
      </div>
    );
  }

  // Active member — keep concise members panel
  if (pass.active) {
    const renewsOn = pass.currentPeriodEnd
      ? new Date(pass.currentPeriodEnd).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })
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
              {pass.cancelAtPeriodEnd ? `Cancels on ${renewsOn}` : renewsOn ? `Renews on ${renewsOn}` : "Active subscription"}
            </p>
          </div>
          <span className="px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider bg-emerald-500/15 text-emerald-500 border border-emerald-500/30">
            Member
          </span>
        </div>
        <ul className="relative space-y-3">
          {BENEFITS.map((p) => {
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
          <Link to="/wallet" className="flex-1 h-9 rounded-full bg-muted/40 border border-border text-xs font-bold uppercase tracking-wider flex items-center justify-center hover:bg-muted/60">
            View billing
          </Link>
          <Link to="/royal-pass" className="flex-1 h-9 rounded-full bg-gradient-gold text-primary-foreground text-xs font-bold uppercase tracking-wider flex items-center justify-center gold-shadow">
            Manage
          </Link>
        </div>
      </div>
    );
  }

  if (plans.length === 0) {
    return (
      <div className="royal-card p-6 text-center text-sm text-muted-foreground">
        Royal Pass plans not yet configured.
      </div>
    );
  }

  const primaryPlan = plans[0];

  return (
    <div className="space-y-6 animate-fade-in">
      {/* HERO */}
      <div className="royal-card p-6 space-y-4 relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-gold/10 via-transparent to-purple-600/10 pointer-events-none" />
        <div className="absolute -top-20 -right-20 size-56 rounded-full bg-gold/20 blur-3xl pointer-events-none animate-pulse" />
        <div className="relative text-center space-y-3">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-gold/15 border border-gold/30 text-[10px] font-bold uppercase tracking-widest text-gold">
            <Crown size={12} /> CrownMe Royal
          </div>
          <h2 className="font-display text-3xl md:text-4xl text-gold leading-tight">
            Become CrownMe Royal
          </h2>
          <p className="text-sm text-muted-foreground max-w-md mx-auto leading-relaxed">
            Unlock exclusive status, earn more visibility, protect your crowns, and receive monthly rewards only available to Royal Members.
          </p>
          <p className="text-[11px] text-muted-foreground/80">Cancel anytime.</p>
          <div className="flex items-center justify-center gap-2 pt-1">
            <button
              onClick={scrollToCta}
              className="px-6 py-2.5 rounded-full bg-gradient-gold text-primary-foreground text-sm font-bold gold-shadow active:scale-95 hover:scale-[1.02] transition-transform inline-flex items-center gap-2"
            >
              <Crown size={14} /> Become Royal
            </button>
          </div>
        </div>
      </div>

      {/* CORE BENEFITS */}
      <div className="space-y-3">
        <SectionTitle kicker="Membership">What you unlock</SectionTitle>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {BENEFITS.map((b, i) => {
            const Icon = b.icon;
            return (
              <div
                key={b.label}
                className="royal-card p-4 relative overflow-hidden hover:border-gold/40 transition-colors group animate-fade-in"
                style={{ animationDelay: `${i * 60}ms` }}
              >
                <div className="absolute inset-0 bg-gradient-to-br from-gold/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none" />
                <div className="relative flex items-start gap-3">
                  <div className="size-10 rounded-xl bg-gold/15 text-gold flex items-center justify-center shrink-0 group-hover:scale-110 transition-transform">
                    <Icon size={18} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="font-display text-base text-gold leading-tight">{b.label}</div>
                    <p className="text-[11px] text-muted-foreground leading-snug mt-1">{b.detail}</p>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* MONTHLY REWARDS */}
      <div className="royal-card p-5 space-y-4 relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-purple-600/10 via-transparent to-gold/10 pointer-events-none" />
        <div className="relative text-center space-y-1">
          <div className="text-[10px] uppercase tracking-[0.3em] text-gold/70 font-bold">Every month, on us</div>
          <h3 className="font-display text-2xl text-gold">Monthly Royal Rewards</h3>
          <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-gradient-gold text-primary-foreground text-[10px] font-bold uppercase tracking-wider gold-shadow">
            <Sparkles size={11} /> $15+ Monthly Member Value
          </div>
        </div>
        <div className="relative grid grid-cols-2 gap-2.5">
          {MONTHLY_REWARDS.map((r, i) => {
            const Icon = r.icon;
            return (
              <div
                key={r.label}
                className="rounded-xl bg-background/40 border border-gold/20 p-3 hover:border-gold/50 hover:bg-background/60 transition-all animate-fade-in"
                style={{ animationDelay: `${i * 50}ms` }}
              >
                <div className="size-9 rounded-lg bg-gradient-gold flex items-center justify-center text-primary-foreground mb-2 gold-shadow">
                  <Icon size={16} />
                </div>
                <div className="font-bold text-xs text-foreground leading-tight">{r.label}</div>
                <div className="text-[10px] text-muted-foreground mt-0.5">{r.sub}</div>
              </div>
            );
          })}
        </div>
      </div>

      {/* MEMBER SAVINGS */}
      <div className="space-y-3">
        <SectionTitle kicker="Perks that pay you back">💰 Member Savings</SectionTitle>
        <div className="royal-card p-4 space-y-2.5">
          {SAVINGS.map((s, i) => {
            const Icon = s.icon;
            return (
              <div key={s.label} className="flex items-center gap-3 animate-fade-in" style={{ animationDelay: `${i * 50}ms` }}>
                <div className="size-9 rounded-lg bg-gold/15 text-gold flex items-center justify-center shrink-0">
                  <Icon size={16} />
                </div>
                <span className="text-sm font-medium">{s.label}</span>
              </div>
            );
          })}
        </div>
      </div>

      {/* WHY JOIN — OUTCOMES */}
      <div className="royal-card p-5 space-y-3 relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-emerald-500/5 to-transparent pointer-events-none" />
        <SectionTitle kicker="The advantage">Why Royal Members Win More</SectionTitle>
        <ul className="relative grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1">
          {OUTCOMES.map((o, i) => (
            <li
              key={o}
              className="flex items-center gap-2 text-sm animate-fade-in"
              style={{ animationDelay: `${i * 60}ms` }}
            >
              <div className="size-6 rounded-full bg-emerald-500/15 text-emerald-500 flex items-center justify-center shrink-0">
                <Check size={13} strokeWidth={3} />
              </div>
              <span className="font-medium">{o}</span>
            </li>
          ))}
        </ul>
        <p className="relative text-[10px] text-center text-muted-foreground/80 pt-2 border-t border-border/40">
          Royal Pass rewards progression and prestige — never guaranteed wins. Fair competition, always.
        </p>
      </div>

      {/* FOUNDING MEMBER */}
      <div className="royal-card p-5 space-y-4 relative overflow-hidden border-gold/50">
        <div className="absolute inset-0 bg-gradient-to-br from-gold/20 via-transparent to-purple-600/15 pointer-events-none" />
        <div className="absolute -inset-1 bg-gradient-gold opacity-20 blur-2xl pointer-events-none animate-pulse" />
        <div className="relative text-center space-y-1">
          <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-gold/20 border border-gold/40 text-[10px] font-bold uppercase tracking-widest text-gold">
            <Lock size={11} /> Limited Time
          </div>
          <h3 className="font-display text-2xl text-gold">🔥 Founding Royal Member</h3>
          <p className="text-xs text-muted-foreground max-w-sm mx-auto">
            Join during the early launch and permanently receive:
          </p>
        </div>
        <div className="relative grid grid-cols-2 gap-2.5">
          {FOUNDER_PERKS.map((p, i) => {
            const Icon = p.icon;
            return (
              <div
                key={p.label}
                className="rounded-xl bg-background/50 border border-gold/30 p-3 flex items-center gap-2.5 hover:border-gold/60 transition-colors animate-fade-in"
                style={{ animationDelay: `${i * 60}ms` }}
              >
                <div className="size-8 rounded-lg bg-gradient-gold text-primary-foreground flex items-center justify-center shrink-0 gold-shadow">
                  <Icon size={14} />
                </div>
                <span className="text-xs font-bold leading-tight">{p.label}</span>
              </div>
            );
          })}
        </div>
        <p className="relative text-[10px] text-center text-gold/80 font-bold uppercase tracking-wider">
          Available only during launch
        </p>
      </div>

      {/* COMPARISON */}
      <div className="space-y-3">
        <SectionTitle kicker="Side by side">Free vs Royal Pass</SectionTitle>
        <div className="royal-card overflow-hidden">
          <div className="grid grid-cols-3 text-[10px] uppercase tracking-wider font-bold border-b border-border/40">
            <div className="p-3" />
            <div className="p-3 text-center text-muted-foreground border-l border-border/40">Free</div>
            <div className="p-3 text-center text-gold bg-gold/10 border-l border-gold/30 flex items-center justify-center gap-1">
              <Crown size={11} /> Royal
            </div>
          </div>
          {COMPARE_ROWS.map((row, i) => (
            <div
              key={row.label}
              className={`grid grid-cols-3 text-xs ${i % 2 === 0 ? "bg-muted/20" : ""}`}
            >
              <div className="p-3 font-medium">{row.label}</div>
              <div className="p-3 text-center border-l border-border/40 text-muted-foreground">
                {typeof row.free === "boolean" ? (
                  row.free ? <Check size={14} className="inline text-muted-foreground" /> : <span className="opacity-40">—</span>
                ) : row.free}
              </div>
              <div className="p-3 text-center border-l border-gold/20 bg-gold/5 font-semibold text-foreground">
                {typeof row.royal === "boolean" ? (
                  row.royal ? <Check size={14} className="inline text-emerald-500" strokeWidth={3} /> : <span className="opacity-40">—</span>
                ) : <span className="text-gold">{row.royal}</span>}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* CTA */}
      <div ref={ctaRef} className="royal-card p-6 space-y-4 relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-gold/15 via-transparent to-purple-600/15 pointer-events-none" />
        <div className="absolute -inset-2 bg-gradient-gold opacity-10 blur-3xl pointer-events-none animate-pulse" />
        <div className="relative text-center space-y-2">
          <div className="font-display text-5xl text-gold leading-none">
            ${Number(primaryPlan.usd).toFixed(2)}
            <span className="text-base text-muted-foreground font-sans">/{primaryPlan.interval}</span>
          </div>
          <p className="text-sm text-muted-foreground">
            Everything you need to climb the rankings faster.
          </p>
          <p className="text-[11px] text-muted-foreground/80">Cancel anytime.</p>
        </div>
        <button
          onClick={() => subscribe(primaryPlan)}
          disabled={pending !== null}
          className="relative w-full py-4 rounded-2xl bg-gradient-gold text-primary-foreground text-base font-bold gold-shadow active:scale-[0.98] hover:scale-[1.01] transition-transform flex items-center justify-center gap-2 disabled:opacity-60"
        >
          {pending ? (
            <><Loader2 size={16} className="animate-spin" /> Starting…</>
          ) : (
            <><Crown size={18} /> Become Royal</>
          )}
        </button>
        <div className="relative grid grid-cols-3 gap-2 text-[10px] text-center text-muted-foreground pt-1">
          <div className="flex flex-col items-center gap-1">
            <Shield size={14} className="text-gold" />
            <span>Secure payment</span>
          </div>
          <div className="flex flex-col items-center gap-1">
            <Check size={14} className="text-gold" />
            <span>Cancel anytime</span>
          </div>
          <div className="flex flex-col items-center gap-1">
            <Zap size={14} className="text-gold" />
            <span>Instant activation</span>
          </div>
        </div>
      </div>

      {/* Additional plans (if multiple) */}
      {plans.length > 1 && (
        <div className="space-y-3">
          <SectionTitle kicker="Other options">More plans</SectionTitle>
          {plans.slice(1).map((plan) => (
            <div key={plan.id} className="royal-card p-4 flex items-center justify-between">
              <div>
                <div className="font-display text-lg text-gold">{plan.name}</div>
                <div className="text-[11px] text-muted-foreground">
                  ${Number(plan.usd).toFixed(2)} / {plan.interval} · cancel anytime
                </div>
              </div>
              <button
                onClick={() => subscribe(plan)}
                className="px-4 py-2 rounded-full bg-muted/40 border border-gold/30 text-xs font-bold uppercase tracking-wider hover:bg-muted/60"
              >
                Choose
              </button>
            </div>
          ))}
        </div>
      )}

      {checkoutElement}
    </div>
  );
}
