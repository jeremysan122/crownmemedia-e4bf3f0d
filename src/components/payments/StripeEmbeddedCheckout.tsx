import { EmbeddedCheckoutProvider, EmbeddedCheckout } from "@stripe/react-stripe-js";
import { useCallback, useRef } from "react";
import { getStripe, getStripeEnvironment } from "@/lib/stripe";
import { supabase } from "@/integrations/supabase/client";
import { friendlyMonetizationError, type MonetizationScope } from "@/lib/monetizationErrors";

export interface StripeEmbeddedCheckoutProps {
  /**
   * Optional label used only for UI/logging. Never sent to the edge function.
   * Stripe price IDs are resolved server-side from bundle_id/plan_id/etc.
   */
  priceId?: string;
  /** Edge function name to call to create the session. */
  fnName: "create-checkout" | "create-royal-pass-checkout" | "create-verification-checkout";
  /**
   * Extra body fields to send. MUST include the internal catalog id
   * (bundle_id / boost_bundle_id / plan_id / target_post_id).
   * The client MUST NEVER send stripe_price_id here.
   */
  extraBody?: Record<string, unknown>;
  /** Called after checkout completes (session is paid). Receives sessionId. */
  onComplete?: (sessionId: string) => void;
}

const SCOPE_BY_FN: Record<StripeEmbeddedCheckoutProps["fnName"], MonetizationScope> = {
  "create-checkout": "checkout",
  "create-royal-pass-checkout": "royal_pass_checkout",
  "create-verification-checkout": "verification_checkout",
};

/**
 * Renders Stripe's embedded checkout inline. Uses `redirect_on_completion: 'never'`
 * server-side so Stripe never navigates the top window — the parent React app
 * stays mounted, which avoids losing the auth session inside iframed previews
 * (storage partitioning) and gives us a clean SPA route transition on success.
 *
 * The client MUST NEVER send stripe_price_id. Send bundle_id / boost_bundle_id /
 * plan_id in `extraBody`; the edge function resolves the Stripe price server-side.
 */
export function StripeEmbeddedCheckoutMount({
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
        environment: getStripeEnvironment(),
        ...(extraBody ?? {}),
      },
    });
    if (error || !data?.clientSecret) {
      // Log raw for diagnostics, throw friendly for user surfaces
      console.error(`[${fnName}] checkout create failed:`, error ?? data);
      throw new Error(friendlyMonetizationError(SCOPE_BY_FN[fnName], error ?? data));
    }
    sessionIdRef.current = (data as { sessionId?: string }).sessionId ?? null;
    return data.clientSecret as string;
  }, [fnName, extraBody]);

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
