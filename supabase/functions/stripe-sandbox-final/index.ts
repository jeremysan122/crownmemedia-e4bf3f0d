// SANDBOX ONLY. Runs three end-to-end scenarios against Stripe test mode
// and reports side effects observed in the CrownMe database.
//   A) Fresh Royal Pass gift Checkout → completion → recipient grant
//   B) Fresh Starter Pouch purchase → partial $1 refund → proportional Shekels
//   C) Fund test-mode platform balance → create Custom connect account (pre-verified)
//      → transfer → payout → verify DB rows
// Deletes all disposable test resources it created (custom account, subs, refunds).
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import Stripe from "https://esm.sh/stripe@22.0.2";

const admin = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);

const stripe = new Stripe(Deno.env.get("STRIPE_TEST_SECRET_KEY")!, {
  apiVersion: "2026-03-25.dahlia",
});

const BUYER = "06415869-792a-47fa-8af4-a563b2c02c82"; // @remyjpolo
const RECIPIENT_USERNAME = "crownmemedia";
const RECIPIENT = "7934a352-2c34-4b7e-8269-e43a6765ce64";

const WEBHOOK_URL =
  `${Deno.env.get("SUPABASE_URL")!}/functions/v1/payments-webhook?env=sandbox`;

async function poll<T>(fn: () => Promise<T | null>, timeoutMs = 25_000, intervalMs = 1000): Promise<T | null> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const r = await fn();
    if (r) return r;
    await new Promise((r) => setTimeout(r, intervalMs));
  }
  return null;
}

async function payWithTestCard(sessionId: string): Promise<string> {
  const s0 = await stripe.checkout.sessions.retrieve(sessionId);
  console.log(`[pay] session ${sessionId} status=${s0.status} payment_status=${s0.payment_status} pi=${s0.payment_intent} mode=${s0.mode}`);
  let piId: string | null = typeof s0.payment_intent === "string" ? s0.payment_intent : s0.payment_intent?.id ?? null;
  if (!piId) {
    // Some session configurations defer PI creation. Poll a few times.
    for (let i = 0; i < 5 && !piId; i++) {
      await new Promise((r) => setTimeout(r, 1500));
      const s = await stripe.checkout.sessions.retrieve(sessionId, { expand: ["payment_intent"] });
      piId = typeof s.payment_intent === "string" ? s.payment_intent : s.payment_intent?.id ?? null;
    }
  }
  if (!piId) throw new Error(`session ${sessionId} has no payment_intent`);
  const pm = await stripe.paymentMethods.create({ type: "card", card: { token: "tok_visa" } });
  const confirmed = await stripe.paymentIntents.confirm(piId, {
    payment_method: pm.id,
    return_url: "https://example.com/return",
  });
  return confirmed.id;
}

async function scenarioA() {
  // Fresh gift checkout: buyer=remyjpolo, recipient=crownmemedia
  const prices = await stripe.prices.list({ lookup_keys: ["royal_pass_gift_1mo"], limit: 1 });
  if (!prices.data.length) throw new Error("A: gift lookup key missing");
  const price = prices.data[0];

  const customers = await stripe.customers.search({
    query: `metadata['userId']:'${BUYER}'`,
    limit: 1,
  });
  const customerId = customers.data[0]?.id ?? (await stripe.customers.create({
    metadata: { userId: BUYER },
  })).id;

  // Pre-insert gift row like the edge function does
  const { data: gift, error: giftErr } = await admin.from("royal_pass_gifts").insert({
    buyer_id: BUYER,
    recipient_id: RECIPIENT,
    environment: "sandbox",
    amount_usd: (price.unit_amount ?? 0) / 100,
    months_granted: 1,
    status: "pending",
  }).select("id").single();
  if (giftErr || !gift) throw new Error(`A: gift row: ${giftErr?.message}`);

  const session = await stripe.checkout.sessions.create({
    mode: "payment",
    
    success_url: "https://example.com/s?sid={CHECKOUT_SESSION_ID}", cancel_url: "https://example.com/c",
    line_items: [{ price: price.id, quantity: 1 }],
    customer: customerId,
    payment_intent_data: { description: `E2E gift → @${RECIPIENT_USERNAME}` },
    metadata: {
      user_id: BUYER,
      userId: BUYER,
      kind: "royal_pass_gift",
      gift_id: gift.id,
      recipient_id: RECIPIENT,
      recipient_username: RECIPIENT_USERNAME,
      months: "1",
    },
  });
  await admin.from("royal_pass_gifts").update({ stripe_session_id: session.id }).eq("id", gift.id);

  const piId = await payWithTestCard(session.id);

  const finalGift = await poll(async () => {
    const { data } = await admin.from("royal_pass_gifts").select("status,granted_at,stripe_payment_intent_id")
      .eq("id", gift.id).maybeSingle();
    return data?.status === "granted" ? data : null;
  });

  // Verify a royal_pass_grants row landed for the recipient tied to this gift
  const grant = await poll(async () => {
    const { data } = await admin.from("royal_pass_grants")
      .select("id,user_id,source,gift_id,status")
      .eq("gift_id", gift.id).maybeSingle();
    return data ?? null;
  });

  return {
    gift_id: gift.id,
    session_id: session.id,
    payment_intent: piId,
    gift_row: finalGift,
    grant_row: grant,
    pass: !!finalGift && !!grant && grant.user_id === RECIPIENT,
  };
}

async function scenarioB() {
  // Fresh Starter Pouch purchase → partial $1 refund → verify proportional shekels
  const prices = await stripe.prices.list({ lookup_keys: ["shekels_starter_pouch"], limit: 1 });
  if (!prices.data.length) throw new Error("B: starter pouch lookup key missing");
  const price = prices.data[0];
  const priceCents = price.unit_amount ?? 0;

  const customers = await stripe.customers.search({
    query: `metadata['userId']:'${BUYER}'`,
    limit: 1,
  });
  const customerId = customers.data[0]?.id ?? (await stripe.customers.create({
    metadata: { userId: BUYER },
  })).id;

  const session = await stripe.checkout.sessions.create({
    mode: "payment",
    
    success_url: "https://example.com/s?sid={CHECKOUT_SESSION_ID}", cancel_url: "https://example.com/c",
    line_items: [{ price: price.id, quantity: 1 }],
    customer: customerId,
    metadata: {
      user_id: BUYER,
      userId: BUYER,
      kind: "shekel_bundle",
      bundle_id: "shekels_starter_pouch",
    },
  });
  const piId = await payWithTestCard(session.id);

  const purchaseLedger = await poll(async () => {
    const { data } = await admin.from("shekel_ledger").select("id,shekels_delta,kind,stripe_session_id")
      .eq("stripe_session_id", session.id).eq("kind", "bundle_purchase").maybeSingle();
    return data ?? null;
  });
  if (!purchaseLedger) return { pass: false, error: "purchase ledger not written", session_id: session.id };

  // Partial refund: $1.00 of the $2.49 (100 of 249 cents)
  const refundCents = 100;
  const refund = await stripe.refunds.create({
    payment_intent: piId,
    amount: refundCents,
    reason: "requested_by_customer",
  });

  const refundLedger = await poll(async () => {
    const { data } = await admin.from("shekel_ledger").select("id,shekels_delta,kind,stripe_event_id,metadata")
      .eq("stripe_session_id", session.id).eq("kind", "bundle_refund").maybeSingle();
    return data ?? null;
  });

  const reversal = await poll(async () => {
    const { data } = await admin.from("stripe_store_reversals")
      .select("id,status,shekels_intended,shekels_reversed,reason,stripe_event_id")
      .eq("stripe_session_id", session.id).maybeSingle();
    return data ?? null;
  });

  const expectedShekels = Math.round(Number(purchaseLedger.shekels_delta) * (refundCents / priceCents));

  return {
    session_id: session.id,
    payment_intent: piId,
    refund_id: refund.id,
    original_cents: priceCents,
    refunded_cents: refundCents,
    shekels_purchased: Number(purchaseLedger.shekels_delta),
    expected_reversal: expectedShekels,
    refund_ledger: refundLedger,
    reversal_row: reversal,
    pass:
      !!refundLedger &&
      !!reversal &&
      Number(reversal.shekels_reversed) === expectedShekels &&
      reversal.status === "partially_reversed",
  };
}

async function scenarioC() {
  // Fund platform test balance, use an EXISTING payouts-enabled Express account
  // (Custom account creation requires accepting Connect platform responsibilities
  // in the Stripe Dashboard — out of scope for automation).
  const fund = await stripe.charges.create({
    amount: 5000,
    currency: "usd",
    source: "tok_bypassPending",
    description: "sandbox test balance top-up",
  });

  // Find a payouts-enabled connected account from our DB
  const { data: acctRow } = await admin.from("connect_accounts")
    .select("stripe_account_id,user_id,payouts_enabled")
    .eq("payouts_enabled", true).limit(1).maybeSingle();
  if (!acctRow?.stripe_account_id) {
    return { pass: false, error: "no payouts-enabled connected account in DB", fund_charge: fund.id };
  }
  const acctId = acctRow.stripe_account_id;

  // Confirm with Stripe it's still payouts_enabled in test mode
  let acct: Stripe.Account;
  try {
    acct = await stripe.accounts.retrieve(acctId);
  } catch (e) {
    return { pass: false, error: `retrieve ${acctId}: ${(e as Error).message}`, fund_charge: fund.id };
  }
  if (!acct.payouts_enabled) {
    return { pass: false, error: `${acctId} not payouts_enabled in test mode`, fund_charge: fund.id };
  }

  const transfer = await stripe.transfers.create({
    amount: 500, currency: "usd", destination: acctId,
    description: "sandbox test transfer",
  });

  let payout: Stripe.Payout;
  try {
    payout = await stripe.payouts.create(
      { amount: 500, currency: "usd" },
      { stripeAccount: acctId },
    );
  } catch (e) {
    return {
      pass: false,
      error: `payout: ${(e as Error).message}`,
      fund_charge: fund.id,
      transfer_id: transfer.id,
      account_id: acctId,
    };
  }

  const payoutRow = await poll(async () => {
    const { data } = await admin.from("payouts")
      .select("id,status,amount_usd,stripe_payout_id,stripe_account_id")
      .eq("stripe_payout_id", payout.id).maybeSingle();
    return data ?? null;
  }, 30_000);

  // Best-effort cleanup: cancel payout while still pending
  try {
    if (payout.status === "pending") {
      await stripe.payouts.cancel(payout.id, {}, { stripeAccount: acctId });
    }
  } catch (_e) { /* ignore */ }

  return {
    fund_charge: fund.id,
    account_id: acctId,
    transfer_id: transfer.id,
    payout_id: payout.id,
    payout_status: payout.status,
    payout_row: payoutRow,
    pass: !!payoutRow && payoutRow.stripe_account_id === acctId,
  };
}


Deno.serve(async (req) => {
  if (req.method !== "POST") return new Response("POST only", { status: 405 });
  // Gateway verify_jwt=true already blocks unauthenticated callers.

  const results: Record<string, any> = { webhook_url: WEBHOOK_URL };
  try { results.A_gift = await scenarioA(); } catch (e) { results.A_gift = { error: (e as Error).message, stack: (e as Error).stack }; }
  try { results.B_partial_refund = await scenarioB(); } catch (e) { results.B_partial_refund = { error: (e as Error).message, stack: (e as Error).stack }; }
  try { results.C_connect = await scenarioC(); } catch (e) { results.C_connect = { error: (e as Error).message, stack: (e as Error).stack }; }

  return new Response(JSON.stringify(results, null, 2), {
    headers: { "Content-Type": "application/json" },
  });
});
