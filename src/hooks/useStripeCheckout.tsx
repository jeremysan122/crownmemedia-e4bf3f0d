import { useCallback, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  StripeEmbeddedCheckoutMount,
  type StripeEmbeddedCheckoutProps,
} from "@/components/payments/StripeEmbeddedCheckout";

type OpenOptions = Omit<StripeEmbeddedCheckoutProps, "onComplete"> & {
  title?: string;
  /**
   * Path to SPA-navigate to after checkout completes. `{SESSION_ID}` in the
   * string is replaced with the Stripe session id. If a `returnUrl` (full URL)
   * is provided instead, only its pathname + search is used (we never reload).
   */
  successPath?: string;
  /** Back-compat: a full URL — only the path+query are used for SPA navigation. */
  returnUrl?: string;
};

export function useStripeCheckout() {
  const [opts, setOpts] = useState<OpenOptions | null>(null);
  const navigate = useNavigate();

  const openCheckout = useCallback((next: OpenOptions) => setOpts(next), []);
  const closeCheckout = useCallback(() => setOpts(null), []);

  const handleComplete = useCallback(
    (sessionId: string) => {
      const raw = opts?.successPath
        ?? (opts?.returnUrl
          ? (() => {
              try { const u = new URL(opts.returnUrl!); return `${u.pathname}${u.search}`; }
              catch { return opts.returnUrl!; }
            })()
          : null);
      setOpts(null);
      if (!raw) return;
      const withId = raw.includes("{SESSION_ID}")
        ? raw.replace("{SESSION_ID}", encodeURIComponent(sessionId))
        : (sessionId
            ? `${raw}${raw.includes("?") ? "&" : "?"}session_id=${encodeURIComponent(sessionId)}`
            : raw);
      navigate(withId);
    },
    [opts, navigate],
  );

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
            fnName={opts.fnName}
            extraBody={opts.extraBody}
            onComplete={handleComplete}
          />
        </div>
      </DialogContent>
    </Dialog>
  ) : null;

  return { openCheckout, closeCheckout, isOpen: !!opts, checkoutElement };
}
