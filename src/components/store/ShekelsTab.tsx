import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Loader2, Sparkles, ShoppingCart } from "lucide-react";
import { SHEKEL, formatShekels } from "@/lib/gifts";
import { useStripeCheckout } from "@/hooks/useStripeCheckout";

interface Bundle {
  id: string;
  shekels: number;
  usd: number;
  label: string;
  sort_order: number;
}

export default function ShekelsTab() {
  const [bundles, setBundles] = useState<Bundle[]>([]);
  const [loading, setLoading] = useState(true);
  const [pending] = useState<string | null>(null);
  const { openCheckout, checkoutElement } = useStripeCheckout();

  useEffect(() => {
    (async () => {
      // NOTE: never select stripe_price_id — resolved server-side.
      const { data } = await supabase
        .from("shekel_bundles")
        .select("id, shekels, usd, label, sort_order")
        .eq("active", true)
        .order("sort_order", { ascending: true });
      setBundles((data as Bundle[]) ?? []);
      setLoading(false);
    })();
  }, []);

  const buy = (b: Bundle) => {
    openCheckout({
      fnName: "create-checkout",
      extraBody: { bundle_id: b.id },
      title: `${b.label} — ${formatShekels(Number(b.shekels))} Shekels`,
      returnUrl: `${window.location.origin}/store/success`,
    });
  };

  // Compute best per-shekel rate to flag value bundles
  const cheapestRate =
    bundles.length > 0
      ? Math.min(...bundles.map((b) => Number(b.usd) / Math.max(1, Number(b.shekels))))
      : 0;

  return (
    <div className="space-y-3 animate-fade-in">
      <div className="text-center pt-2">
        <h1 className="font-display text-2xl text-gold">Shekels</h1>
        <p className="text-xs text-muted-foreground mt-1">
          Top up your royal wallet · paid securely via Stripe
        </p>
      </div>

      {loading && (
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="h-32 rounded-2xl bg-muted/30 animate-pulse" />
          ))}
        </div>
      )}

      {!loading && bundles.length === 0 && (
        <p className="text-center text-xs text-muted-foreground py-8">
          No bundles available right now.
        </p>
      )}

      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
        {bundles.map((b) => {
          const rate = Number(b.usd) / Math.max(1, Number(b.shekels));
          const savings =
            cheapestRate > 0 && rate <= cheapestRate * 1.001
              ? "Best value"
              : Number(b.usd) >= 9.99 && Number(b.usd) <= 49.99
              ? "Popular"
              : null;
          return (
            <button
              key={b.id}
              disabled={pending !== null}
              onClick={() => buy(b)}
              className="relative rounded-2xl p-4 flex flex-col items-center gap-1.5 active:scale-95 transition-all bg-card/70 border border-border/60 hover:border-primary/50 disabled:opacity-60"
            >
              {savings && (
                <span className="absolute -top-2 left-1/2 -translate-x-1/2 px-2 py-0.5 rounded-full text-[9px] font-bold uppercase tracking-wider bg-gradient-gold text-primary-foreground gold-shadow whitespace-nowrap">
                  {savings}
                </span>
              )}
              <Sparkles size={20} className="text-gold" />
              <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
                {b.label}
              </div>
              <div className="text-base font-bold tabular-nums flex items-center gap-1">
                <span className="text-gold">{SHEKEL}</span>
                {formatShekels(Number(b.shekels))}
              </div>
              <div className="text-xs font-semibold tabular-nums text-muted-foreground">
                ${Number(b.usd).toFixed(2)}
              </div>
              <div className="h-7 mt-1 flex items-center">
                {pending === b.id ? (
                  <Loader2 size={12} className="animate-spin" />
                ) : (
                  <span className="text-[10px] inline-flex items-center gap-1 text-foreground/80">
                    <ShoppingCart size={10} /> Buy
                  </span>
                )}
              </div>
            </button>
          );
        })}
      </div>

      <p className="text-center text-[10px] text-muted-foreground pt-2">
        1 ₪ = $0.001 · Bundles may include bonus Shekels · Shekels never expire
      </p>
      {checkoutElement}
    </div>
  );
}
