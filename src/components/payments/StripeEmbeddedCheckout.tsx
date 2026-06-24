import { EmbeddedCheckoutProvider, EmbeddedCheckout } from "@stripe/react-stripe-js";
import { useCallback, useRef } from "react";
import { getStripe, getStripeEnvironment } from "@/lib/stripe";
import { supabase } from "@/integrations/supabase/client";

export interface StripeEmbeddedCheckoutProps {
  /** Lovable Payments price ID (e.g. "shekels_starter_pouch"). */
  priceId: string;
  /** Edge function name to call to create the session. */
  fnName: "create-checkout" | "create-royal-pass-checkout" | "create-verification-checkout";
  /** Extra body fields to send (e.g. target_post_id for boosts). */
  extraBody?: Record<string, unknown>;
  /** Called after checkout completes (session is paid). Receives sessionId. */
  onComplete?: (sessionId: string) => void;
}

/**
 * Renders Stripe's embedded checkout inline. Uses `redirect_on_completion: 'never'`
 * server-side so Stripe never navigates the top window — the parent React app
 * stays mounted, which avoids losing the auth session inside iframed previews
 * (storage partitioning) and gives us a clean SPA route transition on success.
 */
export function StripeEmbeddedCheckoutMount({
  priceId,
  fnName,
  extraBody,
  onComplete,
}: StripeEmbeddedCheckoutProps) {
  const sessionIdRef = useRef<string | null>(null);
  const onCompleteRef = useRef(onComplete);
  onCompleteRef.current = onComplete;

  const fetchClientSecret = useCallback(async (): Promise<string> => {
    const { data, error } = await supabase.functions.invoke(fnName, {
      body: {
        price_id: priceId,
        environment: getStripeEnvironment(),
        ...extraBody,
      },
    });
    if (error || !data?.clientSecret) {
      throw new Error((error as Error | undefined)?.message || "Failed to create checkout session");
    }
    sessionIdRef.current = (data as { sessionId?: string }).sessionId ?? null;
    return data.clientSecret as string;
  }, [fnName, priceId, extraBody]);

  const handleComplete = useCallback(() => {
    onCompleteRef.current?.(sessionIdRef.current ?? "");
  }, []);

  return (
    <div id="checkout" className="min-h-[520px]">
      <EmbeddedCheckoutProvider
        stripe={getStripe()}
        options={{ fetchClientSecret, onComplete: handleComplete }}
      >
        <EmbeddedCheckout />
      </EmbeddedCheckoutProvider>
    </div>
  );
}
