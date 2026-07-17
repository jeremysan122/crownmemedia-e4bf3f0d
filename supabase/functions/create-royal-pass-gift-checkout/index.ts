// Creates a Stripe embedded-checkout session for gifting a Royal Pass to another user.
// Client sends recipient_username + optional message; server creates a pending
// row in royal_pass_gifts and returns a clientSecret. On checkout.session.completed
// the payments-webhook finalises the grant.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import {
  type StripeEnv,
  createStripeClient,
  resolveOrCreateCustomer,
} from "../_shared/stripe.ts";
import { safeReturnUrl } from "../_shared/origin.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function json(status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

const GIFT_LOOKUP_KEY = "royal_pass_gift_1mo";
const GIFT_MONTHS = 1;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) return json(401, { error: "Unauthorized" });

    const userClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } },
    );
    const { data: userData, error: authErr } = await userClient.auth.getUser();
    if (authErr || !userData?.user) return json(401, { error: "Unauthorized" });
    const buyerId = userData.user.id;
    const buyerEmail = userData.user.email ?? undefined;

    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const body = await req.json().catch(() => ({}));
    const {
      recipient_username,
      message,
      environment,
    } = body as {
      recipient_username?: string;
      message?: string;
      environment?: StripeEnv;
    };

    if (environment !== "sandbox" && environment !== "live") {
      return json(400, { error: "environment required" });
    }
    if (!recipient_username || typeof recipient_username !== "string") {
      return json(400, { error: "recipient_username required" });
    }
    if (message && (typeof message !== "string" || message.length > 280)) {
      return json(400, { error: "message must be a string ≤ 280 chars" });
    }

    const cleanUsername = recipient_username.trim().replace(/^@/, "");
    const { data: recipientRows, error: resolveErr } = await admin.rpc(
      "resolve_gift_recipient",
      { _username: cleanUsername },
    );
    if (resolveErr) return json(500, { error: "Lookup failed" });
    const recipient = Array.isArray(recipientRows) ? recipientRows[0] : recipientRows;
    if (!recipient?.id) return json(404, { error: "Recipient not found" });
    if (recipient.id === buyerId) return json(400, { error: "Can't gift to yourself" });

    const stripe = createStripeClient(environment);
    const prices = await stripe.prices.list({ lookup_keys: [GIFT_LOOKUP_KEY], limit: 1 });
    if (!prices.data.length) return json(400, { error: "Gift price not found" });
    const stripePrice = prices.data[0];
    const amountUsd = (stripePrice.unit_amount ?? 0) / 100;

    const customerId = await resolveOrCreateCustomer(stripe, {
      email: buyerEmail,
      userId: buyerId,
    });

    // Pre-create the gift row so the webhook can look it up by session id.
    const { data: gift, error: giftErr } = await admin
      .from("royal_pass_gifts")
      .insert({
        buyer_id: buyerId,
        recipient_id: recipient.id,
        environment,
        amount_usd: amountUsd,
        months_granted: GIFT_MONTHS,
        message: message ?? null,
        status: "pending",
      })
      .select("id")
      .single();
    if (giftErr || !gift) return json(500, { error: "Could not create gift" });

    // The redirect destination is server-owned. The client cannot redirect a
    // completed purchase away from CrownMe or to an unexpected in-app route.
    const safeReturn = safeReturnUrl(req, "/royal-pass", "/royal-pass");
    const finalReturn =
      `${safeReturn}?gift_success=1&session_id={CHECKOUT_SESSION_ID}`;

    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      ui_mode: "embedded_page",
      return_url: finalReturn,
      line_items: [{ price: stripePrice.id, quantity: 1 }],
      customer: customerId,
      payment_intent_data: {
        description: `Royal Pass gift → @${recipient.username}`,
      },
      metadata: {
        user_id: buyerId,
        userId: buyerId,
        kind: "royal_pass_gift",
        gift_id: gift.id,
        recipient_id: recipient.id,
        recipient_username: recipient.username,
        months: String(GIFT_MONTHS),
      },
    });

    await admin
      .from("royal_pass_gifts")
      .update({ stripe_session_id: session.id })
      .eq("id", gift.id);

    return json(200, {
      clientSecret: session.client_secret,
      sessionId: session.id,
      gift_id: gift.id,
      recipient: { id: recipient.id, username: recipient.username },
    });
  } catch (err) {
    console.error("create-royal-pass-gift-checkout error:", err);
    return json(500, { error: "Couldn't start gift checkout. Try again." });
  }
});
