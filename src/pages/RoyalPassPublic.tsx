import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { useSeoMeta } from "@/hooks/useSeoMeta";
import { useAuth } from "@/context/AuthContext";
import { Crown, Shield, Sparkles, Zap, Trophy, Gift, ChevronRight, Check } from "lucide-react";

// Public marketing page for Royal Pass. Indexed by search engines.
// Signed-in users still see it and can click through to their /royal-pass dashboard.
const PERKS = [
  {
    icon: Crown,
    title: "Royal crown & frame",
    body: "Wear the Royal Pass crown and exclusive animated frame across your profile, posts and battles.",
  },
  {
    icon: Shield,
    title: "5 Royal Shields / month",
    body: "Protect your rank when you lose a battle. Shields refresh every renewal cycle.",
  },
  {
    icon: Zap,
    title: "Daily free Boost",
    body: "Claim a free post boost every day — extra reach on your best content, no shekels spent.",
  },
  {
    icon: Sparkles,
    title: "2× shekels on weekly quests",
    body: "Royal-boosted quests pay double so your wallet fills faster every week.",
  },
  {
    icon: Trophy,
    title: "Priority in tournaments",
    body: "Seeded higher in weekly cups and early access to seasonal brackets before they open publicly.",
  },
  {
    icon: Gift,
    title: "Giftable to friends",
    body: "Send a month of Royal to any creator — perfect for hyping a rising battler.",
  },
];

export default function RoyalPassPublic() {
  const { user } = useAuth();

  useSeoMeta({
    title: "Royal Pass — Rule your feed on CrownMe",
    description:
      "Royal Pass unlocks the crown, 5 shields per month, a daily free boost, 2× quest shekels, tournament priority and giftable months. From $9.99/mo.",
    type: "website",
  });

  const ctaHref = user ? "/royal-pass" : "/auth?next=/royal-pass";

  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* Hero */}
      <section className="relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-b from-primary/10 via-background to-background pointer-events-none" />
        <div className="relative max-w-4xl mx-auto px-5 pt-16 pb-14 text-center">
          <div className="inline-flex items-center gap-2 rounded-full border border-primary/30 bg-primary/5 px-3 py-1 text-xs uppercase tracking-wider text-primary mb-6">
            <Crown className="w-3.5 h-3.5" />
            Royal Pass
          </div>
          <h1 className="font-display text-4xl sm:text-6xl font-bold leading-tight mb-4">
            Rule your feed.<br className="hidden sm:block" /> Wear the crown.
          </h1>
          <p className="text-lg text-muted-foreground max-w-2xl mx-auto mb-8">
            Royal Pass is CrownMe's monthly membership for creators who want the
            edge — shields, boosts, doubled quest payouts, and a crown everyone can see.
          </p>
          <div className="flex flex-col sm:flex-row gap-3 justify-center items-center">
            <Button asChild size="lg" className="min-w-56">
              <Link to={ctaHref}>
                Get Royal Pass <ChevronRight className="w-4 h-4 ml-1" />
              </Link>
            </Button>
            <div className="text-sm text-muted-foreground">
              From <span className="font-semibold text-foreground">$9.99/mo</span> · Cancel anytime
            </div>
          </div>
        </div>
      </section>

      {/* Perks grid */}
      <section className="max-w-5xl mx-auto px-5 py-12">
        <h2 className="font-display text-2xl sm:text-3xl font-semibold text-center mb-10">
          What you unlock
        </h2>
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {PERKS.map(({ icon: Icon, title, body }) => (
            <div
              key={title}
              className="rounded-2xl border border-border bg-card p-5 hover:border-primary/40 transition-colors"
            >
              <div className="w-10 h-10 rounded-lg bg-primary/10 text-primary flex items-center justify-center mb-3">
                <Icon className="w-5 h-5" />
              </div>
              <h3 className="font-display font-semibold mb-1">{title}</h3>
              <p className="text-sm text-muted-foreground">{body}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Pricing card */}
      <section className="max-w-3xl mx-auto px-5 py-12">
        <div className="rounded-3xl border-2 border-primary/40 bg-gradient-to-br from-primary/10 to-background p-8 text-center">
          <div className="inline-flex items-center gap-2 rounded-full bg-primary/20 text-primary px-3 py-1 text-xs font-semibold uppercase tracking-wider mb-4">
            Save 33% yearly
          </div>
          <h2 className="font-display text-3xl font-bold mb-2">Two ways to reign</h2>
          <div className="grid sm:grid-cols-2 gap-4 mt-6 text-left">
            <div className="rounded-2xl border border-border bg-card p-5">
              <div className="text-sm text-muted-foreground">Monthly</div>
              <div className="text-3xl font-bold font-display mt-1">$9.99<span className="text-base font-normal text-muted-foreground">/mo</span></div>
              <div className="text-xs text-muted-foreground mt-1">Cancel anytime</div>
            </div>
            <div className="rounded-2xl border-2 border-primary bg-primary/5 p-5 relative">
              <div className="absolute -top-2 right-4 rounded-full bg-primary text-primary-foreground text-xs px-2 py-0.5 font-semibold">Best value</div>
              <div className="text-sm text-muted-foreground">Annual</div>
              <div className="text-3xl font-bold font-display mt-1">$79.99<span className="text-base font-normal text-muted-foreground">/yr</span></div>
              <div className="text-xs text-muted-foreground mt-1">≈ $6.67/mo · save $40</div>
            </div>
          </div>
          <Button asChild size="lg" className="mt-8 min-w-56">
            <Link to={ctaHref}>Start reigning</Link>
          </Button>
        </div>
      </section>

      {/* Guarantees */}
      <section className="max-w-3xl mx-auto px-5 py-12 text-sm text-muted-foreground">
        <ul className="space-y-2">
          {[
            "Cancel anytime — access continues to end of billing period.",
            "Instant crown, frame and shield unlock on payment.",
            "Gift a month to any creator — they get Royal automatically.",
            "No ads, no lock-ins, no surprise charges.",
          ].map((line) => (
            <li key={line} className="flex items-start gap-2">
              <Check className="w-4 h-4 mt-0.5 text-primary shrink-0" />
              <span>{line}</span>
            </li>
          ))}
        </ul>
      </section>

      <footer className="max-w-4xl mx-auto px-5 py-10 text-center text-xs text-muted-foreground">
        <p>
          © CrownMe Media · <Link to="/legal" className="underline">Legal</Link>
        </p>
      </footer>
    </div>
  );
}
