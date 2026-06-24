import { useCallback, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  StripeEmbeddedCheckoutMount,
  type StripeEmbeddedCheckoutProps,
} from "@/components/payments/StripeEmbeddedCheckout";

type OpenOptions = Omit<StripeEmbeddedCheckoutProps, never> & { title?: string };

export function useStripeCheckout() {
  const [opts, setOpts] = useState<OpenOptions | null>(null);

  const openCheckout = useCallback((next: OpenOptions) => setOpts(next), []);
  const closeCheckout = useCallback(() => setOpts(null), []);

  const checkoutElement = opts ? (
    <Dialog open onOpenChange={(o) => !o && closeCheckout()}>
      <DialogContent className="max-w-xl p-0 overflow-hidden max-h-[90vh] flex flex-col">
        <DialogHeader className="px-5 pt-5 pb-2 shrink-0">
          <DialogTitle className="font-display text-lg">
            {opts.title ?? "Secure Checkout"}
          </DialogTitle>
        </DialogHeader>
        <div className="px-3 pb-3 overflow-y-auto flex-1 min-h-0">
          <StripeEmbeddedCheckoutMount
            priceId={opts.priceId}
            fnName={opts.fnName}
            extraBody={opts.extraBody}
            returnUrl={opts.returnUrl}
          />
        </div>
      </DialogContent>
    </Dialog>
  ) : null;

  return { openCheckout, closeCheckout, isOpen: !!opts, checkoutElement };
}
