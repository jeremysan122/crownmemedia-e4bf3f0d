// Lovable-managed Stripe webhook
//   Routes via ?env=sandbox or ?env=live
//   Verifies with PAYMENTS_SANDBOX_WEBHOOK_SECRET / PAYMENTS_LIVE_WEBHOOK_SECRET
//   Resolves prices via lookup_key (stable across sandbox/live) with fallback to Stripe price ID
//   Preserves: Shekel crediting, boost activation, Royal Pass subscription state, verification flow
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import {
  type StripeEnv,
  createStripeClient,
  verifyWebhook,
} from "../_shared/stripe.ts";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);

function jsonError(status: number, code: string, detail: string) {
  console.error(`[stripe-webhook] ${code}: ${detail}`);
  return new Response(JSON.stringify({ error: code, message: detail }), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return new Response("Method not allowed", { status: 405 });

  const rawEnv = new URL(req.url).searchParams.get("env");
  if (rawEnv !== "sandbox" && rawEnv !== "live") {
    console.error("[stripe-webhook] missing/invalid ?env=", rawEnv);
    return jsonError(400, "invalid_environment", "Webhook URL must include ?env=sandbox or ?env=live");
  }
  const env: StripeEnv = rawEnv;

  let event: { id: string; type: string; data: { object: any } };
  try {
    event = await verifyWebhook(req, env);
  } catch (err) {
    return jsonError(400, "invalid_signature", (err as Error).message);
  }

  // Idempotency #1 — per Stripe event id
  const { error: dupErr } = await supabase
    .from("stripe_events")
    .insert({ id: event.id, type: event.type });
  if (dupErr) {
    if ((dupErr as { code?: string }).code === "23505") {
      console.log(`[stripe-webhook] duplicate event ${event.id} — skipping`);
      return new Response(JSON.stringify({ ok: true, duplicate: true }), {
        headers: { "Content-Type": "application/json" },
      });
    }
    return jsonError(500, "idempotency_store_unavailable", dupErr.message);
  }

  const stripe = createStripeClient(env);

  async function resolveLookupKey(price: any): Promise<string | null> {
    if (!price) return null;
    if (price.lookup_key) return price.lookup_key as string;
    if (price.metadata?.lovable_external_id) return price.metadata.lovable_external_id as string;
    return null;
  }

  async function upsertRoyalPassFromSubscription(
    sub: any,
    userIdHint?: string,
    planIdHint?: string,
  ) {
    const userId = userIdHint || sub.metadata?.userId || sub.metadata?.user_id;
    if (!userId) {
      throw new Error(`Subscription ${sub.id} is missing user_id metadata`);
    }
    const planId = planIdHint || sub.metadata?.plan_id || null;
    const item = sub.items?.data?.[0];
    const periodStart = item?.current_period_start ?? sub.current_period_start;
    const periodEnd = item?.current_period_end ?? sub.current_period_end;

    const { data: existing } = await supabase
      .from("royal_pass_subscriptions")
      .select("id")
      .eq("user_id", userId)
      .maybeSingle()
      .throwOnError();

    const row = {
      user_id: userId,
      plan_id: planId,
      stripe_customer_id:
        typeof sub.customer === "string" ? sub.customer : sub.customer?.id ?? null,
      stripe_subscription_id: sub.id,
      provider: "stripe",
      provider_subscription_id: sub.id,
      status: sub.status,
      current_period_start: periodStart ? new Date(periodStart * 1000).toISOString() : null,
      current_period_end: periodEnd ? new Date(periodEnd * 1000).toISOString() : null,
      cancel_at_period_end: !!sub.cancel_at_period_end,
      updated_at: new Date().toISOString(),
    };

    if (existing) {
      await supabase.from("royal_pass_subscriptions").update(row).eq("user_id", userId).throwOnError();
    } else {
      await supabase.from("royal_pass_subscriptions").insert(row).throwOnError();
    }

    if (sub.status === "active" || sub.status === "trialing") {
      try {
        const { error } = await supabase.rpc("grant_pass_invite_bonus", { _user_id: userId });
        if (error) throw error;
      } catch (e) {
        console.warn(`[stripe-webhook] grant_pass_invite_bonus failed for ${userId}: ${e}`);
      }
    }
    console.log(`[stripe-webhook] royal_pass user=${userId} status=${sub.status}`);
  }

  async function recordRoyalPassReceipt(session: any, sub: any, userId: string, planId?: string) {
    const { data: existing } = await supabase
      .from("shekel_ledger")
      .select("id")
      .eq("stripe_session_id", session.id)
      .eq("kind", "royal_pass")
      .maybeSingle()
      .throwOnError();
    if (existing) return;

    let label = "Royal Pass · Subscription";
    if (planId) {
      const { data: plan } = await supabase
        .from("royal_pass_plans")
        .select("name, interval")
        .eq("id", planId)
        .maybeSingle()
        .throwOnError();
      if (plan) label = `${plan.name} (${plan.interval}ly)`;
    }
    const usd = (session.amount_total ?? 0) / 100;

    await supabase.from("shekel_ledger").upsert({
      user_id: userId,
      kind: "royal_pass",
      shekels_delta: 0,
      usd_amount: usd,
      label,
      stripe_session_id: session.id,
      stripe_event_id: event.id,
      provider_event_id: `${session.id}:royal_pass`,
      metadata: {
        stripe_subscription_id: sub.id,
        stripe_customer_id:
          typeof sub.customer === "string" ? sub.customer : sub.customer?.id ?? null,
        stripe_invoice: session.invoice ?? null,
        status: sub.status,
        plan_id: planId ?? null,
      },
    }, { onConflict: "kind,provider_event_id", ignoreDuplicates: true }).throwOnError();
  }

  async function applyVerificationSubscription(sub: any, userIdHint?: string) {
    const userId = userIdHint || sub.metadata?.userId || sub.metadata?.user_id;
    if (!userId) {
      throw new Error(`Verification subscription ${sub.id} is missing user_id metadata`);
    }
    const isActive = sub.status === "active" || sub.status === "trialing";
    const item = sub.items?.data?.[0];
    const periodEnd = item?.current_period_end ?? sub.current_period_end;
    const renewsAt = periodEnd ? new Date(periodEnd * 1000).toISOString() : null;

    // IMPORTANT: paid verification is a FAST-TRACK / PRIORITY REVIEW product,
    // NOT auto-approval. Payment never sets profiles.verified = true and never
    // sets verification_requests.status = 'approved'. Admin still reviews the
    // submitted documents. If the user hasn't submitted a request yet, we
    // create a pending placeholder so the admin queue picks it up.
    const { data: existing } = await supabase
      .from("verification_requests")
      .select("id, status")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle()
      .throwOnError();

    if (existing) {
      // Preserve the current review status. Payment only updates billing linkage.
      // Only update billing linkage; never flip to 'approved' from payment alone.
      await supabase
        .from("verification_requests")
        .update({
          subscription_active: isActive,
          subscription_id: sub.id,
          subscription_renews_at: renewsAt,
          updated_at: new Date().toISOString(),
        })
        .eq("id", existing.id)
        .throwOnError();
    } else {
      await supabase.from("verification_requests").insert({
        user_id: userId,
        plan: "subscription",
        legal_name: "(via subscription — pending user submission)",
        category: "subscription",
        reason: "Paid priority-review slot. Awaiting user documents + admin review.",
        status: "pending",
        subscription_active: isActive,
        subscription_id: sub.id,
        subscription_renews_at: renewsAt,
      }).throwOnError();
    }

    // Do NOT touch profiles.verified from payment. Admin approval is required.
    console.log(
      `[stripe-webhook] verification user=${userId} active=${isActive} — priority review only, no auto-approve`,
    );
  }

  try {
    // ---- Stripe Connect (creator payouts) ----
    if (event.type === "account.updated") {
      const acct = event.data.object;
      await supabase
        .from("connect_accounts")
        .update({
          charges_enabled: !!acct.charges_enabled,
          payouts_enabled: !!acct.payouts_enabled,
          details_submitted: !!acct.details_submitted,
          updated_at: new Date().toISOString(),
        })
        .eq("stripe_account_id", acct.id)
        .throwOnError();
      console.log(`[stripe-webhook] account.updated ${acct.id}`);
      return new Response(JSON.stringify({ ok: true }), { headers: { "Content-Type": "application/json" } });
    }

    if (event.type === "payout.paid" || event.type === "payout.failed" || event.type === "payout.created") {
      const payout = event.data.object;
      const accountId = (event as any).account as string | undefined;
      if (accountId) {
        const status = event.type === "payout.paid" ? "paid"
          : event.type === "payout.failed" ? "failed" : "pending";
        const { data: ca } = await supabase
          .from("connect_accounts").select("user_id")
          .eq("stripe_account_id", accountId).maybeSingle().throwOnError();
        if (ca) {
          const { data: existing } = await supabase
            .from("payouts").select("id").eq("stripe_payout_id", payout.id).maybeSingle().throwOnError();
          if (existing) {
            await supabase.from("payouts").update({ status }).eq("stripe_payout_id", payout.id).throwOnError();
          } else {
            await supabase.from("payouts").insert({
              user_id: (ca as any).user_id,
              amount_usd: payout.amount / 100,
              status,
              payout_method: "stripe_connect",
              stripe_payout_id: payout.id,
              stripe_account_id: accountId,
            }).throwOnError();
          }
        }
      }
      return new Response(JSON.stringify({ ok: true }), { headers: { "Content-Type": "application/json" } });
    }

    // Royal Pass monthly benefit grants — fires on paid invoice (initial + every renewal).
    // Idempotent by (user_id, period_start) and by stripe event id.
    // We listen to exactly ONE successful-invoice event: invoice.paid.
    if (event.type === "invoice.paid") {
      const invoice = event.data.object as any;
      const subId = typeof invoice.subscription === "string"
        ? invoice.subscription
        : invoice.subscription?.id;
      if (subId) {
        try {
          const sub = await stripe.subscriptions.retrieve(subId) as any;
          const kind = sub.metadata?.kind as string | undefined;
          const userId = sub.metadata?.userId || sub.metadata?.user_id;
          if (kind === "royal_pass" && userId) {
            const line = invoice.lines?.data?.[0] as any;
            const periodStart = line?.period?.start ?? sub.items?.data?.[0]?.current_period_start ?? sub.current_period_start;
            const periodEnd = line?.period?.end ?? sub.items?.data?.[0]?.current_period_end ?? sub.current_period_end;
            const paidCents = Number(invoice.amount_paid ?? 0);
            // Resolve Stripe reference IDs for later refund/dispute mapping.
            const paymentIntentId = typeof invoice.payment_intent === "string"
              ? invoice.payment_intent
              : invoice.payment_intent?.id ?? null;
            let chargeId: string | null = null;
            if (paymentIntentId) {
              try {
                const pi = await stripe.paymentIntents.retrieve(paymentIntentId);
                chargeId = typeof pi.latest_charge === "string"
                  ? pi.latest_charge
                  : (pi.latest_charge as any)?.id ?? null;
              } catch (e) {
                console.warn(`[stripe-webhook] could not resolve latest_charge for ${paymentIntentId}: ${(e as Error).message}`);
              }
            }
            if (periodStart && periodEnd && paidCents > 0) {
              const { error: grantErr } = await supabase.rpc("grant_royal_monthly_benefits", {
                _user_id: userId,
                _stripe_event_id: event.id,
                _stripe_invoice_id: invoice.id,
                _period_start: new Date(periodStart * 1000).toISOString(),
                _period_end: new Date(periodEnd * 1000).toISOString(),
                _paid_amount_cents: paidCents,
                _stripe_payment_intent_id: paymentIntentId,
                _stripe_charge_id: chargeId,
                _stripe_subscription_id: subId,
              });
              if (grantErr) {
                throw grantErr;
              } else {
                console.log(`[stripe-webhook] royal monthly benefits granted user=${userId} paid=${paidCents}`);
              }
            } else {
              console.warn(`[stripe-webhook] invoice.paid skipped — missing period or zero amount (user=${userId})`);
            }
          }
        } catch (e) {
          throw new Error(`invoice.paid processing failed: ${(e as Error).message}`);
        }
      }
    }

    // ------------------------------------------------------------------------
    // charge.refunded — event.data.object IS a Charge.
    // Full refund → reverse the matching Royal grant.
    // ------------------------------------------------------------------------
    if (event.type === "charge.refunded") {
      try {
        const charge = event.data.object as any;
        const refundFraction = Math.min(
          1,
          Math.max(0, Number(charge.amount_refunded ?? 0) / Math.max(1, Number(charge.amount ?? 0))),
        );
        const paymentIntentId = typeof charge.payment_intent === "string"
          ? charge.payment_intent
          : charge.payment_intent?.id ?? null;
        const isFullRefund = Number(charge.amount_refunded ?? 0) >= Number(charge.amount ?? 0);
        if (isFullRefund) {
          const invoiceId = typeof charge.invoice === "string" ? charge.invoice : charge.invoice?.id ?? null;
          const { error } = await supabase.rpc("handle_royal_refund", {
            _stripe_event_id: event.id,
            _reason: "charge.refunded",
            _stripe_invoice_id: invoiceId,
            _stripe_payment_intent_id: paymentIntentId,
            _stripe_charge_id: charge.id,
            _new_status: "reversed",
          });
          if (error) throw error;
          else console.log(`[stripe-webhook] refund processed charge=${charge.id}`);
        }
        if (paymentIntentId && refundFraction > 0) {
          const { error: oneTimeRefundError } = await supabase.rpc("reverse_stripe_one_time_purchase", {
            _stripe_payment_intent_id: paymentIntentId,
            _provider_event_id: event.id,
            _refund_fraction: refundFraction,
            _reason: isFullRefund ? "charge.refunded" : "charge.partially_refunded",
          });
          if (oneTimeRefundError) throw oneTimeRefundError;
        }
      } catch (e) {
        throw new Error(`refund handler failed: ${(e as Error).message}`);
      }
    }

    // ------------------------------------------------------------------------
    // Dispute events — event.data.object IS a Dispute, NOT a Charge.
    //   charge.dispute.created            → suspend grant (status=disputed)
    //   charge.dispute.funds_withdrawn    → reverse grant (status=reversed)
    //   charge.dispute.closed             → won/lost outcome
    //   charge.dispute.funds_reinstated   → restore prior grant
    // ------------------------------------------------------------------------
    if (
      event.type === "charge.dispute.created" ||
      event.type === "charge.dispute.funds_withdrawn" ||
      event.type === "charge.dispute.closed" ||
      event.type === "charge.dispute.funds_reinstated"
    ) {
      try {
        const dispute = event.data.object as any;
        const disputeId: string = dispute.id;
        const chargeId: string | null = typeof dispute.charge === "string"
          ? dispute.charge
          : dispute.charge?.id ?? null;

        // Resolve charge → payment_intent → invoice. Uses latest_charge fallback where needed.
        // (Full resolveInvoicePaymentReferences helper lands in Wave 8.2c; for 8.2a this
        // charge-based path is sufficient because dispute.charge is always populated.)
        let paymentIntentId: string | null = null;
        let invoiceId: string | null = null;
        if (chargeId) {
          try {
            const charge = await stripe.charges.retrieve(chargeId) as any;
            invoiceId = typeof charge.invoice === "string"
              ? charge.invoice
              : (charge.invoice as any)?.id ?? null;
            paymentIntentId = typeof charge.payment_intent === "string"
              ? charge.payment_intent
              : (charge.payment_intent as any)?.id ?? null;
          } catch (e) {
            console.warn(`[stripe-webhook] could not retrieve charge ${chargeId}: ${(e as Error).message}`);
          }
        } else {
          console.warn(`[stripe-webhook] dispute ${disputeId} missing charge id`);
        }

        if (event.type === "charge.dispute.created") {
          const { error } = await supabase.rpc("handle_royal_dispute_created", {
            _stripe_event_id: event.id,
            _stripe_dispute_id: disputeId,
            _dispute_reason: dispute.reason ?? null,
            _stripe_invoice_id: invoiceId,
            _stripe_payment_intent_id: paymentIntentId,
            _stripe_charge_id: chargeId,
          });
          if (error) throw error;
          else console.log(`[stripe-webhook] dispute created dispute=${disputeId}`);
        } else if (event.type === "charge.dispute.funds_withdrawn") {
          const { error } = await supabase.rpc("handle_royal_dispute_funds_withdrawn", {
            _stripe_event_id: event.id,
            _stripe_dispute_id: disputeId,
            _stripe_invoice_id: invoiceId,
            _stripe_payment_intent_id: paymentIntentId,
            _stripe_charge_id: chargeId,
          });
          if (error) throw error;
          else console.log(`[stripe-webhook] dispute funds withdrawn dispute=${disputeId}`);
        } else if (event.type === "charge.dispute.funds_reinstated") {
          const { error } = await supabase.rpc("handle_royal_dispute_reinstated", {
            _stripe_event_id: event.id,
            _stripe_invoice_id: invoiceId,
            _stripe_payment_intent_id: paymentIntentId,
            _stripe_charge_id: chargeId,
            _stripe_dispute_id: disputeId,
          });
          if (error) throw error;
          else console.log(`[stripe-webhook] dispute funds reinstated dispute=${disputeId}`);
        } else if (event.type === "charge.dispute.closed") {
          if (dispute.status === "lost") {
            const { error } = await supabase.rpc("handle_royal_dispute_lost", {
              _stripe_event_id: event.id,
              _stripe_dispute_id: disputeId,
              _reason: `dispute_lost${dispute.reason ? `:${dispute.reason}` : ""}`,
              _stripe_invoice_id: invoiceId,
              _stripe_payment_intent_id: paymentIntentId,
              _stripe_charge_id: chargeId,
            });
            if (error) throw error;
            if (paymentIntentId) {
              const { error: oneTimeDisputeError } = await supabase.rpc("reverse_stripe_one_time_purchase", {
                _stripe_payment_intent_id: paymentIntentId,
                _provider_event_id: event.id,
                _refund_fraction: 1,
                _reason: `dispute_lost${dispute.reason ? `:${dispute.reason}` : ""}`,
              });
              if (oneTimeDisputeError) throw oneTimeDisputeError;
            }
            console.log(`[stripe-webhook] dispute lost dispute=${disputeId}`);
          } else if (dispute.status === "won") {
            const { error } = await supabase.rpc("handle_royal_dispute_won", {
              _stripe_event_id: event.id,
              _stripe_dispute_id: disputeId,
              _stripe_invoice_id: invoiceId,
              _stripe_payment_intent_id: paymentIntentId,
              _stripe_charge_id: chargeId,
            });
            if (error) throw error;
            else console.log(`[stripe-webhook] dispute won dispute=${disputeId}`);
          } else {
            console.log(`[stripe-webhook] dispute closed with status=${dispute.status} — no-op`);
          }
        }
      } catch (e) {
        throw new Error(`dispute handler failed: ${(e as Error).message}`);
      }
    }


    if (
      event.type === "customer.subscription.updated" ||
      event.type === "customer.subscription.deleted" ||
      event.type === "customer.subscription.created"
    ) {
      const sub = event.data.object;
      const kind = sub.metadata?.kind as string | undefined;
      if (kind === "royal_pass") {
        await upsertRoyalPassFromSubscription(sub);
      } else if (kind === "verification") {
        await applyVerificationSubscription(sub);
      }
    }


    if (event.type === "checkout.session.completed") {
      const session = event.data.object;
      const userId = session.metadata?.userId || session.metadata?.user_id;
      if (!userId) throw new Error("missing user_id metadata");

      // Royal Pass subscription checkout
      if (
        session.mode === "subscription" &&
        session.metadata?.kind === "royal_pass" &&
        session.subscription
      ) {
        const subId =
          typeof session.subscription === "string" ? session.subscription : session.subscription.id;
        const sub = await stripe.subscriptions.retrieve(subId);
        await upsertRoyalPassFromSubscription(sub, userId, session.metadata?.plan_id);
        await recordRoyalPassReceipt(session, sub, userId, session.metadata?.plan_id);
        return new Response(JSON.stringify({ ok: true, royal_pass: true }), {
          headers: { "Content-Type": "application/json" },
        });
      }

      // Royal Pass Gift (one-time payment)
      if (
        session.mode === "payment" &&
        session.metadata?.kind === "royal_pass_gift"
      ) {
        const giftId = session.metadata?.gift_id as string | undefined;
        if (!giftId) throw new Error("Royal Pass gift checkout is missing gift_id metadata");
        {
          const paymentIntentId =
            typeof session.payment_intent === "string"
              ? session.payment_intent
              : session.payment_intent?.id ?? null;

          await supabase
            .from("royal_pass_gifts")
            .update({
              status: "paid",
              stripe_payment_intent_id: paymentIntentId,
              amount_usd: (session.amount_total ?? 0) / 100,
              updated_at: new Date().toISOString(),
            })
            .eq("id", giftId)
            .throwOnError();

          const { data: grantRes, error: grantError } = await supabase.rpc(
            "grant_royal_pass_gift_period",
            { _gift_id: giftId },
          );
          if (grantError) throw grantError;
          if (grantRes && typeof grantRes === "object" && "ok" in grantRes && !grantRes.ok) {
            throw new Error(`Royal Pass gift grant rejected: ${JSON.stringify(grantRes)}`);
          }
          console.log(`[stripe-webhook] royal_pass_gift granted`, grantRes);
        }
        return new Response(JSON.stringify({ ok: true, royal_pass_gift: true }), {
          headers: { "Content-Type": "application/json" },
        });
      }

      // Verification subscription checkout
      if (
        session.mode === "subscription" &&
        session.metadata?.kind === "verification" &&
        session.subscription
      ) {
        const subId =
          typeof session.subscription === "string" ? session.subscription : session.subscription.id;
        const sub = await stripe.subscriptions.retrieve(subId);
        await applyVerificationSubscription(sub, userId);
        return new Response(JSON.stringify({ ok: true, verification: true }), {
          headers: { "Content-Type": "application/json" },
        });
      }

      // One-off checkout — Shekel bundle or Boost
      const oneTimePaymentIntentId =
        typeof session.payment_intent === "string"
          ? session.payment_intent
          : session.payment_intent?.id ?? null;
      if (session.mode !== "payment" || !oneTimePaymentIntentId) {
        throw new Error("Unsupported checkout session or missing payment intent");
      }
      let totalShekels = 0;
      let totalUsd = 0;
      let bundleUsd = 0;
      const purchasedBundles: Array<{ label: string; quantity: number; shekels: number }> = [];
      const boostsActivated: string[] = [];
      const unknownLineItems: string[] = [];

      const lineItems = await stripe.checkout.sessions.listLineItems(session.id, {
        limit: 20,
        expand: ["data.price"],
      });
      for (const item of lineItems.data) {
        const lookupKey = await resolveLookupKey(item.price);
        const stripePriceId = item.price?.id;
        const qty = item.quantity || 1;
        const itemUsd = (item.amount_total ?? 0) / 100;
        totalUsd += itemUsd;

        // Try Shekel bundle — match by lookup_key first, then fallback by stripe price ID
        let bundle: any = null;
        if (lookupKey) {
          const r = await supabase
            .from("shekel_bundles")
            .select("shekels, label")
            .eq("stripe_price_id", lookupKey)
            .maybeSingle()
            .throwOnError();
          bundle = r.data;
        }
        if (!bundle && stripePriceId) {
          const r = await supabase
            .from("shekel_bundles")
            .select("shekels, label")
            .eq("stripe_price_id", stripePriceId)
            .maybeSingle()
            .throwOnError();
          bundle = r.data;
        }
        if (bundle) {
          const credit = Number(bundle.shekels) * qty;
          totalShekels += credit;
          bundleUsd += itemUsd;
          purchasedBundles.push({ label: bundle.label, quantity: qty, shekels: credit });
          continue;
        }

        // Try Boost bundle
        let boost: any = null;
        if (lookupKey) {
          const r = await supabase
            .from("boost_bundles")
            .select("boost_type, duration_hours, label")
            .eq("stripe_price_id", lookupKey)
            .maybeSingle()
            .throwOnError();
          boost = r.data;
        }
        if (!boost && stripePriceId) {
          const r = await supabase
            .from("boost_bundles")
            .select("boost_type, duration_hours, label")
            .eq("stripe_price_id", stripePriceId)
            .maybeSingle()
            .throwOnError();
          boost = r.data;
        }
        if (boost) {
          const expires = new Date(Date.now() + boost.duration_hours * 3600_000).toISOString();
          const POST_TARGETED = new Set(["royal_boost", "vote_boost", "crown_spotlight", "crown_shield"]);
          const metaPostId = (session.metadata?.target_post_id as string | undefined) || null;
          let postIdToWrite: string | null = null;
          if (POST_TARGETED.has(boost.boost_type) && metaPostId) {
            const { data: ownerPost } = await supabase
              .from("posts")
              .select("id, user_id, is_removed")
              .eq("id", metaPostId)
              .maybeSingle()
              .throwOnError();
            if (ownerPost && !ownerPost.is_removed && ownerPost.user_id === userId) {
              postIdToWrite = ownerPost.id;
            }
          }
          const providerLineKey = `${lookupKey || stripePriceId || boost.boost_type}:${qty}`;
          const { data: b } = await supabase
            .from("boosts")
            .upsert({
              user_id: userId,
              post_id: postIdToWrite,
              boost_type: boost.boost_type,
              active: true,
              expires_at: expires,
              provider_event_id: session.id,
              provider_line_key: providerLineKey,
            }, { onConflict: "provider_event_id,provider_line_key", ignoreDuplicates: true })
            .select("id")
            .maybeSingle()
            .throwOnError();
          boostsActivated.push(boost.label);
          await supabase.from("shekel_ledger").upsert({
            user_id: userId,
            kind: "boost_stripe",
            shekels_delta: 0,
            usd_amount: itemUsd,
            label: `${boost.label} (${boost.duration_hours}h)`,
            stripe_session_id: session.id,
            stripe_event_id: event.id,
            provider_event_id: `${session.id}:boost:${providerLineKey}`,
            reference_id: b?.id ?? null,
            metadata: {
              lookup_key: lookupKey,
              price_id: stripePriceId,
              boost_type: boost.boost_type,
              stripe_payment_intent_id: oneTimePaymentIntentId,
            },
          }, { onConflict: "kind,provider_event_id", ignoreDuplicates: true }).throwOnError();
          continue;
        }

        unknownLineItems.push(`${lookupKey || "no_lookup"}/${stripePriceId || "no_price"}`);
      }

      if (unknownLineItems.length > 0) {
        throw new Error(`Unrecognized paid checkout line item(s): ${unknownLineItems.join(", ")}`);
      }

      // Credit Shekels to wallet
      if (totalShekels > 0) {
        const { error } = await supabase.rpc("credit_provider_shekels", {
          _user_id: userId,
          _provider: "stripe",
          _provider_event_id: session.id,
          _amount: totalShekels,
          _label: purchasedBundles.map((bundle) => bundle.label).join(" + ") || "Stripe Shekel purchase",
          _metadata: {
            bundles: purchasedBundles,
            stripe_payment_intent_id: oneTimePaymentIntentId,
          },
          _usd_amount: bundleUsd,
          _stripe_event_id: event.id,
        });
        if (error) throw error;
      }

      console.log(
        `[stripe-webhook] event=${event.id} user=${userId} shekels=${totalShekels} boosts=${boostsActivated.length} usd=${totalUsd.toFixed(2)}`,
      );
    }
  } catch (err) {
    console.error(`[stripe-webhook] handler error for ${event.id}:`, err);
    // Roll back the idempotency lock so the event can be re-delivered.
    await supabase.from("stripe_events").delete().eq("id", event.id);
    return jsonError(500, "handler_error", (err as Error).message);
  }

  return new Response(JSON.stringify({ ok: true }), {
    headers: { "Content-Type": "application/json" },
  });
});
