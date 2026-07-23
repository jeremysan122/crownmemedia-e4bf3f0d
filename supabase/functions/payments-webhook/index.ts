// BYOK Stripe webhook
//   Routes via ?env=sandbox or ?env=live
//   Verifies with STRIPE_WEBHOOK_SECRET / STRIPE_TEST_WEBHOOK_SECRET
//   Falls back to STRIPE_CONNECT_WEBHOOK_SECRET for Stripe Connect events
//   Preserves: Shekel crediting, boost activation, Royal Pass subscription state, verification flow
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import {
  type StripeEnv,
  createStripeClient,
  isStripeEnvironmentEnabled,
  verifyConnectWebhook,
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
    // Fail closed: a 2xx response permanently acknowledges a Stripe event.
    // Returning 400 makes an incorrectly configured endpoint visible and
    // retryable instead of silently discarding paid fulfillment.
    return jsonError(400, "invalid_environment", "Expected ?env=sandbox or ?env=live");
  }
  const env: StripeEnv = rawEnv;
  if (!isStripeEnvironmentEnabled(env)) {
    return jsonError(403, "sandbox_disabled", "Sandbox payments are disabled for this deployment");
  }

  let event: { id: string; type: string; account?: string; data: { object: any } };
  const body = await req.text();
  try {
    event = await verifyWebhook(
      new Request(req.url, { method: req.method, headers: req.headers, body }),
      env,
    );
  } catch (err) {
    try {
      event = await verifyConnectWebhook(
        new Request(req.url, { method: req.method, headers: req.headers, body }),
        env,
      );
    } catch (_connectErr) {
      return jsonError(400, "invalid_signature", (err as Error).message);
    }
  }

  // A received event is not considered complete until every entitlement write
  // succeeds. Failed and abandoned claims remain retryable.
  const claimResult = await supabase.rpc("claim_stripe_event", {
    _event_id: event.id,
    _event_type: event.type,
  });
  if (claimResult.error) {
    return jsonError(500, "event_claim_failed", claimResult.error.message);
  }
  const claim = (claimResult.data ?? {}) as {
    claimed?: boolean;
    duplicate?: boolean;
    in_progress?: boolean;
  };
  if (claim.duplicate) {
    console.log(`[stripe-webhook] completed duplicate event ${event.id} — skipping`);
    return new Response(JSON.stringify({ ok: true, duplicate: true }), {
      headers: { "Content-Type": "application/json" },
    });
  }
  if (!claim.claimed || claim.in_progress) {
    return jsonError(409, "event_in_progress", "A delivery of this event is already running");
  }

  async function completeEvent(): Promise<void> {
    const result = await supabase.rpc("complete_stripe_event", { _event_id: event.id });
    if (result.error) throw new Error(`complete Stripe event: ${result.error.message}`);
  }

  async function failEvent(err: unknown): Promise<void> {
    const message = err instanceof Error ? err.message : String(err);
    const result = await supabase.rpc("fail_stripe_event", {
      _event_id: event.id,
      _error: message,
    });
    if (result.error) {
      console.error(`[stripe-webhook] could not mark ${event.id} retryable: ${result.error.message}`);
    }
  }

  async function okResponse(body: Record<string, unknown> = { ok: true }): Promise<Response> {
    await completeEvent();
    return new Response(JSON.stringify(body), {
      headers: { "Content-Type": "application/json" },
    });
  }

  // Idempotency #2 — per checkout session id
  if (event.type === "checkout.session.completed") {
    const sessionId = event.data.object.id as string;
    const { data: existing, error: existingError } = await supabase
      .from("shekel_ledger")
      .select("id")
      .eq("stripe_session_id", sessionId)
      .limit(1)
      .maybeSingle();
    if (existingError) {
      await failEvent(existingError);
      return jsonError(500, "session_check_failed", existingError.message);
    }
    if (existing) {
      console.log(`[stripe-webhook] session ${sessionId} already credited`);
      try {
        return await okResponse({ ok: true, duplicate_session: true });
      } catch (err) {
        await failEvent(err);
        return jsonError(500, "event_completion_failed", (err as Error).message);
      }
    }
  }

  let stripe: ReturnType<typeof createStripeClient>;
  try {
    stripe = createStripeClient(env);
  } catch (err) {
    await failEvent(err);
    return jsonError(500, "stripe_client_failed", (err as Error).message);
  }

  function assertDb(
    context: string,
    result: { error?: { message?: string } | null },
  ): void {
    if (result.error) throw new Error(`${context}: ${result.error.message ?? "database error"}`);
  }

  async function resolveLookupKey(price: any): Promise<string | null> {
    if (!price) return null;
    if (price.lookup_key) return price.lookup_key as string;
    if (price.metadata?.lovable_external_id) return price.metadata.lovable_external_id as string;
    return null;
  }

  async function resolveCheckoutSessionId(paymentIntentId: string | null): Promise<string | null> {
    if (!paymentIntentId) return null;
    try {
      const sessions = await stripe.checkout.sessions.list({
        payment_intent: paymentIntentId,
        limit: 10,
      });
      const session = sessions.data.find((candidate) => candidate.payment_status === "paid")
        ?? sessions.data[0];
      return session?.id ?? null;
    } catch (e) {
      throw new Error(
        `could not resolve checkout session for ${paymentIntentId}: ${(e as Error).message}`,
      );
    }
  }

  async function reverseStorePurchase(
    paymentIntentId: string | null,
    reason: string,
  ): Promise<void> {
    const sessionId = await resolveCheckoutSessionId(paymentIntentId);
    if (!sessionId) {
      console.log(`[stripe-webhook] no checkout session found for store reversal (${reason})`);
      return;
    }
    const { data, error } = await supabase.rpc("handle_store_refund", {
      _stripe_event_id: event.id,
      _stripe_session_id: sessionId,
      _reason: reason,
    });
    if (error) throw new Error(`handle_store_refund failed: ${error.message}`);
    console.log(
      `[stripe-webhook] store reversal session=${sessionId} result=${JSON.stringify(data)}`,
    );
  }

  async function upsertRoyalPassFromSubscription(
    sub: any,
    userIdHint?: string,
    planIdHint?: string,
  ) {
    const userId = userIdHint || sub.metadata?.userId || sub.metadata?.user_id;
    if (!userId) {
      throw new Error(`Royal Pass subscription ${sub.id} missing user_id`);
    }
    const planId = planIdHint || sub.metadata?.plan_id || null;
    const item = sub.items?.data?.[0];
    const periodStart = item?.current_period_start ?? sub.current_period_start;
    const periodEnd = item?.current_period_end ?? sub.current_period_end;

    const existingResult = await supabase
      .from("royal_pass_subscriptions")
      .select("id")
      .eq("user_id", userId)
      .maybeSingle();
    assertDb("read Royal Pass subscription", existingResult);
    const existing = existingResult.data;

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
      assertDb(
        "update Royal Pass subscription",
        await supabase.from("royal_pass_subscriptions").update(row).eq("user_id", userId),
      );
    } else {
      assertDb(
        "insert Royal Pass subscription",
        await supabase.from("royal_pass_subscriptions").insert(row),
      );
    }

    if (sub.status === "active" || sub.status === "trialing") {
      assertDb(
        "grant Royal Pass invite bonus",
        await supabase.rpc("grant_pass_invite_bonus", { _user_id: userId }),
      );
    }
    console.log(`[stripe-webhook] royal_pass user=${userId} status=${sub.status}`);
  }

  async function recordRoyalPassReceipt(session: any, sub: any, userId: string, planId?: string) {
    const existingResult = await supabase
      .from("shekel_ledger")
      .select("id")
      .eq("stripe_session_id", session.id)
      .eq("kind", "royal_pass")
      .maybeSingle();
    assertDb("read Royal Pass receipt", existingResult);
    const existing = existingResult.data;
    if (existing) return;

    let label = "Royal Pass · Subscription";
    if (planId) {
      const planResult = await supabase
        .from("royal_pass_plans")
        .select("name, interval")
        .eq("id", planId)
        .maybeSingle();
      assertDb("read Royal Pass plan", planResult);
      const plan = planResult.data;
      if (plan) label = `${plan.name} (${plan.interval}ly)`;
    }
    const usd = (session.amount_total ?? 0) / 100;

    assertDb("record Royal Pass receipt", await supabase.from("shekel_ledger").insert({
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
    }));
  }

  async function applyVerificationSubscription(sub: any, userIdHint?: string) {
    const userId = userIdHint || sub.metadata?.userId || sub.metadata?.user_id;
    if (!userId) {
      throw new Error(`Verification subscription ${sub.id} missing user_id`);
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
    const existingResult = await supabase
      .from("verification_requests")
      .select("id, status")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    assertDb("read verification request", existingResult);
    const existing = existingResult.data;

    if (existing) {
      // Preserve current status ('pending' | 'priority_review' | 'approved' | 'rejected')
      // Only update billing linkage; never flip to 'approved' from payment alone.
      assertDb("update verification subscription", await supabase
        .from("verification_requests")
        .update({
          subscription_active: isActive,
          subscription_id: sub.id,
          subscription_renews_at: renewsAt,
          updated_at: new Date().toISOString(),
        })
        .eq("id", existing.id));
    } else {
      assertDb("insert verification subscription", await supabase.from("verification_requests").insert({
        user_id: userId,
        plan: "subscription",
        legal_name: "(via subscription — pending user submission)",
        category: "subscription",
        reason: "Paid priority-review slot. Awaiting user documents + admin review.",
        status: "priority_review",
        subscription_active: isActive,
        subscription_id: sub.id,
        subscription_renews_at: renewsAt,
      }));
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
      assertDb("update Stripe Connect account", await supabase
        .from("connect_accounts")
        .update({
          charges_enabled: !!acct.charges_enabled,
          payouts_enabled: !!acct.payouts_enabled,
          details_submitted: !!acct.details_submitted,
          updated_at: new Date().toISOString(),
        })
        .eq("stripe_account_id", acct.id));
      console.log(`[stripe-webhook] account.updated ${acct.id}`);
      return await okResponse();
    }

    if (event.type === "payout.paid" || event.type === "payout.failed" || event.type === "payout.created") {
      const payout = event.data.object;
      const accountId = (event as any).account as string | undefined;
      if (accountId) {
        const status = event.type === "payout.paid" ? "paid"
          : event.type === "payout.failed" ? "failed" : "pending";
        const accountResult = await supabase
          .from("connect_accounts").select("user_id")
          .eq("stripe_account_id", accountId).maybeSingle();
        assertDb("read Stripe Connect payout account", accountResult);
        const ca = accountResult.data;
        if (ca) {
          const payoutResult = await supabase
            .from("payouts").select("id").eq("stripe_payout_id", payout.id).maybeSingle();
          assertDb("read Stripe payout", payoutResult);
          const existing = payoutResult.data;
          if (existing) {
            assertDb(
              "update Stripe payout",
              await supabase.from("payouts").update({ status }).eq("stripe_payout_id", payout.id),
            );
          } else {
            assertDb("insert Stripe payout", await supabase.from("payouts").insert({
              user_id: (ca as any).user_id,
              amount_usd: payout.amount / 100,
              status,
              payout_method: "stripe_connect",
              stripe_payout_id: payout.id,
              stripe_account_id: accountId,
            }));
          }
        }
      }
      return await okResponse();
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
          if (kind === "royal_pass") {
            if (!userId) throw new Error(`Royal Pass invoice ${invoice.id} missing user_id metadata`);
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
                throw new Error(`grant_royal_monthly_benefits failed for ${userId}: ${grantErr.message}`);
              } else {
                console.log(`[stripe-webhook] royal monthly benefits granted user=${userId} paid=${paidCents}`);
              }
            } else if (paidCents <= 0) {
              // Trial and fully discounted invoices intentionally do not mint
              // the paid monthly currency/boost allowance.
              console.log(`[stripe-webhook] invoice.paid has no paid amount — no monthly grant (user=${userId})`);
            } else {
              throw new Error(`invoice.paid missing billing period for Royal Pass user=${userId}`);
            }
          }
        } catch (e) {
          console.error(`[stripe-webhook] invoice.paid processing error: ${(e as Error).message}`);
          throw e;
        }
      }
    }

    // ------------------------------------------------------------------------
    // charge.refunded — event.data.object IS a Charge.
    // Full refund → reverse the matching Store purchase and/or Royal grant.
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
          await reverseStorePurchase(paymentIntentId, "charge.refunded");
          const { error } = await supabase.rpc("handle_royal_refund", {
            _stripe_event_id: event.id,
            _reason: "charge.refunded",
            _stripe_invoice_id: invoiceId,
            _stripe_payment_intent_id: paymentIntentId,
            _stripe_charge_id: charge.id,
            _new_status: "reversed",
          });
          if (error) throw new Error(`handle_royal_refund failed: ${error.message}`);
          else console.log(`[stripe-webhook] refund processed charge=${charge.id}`);
        } else {
          console.log(`[stripe-webhook] partial refund ignored charge=${(event.data.object as any).id}`);
        }
      } catch (e) {
        console.error(`[stripe-webhook] refund handler error: ${(e as Error).message}`);
        // A failed entitlement reversal must remain retryable. Propagate to
        // the outer handler so it removes the stripe_events claim and returns
        // a non-2xx response for Stripe redelivery.
        throw e;
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
            throw new Error(`could not retrieve dispute charge ${chargeId}: ${(e as Error).message}`);
          }
        } else {
          throw new Error(`dispute ${disputeId} missing charge id`);
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
          if (error) throw new Error(`handle_royal_dispute_created failed: ${error.message}`);
          else console.log(`[stripe-webhook] dispute created dispute=${disputeId}`);
        } else if (event.type === "charge.dispute.funds_withdrawn") {
          await reverseStorePurchase(paymentIntentId, "charge.dispute.funds_withdrawn");
          const { error } = await supabase.rpc("handle_royal_dispute_funds_withdrawn", {
            _stripe_event_id: event.id,
            _stripe_dispute_id: disputeId,
            _stripe_invoice_id: invoiceId,
            _stripe_payment_intent_id: paymentIntentId,
            _stripe_charge_id: chargeId,
          });
          if (error) throw new Error(`handle_royal_dispute_funds_withdrawn failed: ${error.message}`);
          else console.log(`[stripe-webhook] dispute funds withdrawn dispute=${disputeId}`);
        } else if (event.type === "charge.dispute.funds_reinstated") {
          const { error } = await supabase.rpc("handle_royal_dispute_reinstated", {
            _stripe_event_id: event.id,
            _stripe_invoice_id: invoiceId,
            _stripe_payment_intent_id: paymentIntentId,
            _stripe_charge_id: chargeId,
            _stripe_dispute_id: disputeId,
          });
          if (error) throw new Error(`handle_royal_dispute_reinstated failed: ${error.message}`);
          else console.log(`[stripe-webhook] dispute funds reinstated dispute=${disputeId}`);
        } else if (event.type === "charge.dispute.closed") {
          if (dispute.status === "lost") {
            await reverseStorePurchase(paymentIntentId, "charge.dispute.closed:lost");
            const { error } = await supabase.rpc("handle_royal_dispute_lost", {
              _stripe_event_id: event.id,
              _stripe_dispute_id: disputeId,
              _reason: `dispute_lost${dispute.reason ? `:${dispute.reason}` : ""}`,
              _stripe_invoice_id: invoiceId,
              _stripe_payment_intent_id: paymentIntentId,
              _stripe_charge_id: chargeId,
            });
            if (error) throw new Error(`handle_royal_dispute_lost failed: ${error.message}`);
            else console.log(`[stripe-webhook] dispute lost dispute=${disputeId}`);
          } else if (dispute.status === "won") {
            const { error } = await supabase.rpc("handle_royal_dispute_won", {
              _stripe_event_id: event.id,
              _stripe_dispute_id: disputeId,
              _stripe_invoice_id: invoiceId,
              _stripe_payment_intent_id: paymentIntentId,
              _stripe_charge_id: chargeId,
            });
            if (error) throw new Error(`handle_royal_dispute_won failed: ${error.message}`);
            else console.log(`[stripe-webhook] dispute won dispute=${disputeId}`);
          } else {
            console.log(`[stripe-webhook] dispute closed with status=${dispute.status} — no-op`);
          }
        }
      } catch (e) {
        console.error(`[stripe-webhook] dispute handler error: ${(e as Error).message}`);
        // Terminal dispute processing changes paid entitlements. Never
        // acknowledge the event when that work failed; release the claim and
        // let Stripe retry through the outer handler.
        throw e;
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
        return await okResponse({ ok: true, royal_pass: true });
      }

      // Royal Pass Gift (one-time payment)
      if (
        session.mode === "payment" &&
        session.metadata?.kind === "royal_pass_gift"
      ) {
        const giftId = session.metadata?.gift_id as string | undefined;
        if (giftId) {
          const paymentIntentId =
            typeof session.payment_intent === "string"
              ? session.payment_intent
              : session.payment_intent?.id ?? null;

          assertDb("mark Royal Pass gift paid", await supabase
            .from("royal_pass_gifts")
            .update({
              status: "paid",
              stripe_payment_intent_id: paymentIntentId,
              amount_usd: (session.amount_total ?? 0) / 100,
              updated_at: new Date().toISOString(),
            })
            .eq("id", giftId));

          const giftGrantResult = await supabase.rpc(
            "grant_royal_pass_gift_period",
            { _gift_id: giftId },
          );
          assertDb("grant Royal Pass gift period", giftGrantResult);
          console.log(`[stripe-webhook] royal_pass_gift granted`, giftGrantResult.data);
        } else {
          throw new Error("Royal Pass gift checkout missing gift_id metadata");
        }
        return await okResponse({ ok: true, royal_pass_gift: true });
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
        return await okResponse({ ok: true, verification: true });
      }

      // One-off checkout — Shekel bundle or Boost
      if (session.mode !== "payment") {
        throw new Error(`Unsupported checkout session kind: ${session.metadata?.kind ?? session.mode}`);
      }
      let totalShekels = 0;
      let totalUsd = 0;
      const labels: string[] = [];
      const resolvedItems: Array<Record<string, unknown>> = [];
      const boostsToActivate: Array<{
        boost_type: string;
        duration_hours: number;
        post_id: string | null;
        label: string;
      }> = [];

      const lineItems = await stripe.checkout.sessions.listLineItems(session.id, {
        limit: 20,
        expand: ["data.price"],
      });
      for (const item of lineItems.data) {
        const lookupKey = await resolveLookupKey(item.price);
        const stripePriceId = item.price?.id;
        const qty = item.quantity || 1;
        if (!Number.isInteger(qty) || qty !== 1) {
          throw new Error(`Unexpected Store line-item quantity: ${qty}`);
        }
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
          assertDb("resolve Shekel bundle lookup key", r);
          bundle = r.data;
        }
        if (!bundle && stripePriceId) {
          const r = await supabase
            .from("shekel_bundles")
            .select("shekels, label")
            .eq("stripe_price_id", stripePriceId)
            .maybeSingle();
          assertDb("resolve Shekel bundle price id", r);
          bundle = r.data;
        }
        if (bundle) {
          const credit = Number(bundle.shekels) * qty;
          if (!Number.isFinite(credit) || credit <= 0) {
            throw new Error(`Invalid Shekel bundle amount for ${lookupKey ?? stripePriceId}`);
          }
          totalShekels += credit;
          labels.push(bundle.label);
          resolvedItems.push({
            kind: "shekel_bundle",
            lookup_key: lookupKey,
            price_id: stripePriceId,
            quantity: qty,
            shekels: credit,
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
          assertDb("resolve Boost bundle lookup key", r);
          boost = r.data;
        }
        if (!boost && stripePriceId) {
          const r = await supabase
            .from("boost_bundles")
            .select("boost_type, duration_hours, label")
            .eq("stripe_price_id", stripePriceId)
            .maybeSingle();
          assertDb("resolve Boost bundle price id", r);
          boost = r.data;
        }
        if (boost) {
          const POST_TARGETED = new Set(["royal_boost", "vote_boost", "crown_spotlight", "crown_shield"]);
          const metaPostId = (session.metadata?.target_post_id as string | undefined) || null;
          if (POST_TARGETED.has(boost.boost_type) && !metaPostId) {
            throw new Error(`Boost ${boost.boost_type} is missing target_post_id metadata`);
          }
          const durationHours = Number(boost.duration_hours);
          if (!Number.isInteger(durationHours) || durationHours < 1 || durationHours > 720) {
            throw new Error(`Invalid duration for Boost ${boost.boost_type}`);
          }
          labels.push(`${boost.label} (${durationHours}h)`);
          boostsToActivate.push({
            boost_type: boost.boost_type,
            duration_hours: durationHours,
            post_id: POST_TARGETED.has(boost.boost_type) ? metaPostId : null,
            label: boost.label,
          });
          resolvedItems.push({
            kind: "boost",
            lookup_key: lookupKey,
            price_id: stripePriceId,
            quantity: qty,
            boost_type: boost.boost_type,
            duration_hours: durationHours,
          });
          continue;
        }

        throw new Error(`Unknown paid line item lookup=${lookupKey} price=${stripePriceId}`);
      }

      const fulfillmentResult = await supabase.rpc("fulfill_store_checkout", {
        _user_id: userId,
        _stripe_session_id: session.id,
        _stripe_event_id: event.id,
        _shekels: totalShekels,
        _usd_amount: totalUsd,
        _label: labels.join(" + ") || "CrownMe Store purchase",
        _boosts: boostsToActivate,
        _metadata: { items: resolvedItems },
      });
      assertDb("fulfill Store checkout", fulfillmentResult);

      console.log(
        `[stripe-webhook] event=${event.id} user=${userId} shekels=${totalShekels} boosts=${boostsToActivate.length} usd=${totalUsd.toFixed(2)}`,
      );
    }
  } catch (err) {
    console.error(`[stripe-webhook] handler error for ${event.id}:`, err);
    // Keep the claim as a failed, retryable attempt. A second delivery can
    // claim it immediately; abandoned attempts age out after five minutes.
    await failEvent(err);
    return jsonError(500, "handler_error", (err as Error).message);
  }

  try {
    return await okResponse();
  } catch (err) {
    await failEvent(err);
    return jsonError(500, "event_completion_failed", (err as Error).message);
  }
});
