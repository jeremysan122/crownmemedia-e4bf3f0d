import { useEffect, useMemo, useRef, useState } from "react";
import {
  Crown, Sparkles, Zap, Shield, Check, Loader2, TrendingUp, Gift, Palette,
  Star, Rocket, Percent, FlaskConical, CalendarClock, Trophy,
  BadgeCheck, Lock, MapPin, Flame, Swords, ArrowRight, Users, Clock,
} from "lucide-react";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/context/AuthContext";
import { useRoyalPass } from "@/hooks/useRoyalPass";
import { useRoyalEntitlements, useFounderStatus } from "@/hooks/useRoyalEntitlements";
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
    detail: "Give your content a daily visibility advantage — one free boost every day to climb faster.",
  },
  {
    icon: Shield,
    label: "5 Crown Shields Per Month",
    detail: "Receive 5 Royal Crown Shields every month. Each shield protects a crowned post for 24 hours — defend your biggest wins strategically.",
  },
  {
    icon: Sparkles,
    label: "Royal Profile Glow",
    detail: "Stand out instantly with a premium animated gold identity visible everywhere on CrownMe.",
  },
  {
    icon: TrendingUp,
    label: "Priority Placement",
    detail: "Get seen by more people across your city, state, and country feeds.",
  },
];

const MONTHLY_REWARDS: Array<{ icon: typeof Gift; label: string; sub: string }> = [
  { icon: Gift, label: "500 FREE Shekels", sub: "Deposited every month" },
  { icon: Rocket, label: "3 FREE Boost Tokens", sub: "Use them anytime" },
  { icon: Shield, label: "5 Crown Shields", sub: "24h each · defend your wins" },
  { icon: Palette, label: "Royal Profile Themes", sub: "Members only" },
  { icon: Crown, label: "Royal Gifts & Reactions", sub: "Exclusive drops" },
  { icon: Sparkles, label: "Animated Royal Frame", sub: "Gold, always on" },
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
  "Defend key wins with monthly shields",
];

const FOUNDER_PERKS = [
  { icon: Crown, label: "Founder Royal Badge" },
  { icon: Sparkles, label: "Exclusive Founder Frame" },
  { icon: Trophy, label: "Early Supporter Recognition" },
  { icon: BadgeCheck, label: "Limited Edition Founder Title" },
];

const COSMETICS = [
  { emoji: "👑", label: "Royal Crown Badge" },
  { emoji: "🌹", label: "Royal Rose Reaction" },
  { emoji: "💎", label: "Diamond Frame" },
  { emoji: "🚀", label: "Rocket Boost FX" },
  { emoji: "🔥", label: "Ember Glow Theme" },
  { emoji: "⚜️", label: "Fleur Chat Badge" },
];

const TESTIMONIALS = [
  { name: "@ava.k", quote: "I 3x'd my votes in the first week. The glow gets people to actually stop and look.", crown: 1240 },
  { name: "@marco", quote: "The monthly shields are clutch — I finally hold my crowns overnight.", crown: 980 },
  { name: "@lena.rose", quote: "Founder frame is unreal. Feels like I actually built something here.", crown: 1560 },
];

const COMPARE_ROWS: Array<{ label: string; free: boolean | string; royal: boolean | string }> = [
  { label: "Basic profile", free: true, royal: true },
  { label: "Feed placement", free: "Standard", royal: "Priority" },
  { label: "Daily Royal Boost", free: false, royal: true },
  { label: "Monthly Crown Shields (24h each)", free: "—", royal: "5 / month" },
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

/* Floating gold particles decoration */
function GoldParticles({ count = 12 }: { count?: number }) {
  return (
    <div className="absolute inset-0 pointer-events-none overflow-hidden" aria-hidden>
      {Array.from({ length: count }).map((_, i) => (
        <span
          key={i}
          className="absolute size-1 rounded-full bg-gold/60 animate-float-particle"
          style={{
            left: `${(i * 83) % 100}%`,
            top: `${(i * 47) % 100}%`,
            animationDelay: `${(i % 6) * 0.4}s`,
            animationDuration: `${4 + (i % 5)}s`,
          }}
        />
      ))}
    </div>
  );
}

/* Compact animated mock phone showing a Royal profile */
function RoyalMockPhone() {
  return (
    <div className="relative mx-auto w-40 md:w-48 aspect-[9/16] rounded-[2rem] border border-gold/40 bg-background/80 shadow-[0_20px_60px_-15px_hsl(var(--gold)/0.5)] overflow-hidden animate-float-slow">
      <div className="absolute inset-0 bg-gradient-to-b from-gold/10 via-transparent to-purple-600/10" />
      <div className="absolute top-2 left-1/2 -translate-x-1/2 w-16 h-1.5 rounded-full bg-black/60" />
      <div className="relative flex flex-col items-center pt-8 pb-3 px-3 gap-1.5">
        <div className="relative">
          <div className="absolute -inset-1 rounded-full bg-gradient-gold blur-md opacity-70 animate-pulse" />
          <div className="relative size-14 rounded-full bg-gradient-to-br from-gold via-yellow-400 to-amber-600 p-[2px]">
            <div className="size-full rounded-full bg-background flex items-center justify-center">
              <Crown size={22} className="text-gold" />
            </div>
          </div>
          <div className="absolute -bottom-1 -right-1 size-5 rounded-full bg-gradient-gold border border-background flex items-center justify-center">
            <Crown size={10} className="text-primary-foreground" />
          </div>
        </div>
        <div className="text-[10px] font-display text-gold">@royal_you</div>
        <div className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full bg-gradient-gold text-primary-foreground text-[7px] font-bold uppercase tracking-wider">
          <Crown size={7} /> Royal
        </div>
        <div className="w-full grid grid-cols-3 gap-0.5 pt-1">
          {[0, 1, 2].map((i) => (
            <div key={i} className="aspect-square rounded-sm bg-gradient-to-br from-gold/30 to-purple-600/30 border border-gold/20" />
          ))}
        </div>
        <div className="w-full flex items-center justify-between text-[8px] pt-1">
          <span className="text-gold font-bold">1.2k 👑</span>
          <span className="text-muted-foreground">+340 this week</span>
        </div>
      </div>
    </div>
  );
}

export default function RoyalPassCard() {
  const { user } = useAuth();
  const pass = useRoyalPass();
  const [plans, setPlans] = useState<Plan[]>([]);
  const [loading, setLoading] = useState(true);
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

  // Active member — concise member panel with updated benefits
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
    <div className="space-y-8 animate-fade-in">
      {/* HERO */}
      <div className="royal-card p-6 md:p-8 relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-gold/15 via-transparent to-purple-600/15 pointer-events-none" />
        <div className="absolute -top-24 -right-16 size-72 rounded-full bg-gold/25 blur-3xl pointer-events-none animate-pulse" />
        <div className="absolute -bottom-24 -left-16 size-72 rounded-full bg-purple-600/20 blur-3xl pointer-events-none animate-pulse" style={{ animationDelay: "1s" }} />
        <GoldParticles count={16} />

        <div className="relative grid md:grid-cols-2 gap-6 items-center">
          <div className="text-center md:text-left space-y-3">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-gold/15 border border-gold/30 text-[10px] font-bold uppercase tracking-widest text-gold">
              <Crown size={12} /> CrownMe Royal · Members Only
            </div>
            <h2 className="font-display text-4xl md:text-5xl text-gold leading-[1.05]">
              Become <span className="italic">CrownMe</span> Royal
            </h2>
            <p className="text-sm md:text-base text-muted-foreground max-w-md mx-auto md:mx-0 leading-relaxed">
              Unlock premium status, visibility, monthly rewards, and exclusive Royal perks reserved for members.
            </p>
            <div className="flex items-center justify-center md:justify-start gap-2 pt-1">
              <button
                onClick={scrollToCta}
                className="group relative px-6 py-3 rounded-full bg-gradient-gold text-primary-foreground text-sm font-bold gold-shadow active:scale-95 hover:scale-[1.03] transition-transform inline-flex items-center gap-2 overflow-hidden"
              >
                <span className="absolute inset-0 -translate-x-full group-hover:translate-x-full transition-transform duration-1000 bg-gradient-to-r from-transparent via-white/40 to-transparent" />
                <Crown size={16} className="relative" /> <span className="relative">Become Royal</span>
                <ArrowRight size={14} className="relative group-hover:translate-x-1 transition-transform" />
              </button>
            </div>
            <div className="flex items-center justify-center md:justify-start gap-4 pt-2 text-[10px] text-muted-foreground">
              <span className="flex items-center gap-1"><Check size={11} className="text-emerald-500" /> Cancel anytime</span>
              <span className="flex items-center gap-1"><Shield size={11} className="text-gold" /> Secure checkout</span>
            </div>
          </div>

          <div className="relative flex items-center justify-center">
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
              <div className="size-56 rounded-full bg-gradient-radial from-gold/30 via-gold/10 to-transparent blur-2xl animate-pulse" />
            </div>
            <div className="relative flex items-center gap-3">
              <div className="hidden md:block animate-crown-float">
                <Crown size={72} className="text-gold drop-shadow-[0_0_25px_hsl(var(--gold)/0.6)]" strokeWidth={1.5} />
              </div>
              <RoyalMockPhone />
            </div>
          </div>
        </div>
      </div>

      {/* BEFORE vs AFTER PROFILE */}
      <div className="space-y-3">
        <SectionTitle kicker="See the difference">Free vs Royal — same you</SectionTitle>
        <div className="grid grid-cols-2 gap-3">
          {/* FREE */}
          <div className="royal-card p-4 text-center space-y-2 opacity-90">
            <div className="text-[9px] uppercase tracking-widest text-muted-foreground font-bold">Free</div>
            <div className="mx-auto size-16 rounded-full bg-muted/60 border border-border flex items-center justify-center">
              <span className="text-2xl">👤</span>
            </div>
            <div className="text-xs font-semibold">@you</div>
            <div className="text-[10px] text-muted-foreground">Standard profile</div>
            <div className="text-[10px] text-muted-foreground">Blended in the feed</div>
          </div>
          {/* ROYAL */}
          <div className="royal-card p-4 text-center space-y-2 relative overflow-hidden border-gold/50">
            <div className="absolute inset-0 bg-gradient-to-br from-gold/15 to-purple-600/10 pointer-events-none" />
            <div className="absolute -inset-2 bg-gradient-gold opacity-20 blur-2xl pointer-events-none animate-pulse" />
            <div className="relative text-[9px] uppercase tracking-widest text-gold font-bold">Royal</div>
            <div className="relative mx-auto size-16 rounded-full bg-gradient-to-br from-gold via-yellow-400 to-amber-600 p-[2px] animate-glow-pulse">
              <div className="size-full rounded-full bg-background flex items-center justify-center">
                <Crown size={22} className="text-gold" />
              </div>
            </div>
            <div className="relative text-xs font-semibold text-gold flex items-center justify-center gap-1">
              @you <Crown size={11} className="text-gold" />
            </div>
            <div className="relative inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full bg-gradient-gold text-primary-foreground text-[8px] font-bold uppercase tracking-wider">
              Royal Member
            </div>
            <div className="relative text-[10px] text-gold/90">Priority placement</div>
          </div>
        </div>
      </div>

      {/* WHY JOIN — OUTCOMES */}
      <div className="royal-card p-5 space-y-3 relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-emerald-500/5 to-transparent pointer-events-none" />
        <SectionTitle kicker="The advantage">Why people join Royal</SectionTitle>
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
        <p className="text-[10px] text-center text-muted-foreground/70 px-4">
          Note: the Boosts store also offers a single 12-hour Crown Shield as a paid boost — Royal Pass gives you 5 stronger 24-hour shields every month.
        </p>
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
                className="rounded-xl bg-background/40 border border-gold/20 p-3 hover:border-gold/50 hover:bg-background/60 hover:-translate-y-0.5 transition-all animate-fade-in"
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
        <SectionTitle kicker="Perks that pay you back">Member Savings</SectionTitle>
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

      {/* WHY ROYAL MEMBERS WIN MORE — social-proof style stats */}
      <div className="royal-card p-5 space-y-4 relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-gold/10 to-transparent pointer-events-none" />
        <SectionTitle kicker="Members outperform">Why Royal Members Win More</SectionTitle>
        <div className="relative grid grid-cols-3 gap-2">
          {[
            { stat: "3.2×", label: "More profile visits" },
            { stat: "+47%", label: "More votes earned" },
            { stat: "5×", label: "Higher discovery" },
          ].map((s, i) => (
            <div
              key={s.label}
              className="rounded-xl bg-background/60 border border-gold/20 p-3 text-center animate-fade-in"
              style={{ animationDelay: `${i * 80}ms` }}
            >
              <div className="font-display text-2xl text-gold leading-none">{s.stat}</div>
              <div className="text-[10px] text-muted-foreground mt-1 leading-tight">{s.label}</div>
            </div>
          ))}
        </div>
        <p className="relative text-[10px] text-center text-muted-foreground/80 pt-2 border-t border-border/40">
          Royal Pass rewards progression and prestige — never guaranteed wins. Fair competition, always.
        </p>
      </div>

      {/* FOUNDING MEMBER */}
      <div className="royal-card p-5 space-y-4 relative overflow-hidden border-gold/50">
        <div className="absolute inset-0 bg-gradient-to-br from-gold/20 via-transparent to-purple-600/15 pointer-events-none" />
        <div className="absolute -inset-1 bg-gradient-gold opacity-25 blur-2xl pointer-events-none animate-pulse" />
        <GoldParticles count={10} />
        <div className="relative text-center space-y-1">
          <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-gold/25 border border-gold/50 text-[10px] font-bold uppercase tracking-widest text-gold">
            <Lock size={11} /> Limited Time · Launch Only
          </div>
          <h3 className="font-display text-2xl text-gold flex items-center justify-center gap-2">
            <Flame size={20} className="text-gold" /> Founding Royal Member
          </h3>
          <p className="text-xs text-muted-foreground max-w-sm mx-auto">
            Join now and permanently keep these founder-only perks — never sold again.
          </p>
        </div>
        <div className="relative grid grid-cols-2 gap-2.5">
          {FOUNDER_PERKS.map((p, i) => {
            const Icon = p.icon;
            return (
              <div
                key={p.label}
                className="rounded-xl bg-background/60 border border-gold/40 p-3 flex items-center gap-2.5 hover:border-gold/70 transition-colors animate-fade-in"
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
        <p className="relative text-[10px] text-center text-gold/90 font-bold uppercase tracking-wider">
          Available only during launch — locks in for life
        </p>
      </div>

      {/* EXCLUSIVE COSMETICS GALLERY */}
      <div className="space-y-3">
        <SectionTitle kicker="Only for Royals">Exclusive Cosmetics</SectionTitle>
        <div className="grid grid-cols-3 gap-2">
          {COSMETICS.map((c, i) => (
            <div
              key={c.label}
              className="royal-card aspect-square flex flex-col items-center justify-center gap-1 p-2 relative overflow-hidden hover:border-gold/50 hover:-translate-y-0.5 transition-all animate-fade-in"
              style={{ animationDelay: `${i * 50}ms` }}
            >
              <div className="absolute inset-0 bg-gradient-to-br from-gold/10 to-transparent" />
              <div className="relative text-3xl md:text-4xl">{c.emoji}</div>
              <div className="relative text-[9px] font-bold text-center text-gold/90 leading-tight px-1">{c.label}</div>
            </div>
          ))}
        </div>
      </div>

      {/* LIVE BATTLE BENEFITS */}
      <div className="royal-card p-5 space-y-3 relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-red-500/10 via-transparent to-gold/10 pointer-events-none" />
        <div className="relative flex items-start gap-3">
          <div className="size-11 rounded-xl bg-gradient-gold flex items-center justify-center text-primary-foreground shrink-0 gold-shadow">
            <Swords size={20} />
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-[10px] uppercase tracking-widest text-gold/70 font-bold">Live Battles</div>
            <h3 className="font-display text-xl text-gold leading-tight">Dominate the arena</h3>
            <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
              Royal cosmetics, animated chat badges, and priority gift reactions make your presence unmissable in every live battle.
            </p>
          </div>
        </div>
        {/* Fake live comments preview showing royal badge */}
        <div className="relative rounded-xl bg-background/60 border border-border p-3 space-y-2">
          <div className="flex items-center gap-2 text-xs">
            <div className="size-6 rounded-full bg-muted flex items-center justify-center text-[10px]">m</div>
            <span className="font-semibold">@mike</span>
            <span className="text-muted-foreground truncate">Let's go! 🔥</span>
          </div>
          <div className="flex items-center gap-2 text-xs rounded-lg bg-gold/10 border border-gold/30 p-1.5 -mx-1 animate-glow-pulse">
            <div className="size-6 rounded-full bg-gradient-gold flex items-center justify-center text-primary-foreground">
              <Crown size={11} />
            </div>
            <span className="font-semibold text-gold flex items-center gap-1">@royal_you <Crown size={10} className="text-gold" /></span>
            <span className="text-foreground truncate">Rose for the queen 🌹</span>
          </div>
          <div className="flex items-center gap-2 text-xs">
            <div className="size-6 rounded-full bg-muted flex items-center justify-center text-[10px]">j</div>
            <span className="font-semibold">@jenna</span>
            <span className="text-muted-foreground truncate">nice one</span>
          </div>
        </div>
      </div>

      {/* CROWN MAP BENEFITS */}
      <div className="royal-card p-5 space-y-3 relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-purple-600/10 to-transparent pointer-events-none" />
        <div className="relative flex items-start gap-3">
          <div className="size-11 rounded-xl bg-gradient-gold flex items-center justify-center text-primary-foreground shrink-0 gold-shadow">
            <MapPin size={20} />
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-[10px] uppercase tracking-widest text-gold/70 font-bold">Crown Map</div>
            <h3 className="font-display text-xl text-gold leading-tight">Stand out on the map</h3>
            <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
              Royal pins glow gold on the Crown Map — visible across your city, state, and country.
            </p>
          </div>
        </div>
        {/* stylized mini-map */}
        <div className="relative rounded-xl bg-background/60 border border-border p-4 h-28 overflow-hidden">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_30%_40%,hsl(var(--gold)/0.15),transparent_60%),radial-gradient(circle_at_70%_60%,hsl(var(--purple-600)/0.15),transparent_60%)]" />
          {/* dots */}
          <span className="absolute left-[20%] top-[30%] size-2 rounded-full bg-muted-foreground/60" />
          <span className="absolute left-[40%] top-[70%] size-2 rounded-full bg-muted-foreground/60" />
          <span className="absolute left-[75%] top-[35%] size-2 rounded-full bg-muted-foreground/60" />
          <span className="absolute left-[55%] top-[50%] size-3 rounded-full bg-gradient-gold gold-shadow animate-pulse" />
          <span className="absolute left-[55%] top-[50%] size-8 rounded-full bg-gold/30 blur-lg -translate-x-1/4 -translate-y-1/4 animate-pulse" />
        </div>
      </div>

      {/* ROYAL LEADERBOARD PREVIEW */}
      <div className="royal-card p-5 space-y-3 relative overflow-hidden">
        <SectionTitle kicker="Rankings">Royals climb faster</SectionTitle>
        <div className="space-y-1.5">
          {[
            { rank: 1, name: "@royal_you", score: "1,240", royal: true, up: "+3" },
            { rank: 2, name: "@sam.k", score: "1,180", royal: false, up: "—" },
            { rank: 3, name: "@nova", score: "1,090", royal: false, up: "—" },
            { rank: 4, name: "@drew", score: "980", royal: false, up: "—" },
          ].map((r) => (
            <div
              key={r.rank}
              className={`flex items-center gap-2 rounded-lg p-2 text-xs ${r.royal ? "bg-gold/10 border border-gold/40" : "bg-background/40 border border-border"}`}
            >
              <div className={`size-6 rounded-full flex items-center justify-center text-[10px] font-bold ${r.royal ? "bg-gradient-gold text-primary-foreground" : "bg-muted text-muted-foreground"}`}>
                {r.rank}
              </div>
              <span className={`font-semibold flex items-center gap-1 ${r.royal ? "text-gold" : ""}`}>
                {r.name}
                {r.royal && <Crown size={10} className="text-gold" />}
              </span>
              <span className="ml-auto font-mono text-[11px]">{r.score} 👑</span>
              {r.royal && (
                <span className="text-emerald-500 text-[10px] font-bold flex items-center gap-0.5">
                  <TrendingUp size={10} /> {r.up}
                </span>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* TESTIMONIALS */}
      <div className="space-y-3">
        <SectionTitle kicker="Members are winning">What Royals are saying</SectionTitle>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
          {TESTIMONIALS.map((t, i) => (
            <div
              key={t.name}
              className="royal-card p-3 space-y-2 animate-fade-in"
              style={{ animationDelay: `${i * 80}ms` }}
            >
              <div className="flex items-center gap-2">
                <div className="size-7 rounded-full bg-gradient-gold flex items-center justify-center text-primary-foreground">
                  <Crown size={12} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-xs font-bold text-gold truncate">{t.name}</div>
                  <div className="text-[9px] text-muted-foreground">{t.crown} 👑 score</div>
                </div>
              </div>
              <p className="text-[11px] leading-snug text-muted-foreground italic">"{t.quote}"</p>
              <div className="flex gap-0.5 text-gold text-xs">
                {"★★★★★".split("").map((s, j) => <span key={j}>{s}</span>)}
              </div>
            </div>
          ))}
        </div>
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

      {/* FINAL CTA */}
      <div ref={ctaRef} className="royal-card p-6 md:p-8 space-y-4 relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-gold/20 via-transparent to-purple-600/20 pointer-events-none" />
        <div className="absolute -inset-2 bg-gradient-gold opacity-15 blur-3xl pointer-events-none animate-pulse" />
        <GoldParticles count={14} />
        <div className="relative text-center space-y-2">
          <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-gold/20 border border-gold/40 text-[10px] font-bold uppercase tracking-widest text-gold mb-1">
            <Flame size={11} /> Founder pricing · Limited time
          </div>
          <div className="font-display text-5xl md:text-6xl text-gold leading-none">
            ${Number(primaryPlan.usd).toFixed(2)}
            <span className="text-base text-muted-foreground font-sans">/{primaryPlan.interval}</span>
          </div>
          <p className="text-sm text-muted-foreground max-w-sm mx-auto">
            Premium status, monthly rewards, 5 Crown Shields, and founder-only perks — locked in for life when you join now.
          </p>
        </div>
        <button
          onClick={() => subscribe(primaryPlan)}
          className="group relative w-full py-4 rounded-2xl bg-gradient-gold text-primary-foreground text-base font-bold gold-shadow active:scale-[0.98] hover:scale-[1.01] transition-transform flex items-center justify-center gap-2 overflow-hidden"
        >
          <span className="absolute inset-0 -translate-x-full group-hover:translate-x-full transition-transform duration-1000 bg-gradient-to-r from-transparent via-white/40 to-transparent" />
          <Crown size={18} className="relative" /> <span className="relative">Become Royal</span>
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

      {/* Additional plans */}
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
