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
    // Return 200 so Stripe doesn't retry forever on a misconfigured endpoint.
    return new Response(JSON.stringify({ received: true, ignored: "invalid env" }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
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
    console.log(`[stripe-webhook] duplicate event ${event.id} — skipping`);
    return new Response(JSON.stringify({ ok: true, duplicate: true }), {
      headers: { "Content-Type": "application/json" },
    });
  }

  // Idempotency #2 — per checkout session id
  if (event.type === "checkout.session.completed") {
    const sessionId = event.data.object.id as string;
    const { data: existing } = await supabase
      .from("shekel_ledger")
      .select("id")
      .eq("stripe_session_id", sessionId)
      .limit(1)
      .maybeSingle();
    if (existing) {
      console.log(`[stripe-webhook] session ${sessionId} already credited`);
      return new Response(JSON.stringify({ ok: true, duplicate_session: true }), {
        headers: { "Content-Type": "application/json" },
      });
    }
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
      console.warn(`[stripe-webhook] sub ${sub.id} missing user_id`);
      return;
    }
    const planId = planIdHint || sub.metadata?.plan_id || null;
    const item = sub.items?.data?.[0];
    const periodStart = item?.current_period_start ?? sub.current_period_start;
    const periodEnd = item?.current_period_end ?? sub.current_period_end;

    const { data: existing } = await supabase
      .from("royal_pass_subscriptions")
      .select("id")
      .eq("user_id", userId)
      .maybeSingle();

    const row = {
      user_id: userId,
      plan_id: planId,
      stripe_customer_id:
        typeof sub.customer === "string" ? sub.customer : sub.customer?.id ?? null,
      stripe_subscription_id: sub.id,
      status: sub.status,
      current_period_start: periodStart ? new Date(periodStart * 1000).toISOString() : null,
      current_period_end: periodEnd ? new Date(periodEnd * 1000).toISOString() : null,
      cancel_at_period_end: !!sub.cancel_at_period_end,
      updated_at: new Date().toISOString(),
    };

    if (existing) {
      await supabase.from("royal_pass_subscriptions").update(row).eq("user_id", userId);
    } else {
      await supabase.from("royal_pass_subscriptions").insert(row);
    }

    if (sub.status === "active" || sub.status === "trialing") {
      try {
        await supabase.rpc("grant_pass_invite_bonus", { _user_id: userId });
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
        stripe_customer_id:
          typeof sub.customer === "string" ? sub.customer : sub.customer?.id ?? null,
        stripe_invoice: session.invoice ?? null,
        status: sub.status,
        plan_id: planId ?? null,
      },
    });
  }

  async function applyVerificationSubscription(sub: any, userIdHint?: string) {
    const userId = userIdHint || sub.metadata?.userId || sub.metadata?.user_id;
    if (!userId) {
      console.warn(`[stripe-webhook] verification sub ${sub.id} missing user_id`);
      return;
    }
    const isActive = sub.status === "active" || sub.status === "trialing";
    const item = sub.items?.data?.[0];
    const periodEnd = item?.current_period_end ?? sub.current_period_end;
    const renewsAt = periodEnd ? new Date(periodEnd * 1000).toISOString() : null;

    // IMPORTANT: paid verification is a FAST-TRACK / PRIORITY REVIEW product,
    // NOT auto-approval. Payment never sets profiles.verified = true and never
    // sets verification_requests.status = 'approved'. Admin still reviews the
    // submitted documents. If the user hasn't submitted a request yet, we
    // create a `priority_review` placeholder so the admin queue picks it up.
    const { data: existing } = await supabase
      .from("verification_requests")
      .select("id, status")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (existing) {
      // Preserve current status ('pending' | 'priority_review' | 'approved' | 'rejected')
      // Only update billing linkage; never flip to 'approved' from payment alone.
      await supabase
        .from("verification_requests")
        .update({
          subscription_active: isActive,
          subscription_id: sub.id,
          subscription_renews_at: renewsAt,
          updated_at: new Date().toISOString(),
        })
        .eq("id", existing.id);
    } else {
      await supabase.from("verification_requests").insert({
        user_id: userId,
        plan: "subscription",
        legal_name: "(via subscription — pending user submission)",
        category: "subscription",
        reason: "Paid priority-review slot. Awaiting user documents + admin review.",
        status: "priority_review",
        subscription_active: isActive,
        subscription_id: sub.id,
        subscription_renews_at: renewsAt,
      });
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
        .eq("stripe_account_id", acct.id);
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
          .eq("stripe_account_id", accountId).maybeSingle();
        if (ca) {
          const { data: existing } = await supabase
            .from("payouts").select("id").eq("stripe_payout_id", payout.id).maybeSingle();
          if (existing) {
            await supabase.from("payouts").update({ status }).eq("stripe_payout_id", payout.id);
          } else {
            await supabase.from("payouts").insert({
              user_id: (ca as any).user_id,
              amount_usd: payout.amount / 100,
              status,
              payout_method: "stripe_connect",
              stripe_payout_id: payout.id,
              stripe_account_id: accountId,
            });
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
          const sub = await stripe.subscriptions.retrieve(subId);
          const kind = sub.metadata?.kind as string | undefined;
          const userId = sub.metadata?.userId || sub.metadata?.user_id;
          if (kind === "royal_pass" && userId) {
            const line = invoice.lines?.data?.[0];
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
                console.error(`[stripe-webhook] grant_royal_monthly_benefits failed for ${userId}: ${grantErr.message}`);
              } else {
                console.log(`[stripe-webhook] royal monthly benefits granted user=${userId} paid=${paidCents}`);
              }
            } else {
              console.warn(`[stripe-webhook] invoice.paid skipped — missing period or zero amount (user=${userId})`);
            }
          }
        } catch (e) {
          console.error(`[stripe-webhook] invoice.paid processing error: ${(e as Error).message}`);
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
        const isFullRefund = Number(charge.amount_refunded ?? 0) >= Number(charge.amount ?? 0);
        if (isFullRefund) {
          const invoiceId = typeof charge.invoice === "string" ? charge.invoice : charge.invoice?.id ?? null;
          const paymentIntentId = typeof charge.payment_intent === "string"
            ? charge.payment_intent
            : charge.payment_intent?.id ?? null;
          const { error } = await supabase.rpc("handle_royal_refund", {
            _stripe_event_id: event.id,
            _reason: "charge.refunded",
            _stripe_invoice_id: invoiceId,
            _stripe_payment_intent_id: paymentIntentId,
            _stripe_charge_id: charge.id,
            _new_status: "reversed",
          });
          if (error) console.error(`[stripe-webhook] handle_royal_refund failed: ${error.message}`);
          else console.log(`[stripe-webhook] refund processed charge=${charge.id}`);
        } else {
          console.log(`[stripe-webhook] partial refund ignored charge=${(event.data.object as any).id}`);
        }
      } catch (e) {
        console.error(`[stripe-webhook] refund handler error: ${(e as Error).message}`);
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
        const chargeId: string | null = typeof dispute.charge === "string"
          ? dispute.charge
          : dispute.charge?.id ?? null;
        if (!chargeId) {
          console.warn(`[stripe-webhook] dispute ${dispute.id} missing charge id — no-op`);
        } else {
          // Resolve charge → payment_intent → invoice
          let paymentIntentId: string | null = null;
          let invoiceId: string | null = null;
          try {
            const charge = await stripe.charges.retrieve(chargeId);
            invoiceId = typeof charge.invoice === "string"
              ? charge.invoice
              : (charge.invoice as any)?.id ?? null;
            paymentIntentId = typeof charge.payment_intent === "string"
              ? charge.payment_intent
              : (charge.payment_intent as any)?.id ?? null;
          } catch (e) {
            console.warn(`[stripe-webhook] could not retrieve charge ${chargeId}: ${(e as Error).message}`);
          }

          if (event.type === "charge.dispute.funds_reinstated") {
            const { error } = await supabase.rpc("handle_royal_dispute_reinstated", {
              _stripe_event_id: event.id,
              _stripe_invoice_id: invoiceId,
              _stripe_payment_intent_id: paymentIntentId,
              _stripe_charge_id: chargeId,
            });
            if (error) console.error(`[stripe-webhook] handle_royal_dispute_reinstated failed: ${error.message}`);
            else console.log(`[stripe-webhook] dispute funds reinstated charge=${chargeId}`);
          } else {
            // Choose status by event.
            //   dispute.created                    → 'disputed' (suspend)
            //   dispute.funds_withdrawn            → 'reversed' (permanent)
            //   dispute.closed with status 'lost'  → 'reversed'
            //   dispute.closed with status 'won'   → 'granted' via reinstate
            let newStatus: "disputed" | "reversed" | null = null;
            if (event.type === "charge.dispute.created") newStatus = "disputed";
            else if (event.type === "charge.dispute.funds_withdrawn") newStatus = "reversed";
            else if (event.type === "charge.dispute.closed") {
              if (dispute.status === "lost") newStatus = "reversed";
              else if (dispute.status === "won") {
                const { error } = await supabase.rpc("handle_royal_dispute_reinstated", {
                  _stripe_event_id: event.id,
                  _stripe_invoice_id: invoiceId,
                  _stripe_payment_intent_id: paymentIntentId,
                  _stripe_charge_id: chargeId,
                });
                if (error) console.error(`[stripe-webhook] reinstate (dispute won) failed: ${error.message}`);
                newStatus = null;
              } else {
                newStatus = null; // warning_needs_response / warning_under_review etc — no-op
              }
            }

            if (newStatus) {
              const { error } = await supabase.rpc("handle_royal_refund", {
                _stripe_event_id: event.id,
                _reason: `${event.type}${dispute.reason ? `:${dispute.reason}` : ""}`,
                _stripe_invoice_id: invoiceId,
                _stripe_payment_intent_id: paymentIntentId,
                _stripe_charge_id: chargeId,
                _new_status: newStatus,
              });
              if (error) console.error(`[stripe-webhook] handle_royal_refund (dispute) failed: ${error.message}`);
              else console.log(`[stripe-webhook] dispute ${event.type} → status=${newStatus} charge=${chargeId}`);
            }
          }
        }
      } catch (e) {
        console.error(`[stripe-webhook] dispute handler error: ${(e as Error).message}`);
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
      let totalShekels = 0;
      let totalUsd = 0;
      const boostsActivated: string[] = [];

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
            .maybeSingle();
          bundle = r.data;
        }
        if (!bundle && stripePriceId) {
          const r = await supabase
            .from("shekel_bundles")
            .select("shekels, label")
            .eq("stripe_price_id", stripePriceId)
            .maybeSingle();
          bundle = r.data;
        }
        if (bundle) {
          const credit = Number(bundle.shekels) * qty;
          totalShekels += credit;
          await supabase.from("shekel_ledger").insert({
            user_id: userId,
            kind: "bundle_purchase",
            shekels_delta: credit,
            usd_amount: itemUsd,
            label: bundle.label,
            stripe_session_id: session.id,
            stripe_event_id: event.id,
            metadata: { lookup_key: lookupKey, price_id: stripePriceId, quantity: qty },
          });
          continue;
        }

        // Try Boost bundle
        let boost: any = null;
        if (lookupKey) {
          const r = await supabase
            .from("boost_bundles")
            .select("boost_type, duration_hours, label")
            .eq("stripe_price_id", lookupKey)
            .maybeSingle();
          boost = r.data;
        }
        if (!boost && stripePriceId) {
          const r = await supabase
            .from("boost_bundles")
            .select("boost_type, duration_hours, label")
            .eq("stripe_price_id", stripePriceId)
            .maybeSingle();
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
              .maybeSingle();
            if (ownerPost && !ownerPost.is_removed && ownerPost.user_id === userId) {
              postIdToWrite = ownerPost.id;
            }
          }
          const { data: b } = await supabase
            .from("boosts")
            .insert({
              user_id: userId,
              post_id: postIdToWrite,
              boost_type: boost.boost_type,
              active: true,
              expires_at: expires,
            })
            .select("id")
            .single();
          boostsActivated.push(boost.label);
          await supabase.from("shekel_ledger").insert({
            user_id: userId,
            kind: "boost_stripe",
            shekels_delta: 0,
            usd_amount: itemUsd,
            label: `${boost.label} (${boost.duration_hours}h)`,
            stripe_session_id: session.id,
            stripe_event_id: event.id,
            reference_id: b?.id ?? null,
            metadata: { lookup_key: lookupKey, price_id: stripePriceId, boost_type: boost.boost_type },
          });
          continue;
        }

        console.warn(`[stripe-webhook] unknown line item lookup=${lookupKey} price=${stripePriceId}`);
      }

      // Credit Shekels to wallet
      if (totalShekels > 0) {
        const { data: wallet } = await supabase
          .from("wallets")
          .select("shekel_balance")
          .eq("user_id", userId)
          .maybeSingle();
        if (wallet) {
          await supabase
            .from("wallets")
            .update({
              shekel_balance: Number(wallet.shekel_balance) + totalShekels,
              updated_at: new Date().toISOString(),
            })
            .eq("user_id", userId);
        } else {
          await supabase.from("wallets").insert({ user_id: userId, shekel_balance: totalShekels });
        }
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
