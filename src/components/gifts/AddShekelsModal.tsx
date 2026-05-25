import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { SHEKEL, formatShekels } from "@/lib/gifts";
import { Sparkles, Loader2 } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";

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
  const [pending, setPending] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

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

  const buy = async (b: Bundle) => {
    setPending(b.id);
    try {
      const { data, error } = await supabase.functions.invoke("create-checkout", {
        body: { price_id: b.stripe_price_id, return_path: "/store/success" },
      });
      if (error) throw error;
      const url = (data as { url?: string })?.url;
      if (!url) throw new Error("No checkout URL returned");
      window.open(url, "_blank");
      toast.success("Opening Stripe Checkout…");
    } catch (e) {
      toast.error((e as Error).message || "Could not start checkout");
    } finally {
      setPending(null);
    }
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
              disabled={pending !== null}
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
              {pending === b.id && <div className="text-[10px] mt-1 opacity-80 flex items-center gap-1"><Loader2 size={10} className="animate-spin" /> Opening…</div>}
            </button>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}
