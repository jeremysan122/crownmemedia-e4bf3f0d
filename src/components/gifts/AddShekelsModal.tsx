import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { SHEKEL, formatShekels } from "@/lib/gifts";
import { Sparkles, Loader2 } from "lucide-react";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useStripeCheckout } from "@/hooks/useStripeCheckout";

interface Bundle {
  id: string;
  stripe_price_id: string;
  shekels: number;
  usd: number;
  label: string;
  sort_order: number;
}

export default function AddShekelsModal({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  // Legacy prop kept for compatibility — Stripe webhook now credits server-side
  onPurchase?: (shekels: number, usd: number) => Promise<void> | void;
}) {
  const [bundles, setBundles] = useState<Bundle[]>([]);
  const [loading, setLoading] = useState(true);
  const { openCheckout, checkoutElement } = useStripeCheckout();

  useEffect(() => {
    if (!open) return;
    (async () => {
      setLoading(true);
      const { data } = await supabase
        .from("shekel_bundles")
        .select("id, stripe_price_id, shekels, usd, label, sort_order")
        .eq("active", true)
        .order("sort_order", { ascending: true });
      setBundles((data as Bundle[]) || []);
      setLoading(false);
    })();
  }, [open]);

  const buy = (b: Bundle) => {
    onOpenChange(false);
    openCheckout({
      priceId: b.stripe_price_id,
      fnName: "create-checkout",
      title: `${b.label} — ${formatShekels(Number(b.shekels))} Shekels`,
      returnUrl: `${window.location.origin}/store/success`,
    });
  };


  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md p-0 overflow-hidden bg-gradient-card border-border/60">
        <DialogHeader className="p-5 pb-3">
          <DialogTitle className="font-display text-xl text-gold flex items-center gap-2">
            <Sparkles size={18} className="text-primary" />
            Add Shekels
          </DialogTitle>
          <p className="text-xs text-muted-foreground">Choose a royal bundle · paid securely via Stripe</p>
        </DialogHeader>
        <div className="px-5 pb-5 grid grid-cols-2 gap-2.5 max-h-[60vh] overflow-y-auto scrollbar-none">
          {loading && (
            <div className="col-span-2 py-10 flex items-center justify-center text-muted-foreground">
              <Loader2 size={18} className="animate-spin mr-2" /> Loading bundles…
            </div>
          )}
          {!loading && bundles.length === 0 && (
            <p className="col-span-2 text-center text-xs text-muted-foreground py-8">
              No bundles configured yet. Ask an admin to add bundles in the Admin panel.
            </p>
          )}
          {bundles.map((b) => (
            <button
              key={b.id}
              onClick={() => buy(b)}
              className="relative rounded-2xl p-4 flex flex-col items-center gap-1 active:scale-95 transition-all bg-card/70 border border-border/60 hover:border-primary/50"
            >
              <div className="text-2xl">💰</div>
              <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{b.label}</div>
              <div className="text-base font-bold tabular-nums flex items-center gap-1">
                <span className="text-gold">{SHEKEL}</span>
                {formatShekels(Number(b.shekels))}
              </div>
              <div className="text-xs font-semibold tabular-nums text-muted-foreground">
                ${Number(b.usd).toFixed(2)}
              </div>
            </button>
          ))}
        </div>
      </DialogContent>
      {checkoutElement}
    </Dialog>
  );
}
