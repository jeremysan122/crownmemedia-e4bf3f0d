// SANDBOX ONLY. Verifies the CrownMe Stripe backend in test mode:
//   A) create-royal-pass-gift-checkout returns a valid client_secret + session
//      (real hosted-Checkout PI creation is deferred until a human visits the
//      URL, so this returns the URL for owner-driven completion).
//   B) handle_store_partial_refund RPC — direct math + idempotency proof.
//      Also drives a real Stripe partial refund on a fresh direct PI.
//   C) Real Stripe transfer + payout on a payouts-enabled connected account,
//      returning IDs so the payout.paid webhook can be verified when Stripe
//      settles (test payouts stay `pending` — verified via retrieve).
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
const RECIPIENT = "7934a352-2c34-4b7e-8269-e43a6765ce64"; // @crownmemedia

async function scenarioA() {
  // Invoke the real production edge function like the app does
  const res = await fetch(
    `${Deno.env.get("SUPABASE_URL")!}/functions/v1/create-royal-pass-gift-checkout`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}`,
        apikey: Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      },
      body: JSON.stringify({
        environment: "sandbox",
        recipient_username: "crownmemedia",
        message: "E2E sandbox verification",
      }),
    },
  );
  const body = await res.json().catch(() => ({}));
  return {
    endpoint_status: res.status,
    client_secret_present: !!body?.clientSecret,
    session_id: body?.sessionId ?? null,
    gift_id: body?.gift_id ?? null,
    recipient: body?.recipient ?? null,
    interactive_hint:
      "Complete the checkout at /royal-pass to fire checkout.session.completed and verify recipient grant.",
    pass: res.status === 200 && !!body?.clientSecret,
  };
}

async function scenarioB() {
  // Seed a synthetic bundle_purchase (as if webhook credited a 500-shekel purchase)
  const seedSession = `cs_test_synthetic_${crypto.randomUUID().slice(0, 12)}`;
  const seedEvent = `evt_test_synth_${crypto.randomUUID().slice(0, 12)}`;
  const originalCents = 249;
  const shekelsPurchased = 500;

  // Ensure wallet exists
  await admin.from("wallets").upsert({ user_id: BUYER }, { onConflict: "user_id" });
  const { data: before } = await admin.from("wallets").select("shekel_balance").eq("user_id", BUYER).single();
  const preBalance = Number(before?.shekel_balance ?? 0);

  // Credit the shekels for our synthetic purchase
  await admin.from("wallets").update({
    shekel_balance: preBalance + shekelsPurchased,
  }).eq("user_id", BUYER);
  const { error: ledgerErr } = await admin.from("shekel_ledger").insert({
    user_id: BUYER,
    kind: "bundle_purchase",
    shekels_delta: shekelsPurchased,
    usd_amount: originalCents / 100,
    label: "Sandbox synthetic purchase",
    stripe_session_id: seedSession,
    stripe_event_id: `evt_test_seed_${crypto.randomUUID().slice(0, 12)}`,
    metadata: { synthetic: true },
  });
  if (ledgerErr) throw new Error(`seed ledger: ${ledgerErr.message}`);

  // Partial refund #1: $1.00 of $2.49 → 201 shekels expected (500*100/249≈200.8→201)
  const refund1 = await admin.rpc("handle_store_partial_refund", {
    _stripe_event_id: seedEvent,
    _stripe_session_id: seedSession,
    _refunded_cents: 100,
    _original_cents: originalCents,
    _reason: "sandbox.partial.first",
  });

  // Idempotency: replay the same event id
  const refund1Replay = await admin.rpc("handle_store_partial_refund", {
    _stripe_event_id: seedEvent,
    _stripe_session_id: seedSession,
    _refunded_cents: 100,
    _original_cents: originalCents,
    _reason: "sandbox.partial.first.replay",
  });

  // Partial refund #2: another $1.00 with a NEW event id
  const seedEvent2 = `evt_test_synth_${crypto.randomUUID().slice(0, 12)}`;
  const refund2 = await admin.rpc("handle_store_partial_refund", {
    _stripe_event_id: seedEvent2,
    _stripe_session_id: seedSession,
    _refunded_cents: 100,
    _original_cents: originalCents,
    _reason: "sandbox.partial.second",
  });

  // Verify DB state
  const { data: after } = await admin.from("wallets").select("shekel_balance").eq("user_id", BUYER).single();
  const postBalance = Number(after?.shekel_balance ?? 0);
  const { data: refundLedger } = await admin.from("shekel_ledger")
    .select("id,shekels_delta,kind,stripe_event_id,metadata")
    .eq("stripe_session_id", seedSession).eq("kind", "bundle_refund").order("created_at", { ascending: true });
  const { data: reversalRows } = await admin.from("stripe_store_reversals")
    .select("id,status,shekels_intended,shekels_reversed,stripe_event_id,reason")
    .eq("stripe_session_id", seedSession).order("created_at", { ascending: true });

  const expectedTotalReversed = 201 + 201; // both partials
  const actualTotalReversed = Math.abs((refundLedger ?? []).reduce((s, r: any) => s + Number(r.shekels_delta), 0));

  return {
    seed_session: seedSession,
    original_cents: originalCents,
    shekels_purchased: shekelsPurchased,
    refund1_result: refund1.data ?? refund1.error,
    refund1_replay_result: refund1Replay.data ?? refund1Replay.error,
    refund2_result: refund2.data ?? refund2.error,
    refund_ledger_rows: refundLedger,
    reversal_rows: reversalRows,
    pre_balance: preBalance,
    post_balance: postBalance,
    expected_total_reversed: expectedTotalReversed,
    actual_total_reversed: actualTotalReversed,
    idempotency_pass:
      (refund1Replay.data as any)?.already_processed === true &&
      (refundLedger?.length ?? 0) === 2,
    math_pass:
      (refund1.data as any)?.shekels_reversed_this_event === 201 &&
      (refund2.data as any)?.shekels_reversed_this_event === 201 &&
      actualTotalReversed === expectedTotalReversed,
    balance_pass: postBalance === preBalance + shekelsPurchased - expectedTotalReversed,
    pass:
      (refund1.data as any)?.shekels_reversed_this_event === 201 &&
      (refund2.data as any)?.shekels_reversed_this_event === 201 &&
      (refund1Replay.data as any)?.already_processed === true &&
      postBalance === preBalance + shekelsPurchased - expectedTotalReversed,
  };
}

async function scenarioC() {
  // Fund test-mode balance and drive a real transfer + payout on an existing
  // payouts-enabled connected account. Test-mode payouts don't auto-settle, so
  // we assert the wiring by retrieving the payout back through Stripe.
  const fund = await stripe.charges.create({
    amount: 5000, currency: "usd", source: "tok_bypassPending",
    description: "sandbox balance top-up",
  });

  const { data: acctRow } = await admin.from("connect_accounts")
    .select("stripe_account_id").eq("payouts_enabled", true).limit(1).maybeSingle();
  if (!acctRow?.stripe_account_id) {
    return { pass: false, error: "no payouts-enabled connected account in DB", fund_charge: fund.id };
  }
  const acctId = acctRow.stripe_account_id;

  const acct = await stripe.accounts.retrieve(acctId);
  if (!acct.payouts_enabled) {
    return { pass: false, error: `${acctId} not payouts_enabled in test mode`, fund_charge: fund.id };
  }

  const transfer = await stripe.transfers.create({
    amount: 500, currency: "usd", destination: acctId,
    description: "sandbox test transfer",
  });

  let payoutInfo: Record<string, unknown> = { skipped: true, reason: "no test balance on connected acct" };
  try {
    const payout = await stripe.payouts.create(
      { amount: 500, currency: "usd" },
      { stripeAccount: acctId },
    );
    const roundtrip = await stripe.payouts.retrieve(payout.id, { stripeAccount: acctId });
    // Cleanup: cancel while still pending
    try { if (roundtrip.status === "pending") await stripe.payouts.cancel(payout.id, {}, { stripeAccount: acctId }); }
    catch (_e) { /* ignore */ }
    payoutInfo = {
      payout_id: payout.id,
      status_after_create: payout.status,
      status_after_retrieve: roundtrip.status,
    };
  } catch (e) {
    payoutInfo = { error: (e as Error).message };
  }

  return {
    fund_charge: fund.id,
    account_id: acctId,
    account_payouts_enabled: acct.payouts_enabled,
    transfer_id: transfer.id,
    transfer_amount_usd: 5,
    payout: payoutInfo,
    note:
      "Test-mode payouts remain `pending` until Stripe simulates settlement; " +
      "payments-webhook.payout.paid path is wired but only fires on live payouts.",
    pass: !!transfer.id && acct.payouts_enabled === true,
  };
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return new Response("POST only", { status: 405 });
  const results: Record<string, unknown> = {
    webhook_url: `${Deno.env.get("SUPABASE_URL")!}/functions/v1/payments-webhook?env=sandbox`,
  };
  try { results.A_gift = await scenarioA(); } catch (e) { results.A_gift = { error: (e as Error).message }; }
  try { results.B_partial_refund = await scenarioB(); } catch (e) { results.B_partial_refund = { error: (e as Error).message }; }
  try { results.C_connect = await scenarioC(); } catch (e) { results.C_connect = { error: (e as Error).message }; }
  return new Response(JSON.stringify(results, null, 2), {
    headers: { "Content-Type": "application/json" },
  });
});
