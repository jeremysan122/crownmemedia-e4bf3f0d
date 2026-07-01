import { useEffect, useMemo, useState } from "react";
import AppShell from "@/components/AppShell";
import {
  Sparkles,
  Star,
  Eye,
  Shield,
  Zap,
  Loader2,
  Crown,
  Gift,
  Receipt,
  ArrowRight,
  ShoppingCart,
  Coins,
  Check,
  HelpCircle,
} from "lucide-react";
import { toast } from "sonner";
import { Link, useSearchParams } from "react-router-dom";
import { useAuth } from "@/context/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import RoyalGiftStore from "@/components/gifts/RoyalGiftStore";
import ActiveBoostsPanel from "@/components/store/ActiveBoostsPanel";
import ReceivedGiftsPanel from "@/components/store/ReceivedGiftsPanel";
import SentGiftsPanel from "@/components/store/SentGiftsPanel";
import ShekelsTab from "@/components/store/ShekelsTab";
import RoyalPassCard from "@/components/store/RoyalPassCard";
import RoyalPassBadge from "@/components/store/RoyalPassBadge";
import { useRoyalPass } from "@/hooks/useRoyalPass";
import { useSeoMeta } from "@/hooks/useSeoMeta";
import BoostPostPicker from "@/components/store/BoostPostPicker";
import { useStripeCheckout } from "@/hooks/useStripeCheckout";

const POST_TARGETED_BOOSTS = new Set(["royal_boost", "vote_boost", "crown_spotlight", "crown_shield"]);


const ICON_MAP: Record<string, typeof Zap> = {
  royal_boost: Zap,
  vote_boost: Sparkles,
  crown_spotlight: Star,
  profile_glow: Eye,
  crown_shield: Shield,
};

const DESC_MAP: Record<string, string> = {
  royal_boost: "1.5× Crown Score on a chosen post for 24h",
  vote_boost: "Featured in the Spotlight strip for voters",
  crown_spotlight: "Top placement in the Royal Spotlight strip",
  profile_glow: "Cosmetic royal aura on your profile",
  crown_shield: "Crown can't be displaced from chosen post",
};

interface BoostBundle {
  id: string;
  boost_type: string;
  label: string;
  usd: number;
  duration_hours: number;
  sort_order: number;
}

const TABS = [
  { key: "gifts", label: "Gifts", icon: Gift },
  { key: "shekels", label: "Shekels", icon: Coins },
  { key: "boosts", label: "Boosts", icon: Zap },
  { key: "pass", label: "Royal Pass", icon: Crown },
  { key: "received", label: "Received", icon: Receipt },
] as const;

type Tab = (typeof TABS)[number]["key"];

function isTab(t: string | null): t is Tab {
  return !!t && (TABS as readonly { key: string }[]).some((x) => x.key === t);
}

export default function Store() {
  const { user, profile } = useAuth();
  useSeoMeta({
    title: "Royal Store — CrownMe Media",
    description: "Send royal gifts, unlock boosts, and grab the Royal Pass to climb the CrownMe leaderboard faster.",
  });
  const [searchParams, setSearchParams] = useSearchParams();
  const initialTab = isTab(searchParams.get("tab")) ? (searchParams.get("tab") as Tab) : "gifts";
  const [tab, setTab] = useState<Tab>(initialTab);
  const [boosts, setBoosts] = useState<BoostBundle[]>([]);
  const [activeBoostTypes, setActiveBoostTypes] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(false);
  const [pending, setPending] = useState<string | null>(null);
  const [receivedView, setReceivedView] = useState<"received" | "sent">("received");
  const pass = useRoyalPass();
  const profilePath = profile?.username ? `/${profile.username}` : "/me";

  // Sync tab to URL (so nav-links + back button work)
  useEffect(() => {
    const current = searchParams.get("tab");
    if (current !== tab) {
      const next = new URLSearchParams(searchParams);
      next.set("tab", tab);
      setSearchParams(next, { replace: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab]);

  useEffect(() => {
    if (tab !== "boosts") return;
    (async () => {
      setLoading(true);
      // NOTE: never select stripe_price_id — resolved server-side.
      const { data } = await supabase
        .from("boost_bundles")
        .select("id, boost_type, label, usd, duration_hours, sort_order")
        .eq("active", true)
        .order("sort_order", { ascending: true });
      setBoosts((data as BoostBundle[]) || []);
      setLoading(false);

      if (user) {
        const { data: active } = await supabase
          .from("boosts")
          .select("boost_type, expires_at")
          .eq("user_id", user.id)
          .eq("active", true);
        const now = Date.now();
        const live = new Set<string>();
        (active ?? []).forEach((b) => {
          if (!b.expires_at || new Date(b.expires_at).getTime() > now) {
            live.add(b.boost_type as string);
          }
        });
        setActiveBoostTypes(live);
      }
    })();
  }, [tab, user?.id]);

  // Toast on cancelled return
  useEffect(() => {
    if (searchParams.get("purchase") === "cancelled") {
      toast.info("Checkout cancelled — no charge was made.");
      const next = new URLSearchParams(searchParams);
      next.delete("purchase");
      setSearchParams(next, { replace: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const [pickerBundle, setPickerBundle] = useState<BoostBundle | null>(null);
  const { openCheckout, checkoutElement } = useStripeCheckout();

  const startCheckout = (b: BoostBundle, postId?: string) => {
    if (!user) return;
    openCheckout({
      fnName: "create-checkout",
      title: b.label,
      returnUrl: `${window.location.origin}/store/success`,
      extraBody: {
        boost_bundle_id: b.id,
        ...(postId ? { target_post_id: postId } : {}),
      },
    });
  };

  const buy = (b: BoostBundle) => {
    if (!user) return;
    if (POST_TARGETED_BOOSTS.has(b.boost_type)) {
      setPickerBundle(b);
      return;
    }
    startCheckout(b);
  };


  const boostsByType = useMemo(
    () =>
      boosts.reduce<Record<string, BoostBundle[]>>((acc, b) => {
        (acc[b.boost_type] ||= []).push(b);
        return acc;
      }, {}),
    [boosts],
  );

  return (
    <AppShell title="ROYAL STORE">
      <div className="px-4 lg:px-0 py-4 space-y-4">
        {/* Active boosts always visible at top */}
        <ActiveBoostsPanel />

        {/* Royal Pass member ribbon */}
        {pass.active && (
          <Link
            to="/store?tab=pass"
            onClick={() => setTab("pass")}
            className="block royal-card p-3 flex items-center gap-3 hover:border-gold/50 transition-colors"
          >
            <RoyalPassBadge />
            <p className="text-sm font-bold flex-1">Royal Pass active — perks applied</p>
            <ArrowRight size={14} className="text-muted-foreground" />
          </Link>
        )}

        {/* Tabs */}
        <div
          role="tablist"
          aria-label="Royal Store sections"
          className="flex gap-1 p-1 rounded-full bg-muted/40 border border-border/50 overflow-x-auto scrollbar-none"
        >
          {TABS.map((t) => {
            const active = tab === t.key;
            const Icon = t.icon;
            return (
              <button
                key={t.key}
                role="tab"
                aria-selected={active}
                aria-controls={`store-panel-${t.key}`}
                id={`store-tab-${t.key}`}
                onClick={() => setTab(t.key)}
                className={`flex-1 min-w-[90px] h-9 rounded-full text-xs font-bold uppercase tracking-wider transition-all flex items-center justify-center gap-1.5 ${
                  active
                    ? "bg-gradient-gold text-primary-foreground gold-shadow"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                <Icon size={12} />
                {t.label}
              </button>
            );
          })}
        </div>

        {tab === "gifts" && (
          <div id="store-panel-gifts" role="tabpanel" aria-labelledby="store-tab-gifts" className="space-y-3">
            <RoyalGiftStore />
            <NavLinks
              links={[
                { to: "/wallet", label: "Wallet & gift history" },
                { to: profilePath, label: "My profile" },
              ]}
            />
          </div>
        )}

        {tab === "shekels" && (
          <div id="store-panel-shekels" role="tabpanel" aria-labelledby="store-tab-shekels">
            <ShekelsTab />
          </div>
        )}

        {tab === "pass" && (
          <div id="store-panel-pass" role="tabpanel" aria-labelledby="store-tab-pass" className="space-y-3">

            <div className="text-center pt-2">
              <h1 className="font-display text-2xl text-gold">Royal Pass</h1>
              <p className="text-xs text-muted-foreground mt-1">
                One subscription, every royal perk
              </p>
            </div>
            <RoyalPassCard />
            <NavLinks
              links={[
                { to: "/wallet", label: "Billing history" },
                { to: "/settings", label: "Account settings" },
              ]}
            />
          </div>
        )}

        {tab === "received" && (
          <div
            id="store-panel-received"
            role="tabpanel"
            aria-labelledby="store-tab-received"
            className="space-y-3"
          >
            <div className="text-center pt-2">
              <h1 className="font-display text-2xl text-gold">
                {receivedView === "received" ? "Received Gifts" : "Sent Gifts"}
              </h1>
              <p className="text-xs text-muted-foreground mt-1">
                {receivedView === "received"
                  ? "Tap any gift for sender, items, and timestamps"
                  : "Every Royal Gift you've sent — with links to the post"}
              </p>
            </div>

            <div
              role="tablist"
              aria-label="Gift history view"
              className="flex gap-1 p-1 rounded-full bg-muted/40 border border-border/50 max-w-xs mx-auto"
            >
              {(["received", "sent"] as const).map((v) => {
                const active = receivedView === v;
                return (
                  <button
                    key={v}
                    role="tab"
                    aria-selected={active}
                    onClick={() => setReceivedView(v)}
                    className={`flex-1 h-8 rounded-full text-[11px] font-bold uppercase tracking-wider transition-all ${
                      active
                        ? "bg-gradient-gold text-primary-foreground gold-shadow"
                        : "text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    {v === "received" ? "Received" : "Sent"}
                  </button>
                );
              })}
            </div>

            {receivedView === "received" ? <ReceivedGiftsPanel /> : <SentGiftsPanel />}

            <a
              href="mailto:support@crownmemedia.com?subject=Royal%20Store%20-%20charge%20issue"
              className="flex items-center justify-center gap-2 text-xs text-muted-foreground hover:text-gold underline pt-2"
            >
              <HelpCircle size={12} /> Report a charge or refund issue
            </a>

            <NavLinks
              links={[
                { to: "/wallet", label: "Full wallet history" },
                { to: profilePath, label: "My profile" },
              ]}
            />
          </div>
        )}

        {tab === "boosts" && (
          <div
            id="store-panel-boosts"
            role="tabpanel"
            aria-labelledby="store-tab-boosts"
            className="space-y-3 animate-fade-in"
          >
            <div className="text-center pt-2">
              <h1 className="font-display text-2xl text-gold">Royal Boosts</h1>
              <p className="text-xs text-muted-foreground mt-1">
                Power-ups for your reign · paid via Stripe
              </p>
            </div>

            {loading && (
              <div className="space-y-2">
                {Array.from({ length: 3 }).map((_, i) => (
                  <div key={i} className="h-32 rounded-2xl bg-muted/30 animate-pulse" />
                ))}
              </div>
            )}

            {!loading && boosts.length === 0 && (
              <p className="text-center text-xs text-muted-foreground py-8">
                No boosts available right now.
              </p>
            )}

            {!loading &&
              Object.entries(boostsByType).map(([type, bundles]) => {
                const Icon = ICON_MAP[type] ?? Zap;
                const desc = DESC_MAP[type] ?? `${bundles[0]?.duration_hours ?? 24}h boost`;
                const sorted = [...bundles].sort((a, b) => Number(a.usd) - Number(b.usd));
                const cheapest = sorted[0];
                const cheapestPerHour =
                  Number(cheapest.usd) / Math.max(1, cheapest.duration_hours);

                return (
                  <div key={type} className="royal-card p-4 space-y-3">
                    <div className="flex items-center gap-3">
                      <div className="size-12 rounded-xl bg-gradient-gold flex items-center justify-center text-primary-foreground">
                        <Icon size={22} />
                      </div>
                      <div className="flex-1">
                        <p className="font-display text-base flex items-center gap-2">
                          {sorted[0]?.label?.replace(/\s*x\s*\d+$/i, "") ?? type}
                          {activeBoostTypes.has(type) && (
                            <span className="text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded-full bg-emerald-500/15 text-emerald-500 border border-emerald-500/30 flex items-center gap-1">
                              <Check size={9} /> Active
                            </span>
                          )}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {activeBoostTypes.has(type) ? "Stacking will extend the timer · " : ""}
                          {desc}
                        </p>
                      </div>
                      {sorted.length > 1 && (
                        <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-gold/15 text-gold border border-gold/30">
                          {sorted.length} tiers
                        </span>
                      )}
                    </div>


                    <div className="space-y-2">
                      {sorted.map((b, i) => {
                        const perHour = Number(b.usd) / Math.max(1, b.duration_hours);
                        const savings =
                          i > 0 && perHour < cheapestPerHour
                            ? Math.round((1 - perHour / cheapestPerHour) * 100)
                            : 0;
                        return (
                          <div
                            key={b.id}
                            className="flex items-center gap-3 p-2.5 rounded-lg bg-muted/20 border border-border/40"
                          >
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2">
                                <p className="text-sm font-bold tabular-nums">
                                  ${Number(b.usd).toFixed(2)}
                                </p>
                                {savings > 0 && (
                                  <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-emerald-500/15 text-emerald-500 border border-emerald-500/30">
                                    Save {savings}%
                                  </span>
                                )}
                              </div>
                              <p className="text-[11px] text-muted-foreground">
                                {b.duration_hours}h · ${perHour.toFixed(2)}/h
                              </p>
                            </div>
                            <button
                              onClick={() => buy(b)}
                              disabled={pending !== null}
                              className="h-9 px-4 rounded-full bg-gradient-gold text-primary-foreground text-xs font-bold uppercase tracking-wider gold-shadow active:scale-95 disabled:opacity-60 flex items-center gap-1.5"
                            >
                              {pending === b.id ? (
                                <Loader2 size={12} className="animate-spin" />
                              ) : (
                                <>
                                  <ShoppingCart size={12} /> Buy
                                </>
                              )}
                            </button>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })}

            <NavLinks
              links={[
                { to: "/wallet", label: "Purchase history & active boosts" },
                { to: "/feed", label: "Open feed to use boosts" },
              ]}
            />
          </div>
        )}
      </div>
      <BoostPostPicker
        open={!!pickerBundle}
        userId={user?.id}
        boostLabel={pickerBundle?.label ?? ""}
        onClose={() => setPickerBundle(null)}
        onPick={(postId) => {
          const b = pickerBundle;
          setPickerBundle(null);
          if (b) startCheckout(b, postId);
        }}
      />
    </AppShell>
  );
}

function NavLinks({ links }: { links: { to: string; label: string }[] }) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-2">
      {links.map((l) => (
        <Link
          key={l.to + l.label}
          to={l.to}
          className="flex items-center justify-between px-4 py-2.5 rounded-lg bg-muted/30 border border-border/50 text-sm hover:border-gold/40 hover:bg-muted/50 transition-colors"
        >
          <span className="text-muted-foreground">{l.label}</span>
          <ArrowRight size={14} className="text-muted-foreground" />
        </Link>
      ))}
    </div>
  );
}
