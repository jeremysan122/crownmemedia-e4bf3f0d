import { EmbeddedCheckoutProvider, EmbeddedCheckout } from "@stripe/react-stripe-js";
import { getStripe, getStripeEnvironment } from "@/lib/stripe";
import { supabase } from "@/integrations/supabase/client";

export interface StripeEmbeddedCheckoutProps {
  /** Lovable Payments price ID (e.g. "shekels_starter_pouch"). */
  priceId: string;
  /** Edge function name to call to create the session. */
  fnName: "create-checkout" | "create-royal-pass-checkout" | "create-verification-checkout";
  /** Extra body fields to send (e.g. target_post_id for boosts). */
  extraBody?: Record<string, unknown>;
  /** Optional return URL after payment completes. Receives ?session_id=… */
  returnUrl?: string;
}

/**
 * Renders Stripe's embedded checkout inline. The fetchClientSecret closure
 * is created once per mount (the surrounding hook unmounts on close), so the
 * EmbeddedCheckoutProvider never sees a changing clientSecret.
 */
export function StripeEmbeddedCheckoutMount({
  priceId,
  fnName,
  extraBody,
  returnUrl,
}: StripeEmbeddedCheckoutProps) {
  const fetchClientSecret = async (): Promise<string> => {
    const { data, error } = await supabase.functions.invoke(fnName, {
      body: {
        price_id: priceId,
        environment: getStripeEnvironment(),
        return_url: returnUrl,
        ...extraBody,
      },
    });
    if (error || !data?.clientSecret) {
      throw new Error((error as Error | undefined)?.message || "Failed to create checkout session");
    }
    return data.clientSecret as string;
  };

  return (
    <div id="checkout" className="min-h-[520px]">
      <EmbeddedCheckoutProvider stripe={getStripe()} options={{ fetchClientSecret }}>
        <EmbeddedCheckout />
      </EmbeddedCheckoutProvider>
    </div>
  );
}
