// Stripe Checkout webhook → credits Shekels (bundles) and activates boosts
import Stripe from "https://esm.sh/stripe@17.5.0?target=deno";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const stripeKey = Deno.env.get("STRIPE_SECRET_KEY");
const webhookSecret = Deno.env.get("STRIPE_WEBHOOK_SECRET");

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);

const stripe = stripeKey
  ? new Stripe(stripeKey, {
      apiVersion: "2024-12-18.acacia",
      httpClient: Stripe.createFetchHttpClient(),
    })
  : null;

// Codes whose messages are safe (and useful) to expose to Stripe's webhook UI.
// Everything else (notably handler_error / config_error) gets a generic message,
// with the real detail kept in server logs only.
const SAFE_ERROR_CODES = new Set([
  "missing_signature",
  "invalid_signature",
  "invalid_json",
  "unauthorized_test",
]);

function jsonError(status: number, code: string, detail: string) {
  console.error(`[stripe-webhook] ${code}: ${detail}`);
  const message = SAFE_ERROR_CODES.has(code) ? detail : "An internal error occurred";
  return new Response(JSON.stringify({ error: code, message }), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (!stripe) return jsonError(500, "config_error", "STRIPE_SECRET_KEY is not configured");
  if (!webhookSecret) return jsonError(500, "config_error", "STRIPE_WEBHOOK_SECRET is not configured");

  const sig = req.headers.get("stripe-signature");
  const isTest = Deno.env.get("ENABLE_WEBHOOK_TEST_BYPASS") === "true" && req.headers.get("x-test-bypass-signature") === "1";
  if (!sig && !isTest) return jsonError(400, "missing_signature", "stripe-signature header required");

  const body = await req.text();
  let event: Stripe.Event;

  if (isTest) {
    const testSecret = req.headers.get("x-test-secret");
    if (!testSecret || testSecret !== Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")) {
      return jsonError(401, "unauthorized_test", "Test bypass requires service-role secret");
    }
    try { event = JSON.parse(body) as Stripe.Event; }
    catch { return jsonError(400, "invalid_json", "Test payload is not valid JSON"); }
  } else {
    try {
      event = await stripe.webhooks.constructEventAsync(body, sig!, webhookSecret);
    } catch (err) {
      return jsonError(
        400,
        "invalid_signature",
        `Stripe signature verification failed — check that STRIPE_WEBHOOK_SECRET matches the secret shown in your Stripe webhook endpoint settings. (${(err as Error).message})`,
      );
    }
  }

  // Idempotency #1 — per Stripe event id (covers retries of same event)
  const { error: dupErr } = await supabase
    .from("stripe_events")
    .insert({ id: event.id, type: event.type });
  if (dupErr) {
    console.log(`[stripe-webhook] duplicate event ${event.id} (${event.type}) — skipping`);
    return new Response(JSON.stringify({ ok: true, duplicate: true }), {
      headers: { "Content-Type": "application/json" },
    });
  }

  // Idempotency #2 — per checkout session id (covers cases where Stripe sends a
  // brand-new event_id for the same session, e.g. after manual resend or replays).
  if (event.type === "checkout.session.completed") {
    const sessionId = (event.data.object as Stripe.Checkout.Session).id;
    const { data: existing } = await supabase
      .from("shekel_ledger")
      .select("id")
      .eq("stripe_session_id", sessionId)
      .limit(1)
      .maybeSingle();
    if (existing) {
      console.log(`[stripe-webhook] session ${sessionId} already credited — skipping (event ${event.id})`);
      return new Response(JSON.stringify({ ok: true, duplicate_session: true }), {
        headers: { "Content-Type": "application/json" },
      });
    }
  }

  async function upsertRoyalPassFromSubscription(sub: Stripe.Subscription, userIdHint?: string, planIdHint?: string) {
    const userId = userIdHint || (sub.metadata?.user_id as string | undefined);
    if (!userId) {
      console.warn(`[stripe-webhook] subscription ${sub.id} missing user_id metadata — skipping`);
      return;
    }
    const planId = planIdHint || (sub.metadata?.plan_id as string | undefined) || null;
    const periodStart = sub.current_period_start
      ? new Date(sub.current_period_start * 1000).toISOString()
      : null;
    const periodEnd = sub.current_period_end
      ? new Date(sub.current_period_end * 1000).toISOString()
      : null;

    const { data: existing } = await supabase
      .from("royal_pass_subscriptions")
      .select("id")
      .eq("user_id", userId)
      .maybeSingle();

    const row = {
      user_id: userId,
      plan_id: planId,
      stripe_customer_id: typeof sub.customer === "string" ? sub.customer : sub.customer?.id ?? null,
      stripe_subscription_id: sub.id,
      status: sub.status,
      current_period_start: periodStart,
      current_period_end: periodEnd,
      cancel_at_period_end: !!sub.cancel_at_period_end,
      updated_at: new Date().toISOString(),
    };

    if (existing) {
      await supabase.from("royal_pass_subscriptions").update(row).eq("user_id", userId);
    } else {
      await supabase.from("royal_pass_subscriptions").insert(row);
    }
    // Award referral bonus (+30 free pass days for both inviter & invitee)
    // when both have an active pass. Function is idempotent.
    if (sub.status === "active" || sub.status === "trialing") {
      try {
        await supabase.rpc("grant_pass_invite_bonus", { _user_id: userId });
      } catch (e) {
        console.warn(`[stripe-webhook] grant_pass_invite_bonus failed for ${userId}: ${e}`);
      }
    }
    console.log(`[stripe-webhook] royal_pass user=${userId} status=${sub.status} ends=${periodEnd}`);
  }

  async function recordRoyalPassReceipt(
    session: Stripe.Checkout.Session,
    sub: Stripe.Subscription,
    userId: string,
    planId?: string,
  ) {
    // Skip if we've already recorded this session
    const { data: existing } = await supabase
      .from("shekel_ledger")
      .select("id")
      .eq("stripe_session_id", session.id)
      .eq("kind", "royal_pass")
      .maybeSingle();
    if (existing) return;

    let label = "Royal Pass · Subscription";
    if (planId) {
      const { data: plan } = await supabase
        .from("royal_pass_plans")
        .select("name, interval")
        .eq("id", planId)
        .maybeSingle();
      if (plan) label = `${plan.name} (${plan.interval}ly)`;
    }
    const usd = (session.amount_total ?? 0) / 100;
    const customerId = typeof sub.customer === "string" ? sub.customer : sub.customer?.id ?? null;
    const periodEnd = sub.current_period_end
      ? new Date(sub.current_period_end * 1000).toISOString()
      : null;

    await supabase.from("shekel_ledger").insert({
      user_id: userId,
      kind: "royal_pass",
      shekels_delta: 0,
      usd_amount: usd,
      label,
      stripe_session_id: session.id,
      stripe_event_id: event.id,
      metadata: {
        stripe_subscription_id: sub.id,
        stripe_customer_id: customerId,
        stripe_invoice: session.invoice ?? null,
        status: sub.status,
        current_period_end: periodEnd,
        plan_id: planId ?? null,
      },
    });
  }

  try {
    if (
      event.type === "customer.subscription.updated" ||
      event.type === "customer.subscription.deleted" ||
      event.type === "customer.subscription.created"
    ) {
      const sub = event.data.object as Stripe.Subscription;
      if ((sub.metadata?.kind as string) === "royal_pass") {
        await upsertRoyalPassFromSubscription(sub);
      }
    }

    if (event.type === "checkout.session.completed") {
      const session = event.data.object as Stripe.Checkout.Session;
      const userId = session.metadata?.user_id;
      if (!userId) throw new Error("missing user_id metadata");

      // Royal Pass subscription checkout
      if (session.mode === "subscription" && session.metadata?.kind === "royal_pass" && session.subscription) {
        const subId = typeof session.subscription === "string" ? session.subscription : session.subscription.id;
        const sub = await stripe.subscriptions.retrieve(subId);
        await upsertRoyalPassFromSubscription(sub, userId, session.metadata?.plan_id);
        await recordRoyalPassReceipt(session, sub, userId, session.metadata?.plan_id);
        return new Response(JSON.stringify({ ok: true, royal_pass: true }), {
          headers: { "Content-Type": "application/json" },
        });
      }

      let totalShekels = 0;
      const bundleLabels: string[] = [];
      const boostsActivated: { boost_type: string; duration_hours: number; label: string; boost_id: string; usd: number }[] = [];
      let totalUsd = 0;

      if (isTest && session.metadata?.test_shekels) {
        totalShekels = Number(session.metadata.test_shekels);
        bundleLabels.push("Test credit");
      } else {
        const lineItems = await stripe.checkout.sessions.listLineItems(session.id, { limit: 20 });
        for (const item of lineItems.data) {
          const priceId = item.price?.id;
          if (!priceId) continue;
          const qty = item.quantity || 1;
          const itemUsd = (item.amount_total ?? 0) / 100;
          totalUsd += itemUsd;

          // Try Shekel bundle
          const { data: bundle } = await supabase
            .from("shekel_bundles")
            .select("shekels, label")
            .eq("stripe_price_id", priceId)
            .maybeSingle();
          if (bundle) {
            const credit = Number(bundle.shekels) * qty;
            totalShekels += credit;
            bundleLabels.push(`${qty}× ${bundle.label}`);

            await supabase.from("shekel_ledger").insert({
              user_id: userId,
              kind: "bundle_purchase",
              shekels_delta: credit,
              usd_amount: itemUsd,
              label: bundle.label,
              stripe_session_id: session.id,
              stripe_event_id: event.id,
              metadata: { price_id: priceId, quantity: qty },
            });
            continue;
          }

          // Try Boost bundle
          const { data: boost } = await supabase
            .from("boost_bundles")
            .select("boost_type, duration_hours, label")
            .eq("stripe_price_id", priceId)
            .maybeSingle();
          if (boost) {
            const expires = new Date(Date.now() + boost.duration_hours * 3600_000).toISOString();
            const { data: b } = await supabase.from("boosts")
              .insert({ user_id: userId, boost_type: boost.boost_type, active: true, expires_at: expires })
              .select("id").single();
            boostsActivated.push({
              boost_type: boost.boost_type,
              duration_hours: boost.duration_hours,
              label: boost.label,
              boost_id: b?.id ?? "",
              usd: itemUsd,
            });
            await supabase.from("shekel_ledger").insert({
              user_id: userId,
              kind: "boost_stripe",
              shekels_delta: 0,
              usd_amount: itemUsd,
              label: `${boost.label} (${boost.duration_hours}h)`,
              stripe_session_id: session.id,
              stripe_event_id: event.id,
              reference_id: b?.id ?? null,
              metadata: { price_id: priceId, boost_type: boost.boost_type, duration_hours: boost.duration_hours },
            });
            continue;
          }

          console.warn(`[stripe-webhook] unknown price_id ${priceId} on session ${session.id}`);
        }
      }

      // Credit Shekels
      if (totalShekels > 0) {
        const { data: wallet } = await supabase
          .from("wallets").select("shekel_balance").eq("user_id", userId).maybeSingle();
        if (wallet) {
          await supabase.from("wallets")
            .update({
              shekel_balance: Number(wallet.shekel_balance) + totalShekels,
              updated_at: new Date().toISOString(),
            })
            .eq("user_id", userId);
        } else {
          await supabase.from("wallets").insert({ user_id: userId, shekel_balance: 12450 + totalShekels });
        }
      }

      if (isTest && totalShekels > 0 && bundleLabels[0] === "Test credit") {
        await supabase.from("shekel_ledger").insert({
          user_id: userId,
          kind: "bundle_purchase",
          shekels_delta: totalShekels,
          usd_amount: 0,
          label: "Test credit",
          stripe_session_id: session.id,
          stripe_event_id: event.id,
        });
      }

      console.log(`[stripe-webhook] event=${event.id} user=${userId} shekels=${totalShekels} boosts=${boostsActivated.length} usd=${totalUsd.toFixed(2)}`);
    }
  } catch (err) {
    console.error(`[stripe-webhook] handler error for ${event.id}:`, err);
    await supabase.from("stripe_events").delete().eq("id", event.id);
    return jsonError(500, "handler_error", (err as Error).message);
  }

  return new Response(JSON.stringify({ ok: true }), {
    headers: { "Content-Type": "application/json" },
  });
});
