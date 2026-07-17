// EPHEMERAL QA FUNCTION — do not commit, do not leave deployed.
// Purpose: one-shot sandbox-only remediation to (1) add the 5 missing
// dispute/refund events to the direct payments-webhook sandbox endpoint,
// (2) replay the already-created signed sandbox charge.refunded event
// against the payments-webhook handler with an authentic HMAC signature
// computed from PAYMENTS_SANDBOX_WEBHOOK_SECRET, and (3) verify ledger,
// reversal, wallet, replay idempotency, and terminal-session idempotency.
// Callable only with header X-QA-Token matching QA_STRIPE_SYNC_TOKEN.
// Sandbox-only. Never touches live Stripe.
import { encode } from "https://deno.land/std@0.168.0/encoding/hex.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import { createStripeClient } from "../_shared/stripe.ts";

const REQUIRED_NEW_EVENTS = [
  "charge.refunded",
  "charge.dispute.created",
  "charge.dispute.funds_withdrawn",
  "charge.dispute.funds_reinstated",
  "charge.dispute.closed",
];

const ENDPOINT_SUFFIX = "qUZsnh";
const EVENT_SUFFIX = "BWHT";
const SESSION_SUFFIX = "uQ31";
const USER_ID = "06415869-792a-47fa-8af4-a563b2c02c82";

function log(report: any, key: string, value: any) {
  report[key] = value;
}

async function signStripe(body: string, secret: string): Promise<string> {
  const ts = Math.floor(Date.now() / 1000).toString();
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signed = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(`${ts}.${body}`),
  );
  const hex = new TextDecoder().decode(encode(new Uint8Array(signed)));
  return `t=${ts},v1=${hex}`;
}

function redact(id: string | null | undefined): string {
  if (!id) return "(null)";
  if (id.length <= 12) return id;
  return `${id.slice(0, 8)}…${id.slice(-6)}`;
}

Deno.serve(async (req) => {
  const report: any = { steps: [] };
  try {
    const qaToken = Deno.env.get("QA_STRIPE_SYNC_TOKEN");
    if (!qaToken || req.headers.get("x-qa-token") !== qaToken) {
      return new Response(JSON.stringify({ error: "unauthorized" }), { status: 401 });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );
    const stripe = createStripeClient("sandbox");
    const webhookSecret = Deno.env.get("PAYMENTS_SANDBOX_WEBHOOK_SECRET")!;
    const payloadTargetUrl = `${Deno.env.get("SUPABASE_URL")}/functions/v1/payments-webhook?env=sandbox`;

    // ---------- Step 1: locate + update webhook endpoint ----------
    const endpoints = await stripe.webhookEndpoints.list({ limit: 100 });
    const target = endpoints.data.find((e) => e.id.endsWith(ENDPOINT_SUFFIX));
    if (!target) throw new Error(`endpoint ending ${ENDPOINT_SUFFIX} not found`);

    const beforeEvents = [...target.enabled_events];
    const merged = Array.from(new Set([...beforeEvents, ...REQUIRED_NEW_EVENTS])).sort();
    let updated = target;
    if (!REQUIRED_NEW_EVENTS.every((e) => beforeEvents.includes(e))) {
      updated = await stripe.webhookEndpoints.update(target.id, { enabled_events: merged });
    }
    log(report, "step1_endpoint_sync", {
      endpoint_id: redact(target.id),
      url_matches: target.url.includes("/functions/v1/payments-webhook") && target.url.includes("env=sandbox"),
      before_count: beforeEvents.length,
      after_count: updated.enabled_events.length,
      added: REQUIRED_NEW_EVENTS.filter((e) => !beforeEvents.includes(e)),
      preserved_all_before: beforeEvents.every((e) => updated.enabled_events.includes(e)),
      all_five_present: REQUIRED_NEW_EVENTS.every((e) => updated.enabled_events.includes(e)),
    });

    // ---------- Step 2: find & redeliver evt_...BWHT ----------
    const eventsList = await stripe.events.list({ type: "charge.refunded", limit: 50 });
    const evt = eventsList.data.find((e) => e.id.endsWith(EVENT_SUFFIX));
    if (!evt) throw new Error(`event ending ${EVENT_SUFFIX} not found`);
    const payload = JSON.stringify(evt);

    async function postSigned(label: string) {
      const sig = await signStripe(payload, webhookSecret);
      const r = await fetch(payloadTargetUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json", "stripe-signature": sig },
        body: payload,
      });
      const text = await r.text();
      return { label, status: r.status, body: text.slice(0, 400) };
    }

    const firstDelivery = await postSigned("first_delivery");
    log(report, "step2_first_delivery", { event_id: redact(evt.id), ...firstDelivery });

    // brief wait for async db writes
    await new Promise((r) => setTimeout(r, 800));

    // ---------- Step 3: verify ledger / reversal / wallet ----------
    const { data: ledgerRows } = await supabase
      .from("shekel_ledger")
      .select("id, kind, shekels_delta, stripe_event_id, stripe_session_id, created_at")
      .eq("stripe_session_id", `%${SESSION_SUFFIX}`.replace("%", ""))
      .ilike("stripe_session_id", `%${SESSION_SUFFIX}`)
      .order("created_at", { ascending: false });

    const refundLedger = (ledgerRows ?? []).filter((r) => r.kind === "bundle_refund");
    const { data: reversalRows } = await supabase
      .from("stripe_store_reversals")
      .select("*")
      .ilike("stripe_session_id", `%${SESSION_SUFFIX}`);
    const { data: wallet } = await supabase
      .from("wallets")
      .select("shekel_balance")
      .eq("user_id", USER_ID)
      .single();

    log(report, "step3_verify_reversal", {
      bundle_refund_rows: refundLedger.length,
      refund_delta_sum: refundLedger.reduce((s, r) => s + Number(r.shekels_delta), 0),
      stripe_store_reversals_rows: reversalRows?.length ?? 0,
      wallet_balance_after: wallet?.shekel_balance,
      wallet_expected: 172250,
      wallet_pass: wallet?.shekel_balance === 172250,
      reversal_row_status: reversalRows?.[0]?.status,
      reversal_stripe_event_id: redact(reversalRows?.[0]?.stripe_event_id),
    });

    // ---------- Step 4: replay same event id (idempotency) ----------
    const replay = await postSigned("replay_same_event_id");
    await new Promise((r) => setTimeout(r, 800));
    const { data: ledgerRows2 } = await supabase
      .from("shekel_ledger")
      .select("id, kind")
      .ilike("stripe_session_id", `%${SESSION_SUFFIX}`)
      .eq("kind", "bundle_refund");
    const { data: reversalRows2 } = await supabase
      .from("stripe_store_reversals")
      .select("id")
      .ilike("stripe_session_id", `%${SESSION_SUFFIX}`);
    const { data: wallet2 } = await supabase
      .from("wallets")
      .select("shekel_balance")
      .eq("user_id", USER_ID)
      .single();
    log(report, "step4_replay_idempotency", {
      replay_http: replay.status,
      bundle_refund_rows_after_replay: ledgerRows2?.length ?? 0,
      reversal_rows_after_replay: reversalRows2?.length ?? 0,
      wallet_after_replay: wallet2?.shekel_balance,
      no_second_debit: (ledgerRows2?.length ?? 0) === 1 && (reversalRows2?.length ?? 0) === 1 && wallet2?.shekel_balance === 172250,
    });

    // ---------- Step 5: terminal session idempotency via handle_store_refund ----------
    const qaEventId = `evt_qa_${crypto.randomUUID().replace(/-/g, "").slice(0, 20)}`;
    const fullSessionId = (refundLedger[0] ?? ledgerRows?.[0])?.stripe_session_id
      ?? "cs_test_a18J2YkHsSUum3fVvv4mvs0M0PEt6fwXZztZqIpsSDuNN6FJIYD0KDuQ31";
    const { data: rpcRes, error: rpcErr } = await supabase.rpc("handle_store_refund", {
      _stripe_event_id: qaEventId,
      _stripe_session_id: fullSessionId,
      _reason: "qa_terminal_idempotency_check",
    });
    await new Promise((r) => setTimeout(r, 400));
    const { data: ledgerRows3 } = await supabase
      .from("shekel_ledger")
      .select("id, stripe_event_id, kind")
      .ilike("stripe_session_id", `%${SESSION_SUFFIX}`)
      .eq("kind", "bundle_refund");
    const { data: reversalRows3 } = await supabase
      .from("stripe_store_reversals")
      .select("id, stripe_event_id")
      .ilike("stripe_session_id", `%${SESSION_SUFFIX}`);
    const { data: wallet3 } = await supabase
      .from("wallets")
      .select("shekel_balance")
      .eq("user_id", USER_ID)
      .single();
    log(report, "step5_terminal_idempotency", {
      qa_event_id: redact(qaEventId),
      rpc_result: rpcRes,
      rpc_error: rpcErr?.message,
      bundle_refund_rows_after_rpc: ledgerRows3?.length ?? 0,
      reversal_rows_after_rpc: reversalRows3?.length ?? 0,
      wallet_after_rpc: wallet3?.shekel_balance,
      qa_event_id_absent_from_ledger: !(ledgerRows3 ?? []).some((r) => r.stripe_event_id === qaEventId),
      qa_event_id_absent_from_reversals: !(reversalRows3 ?? []).some((r) => r.stripe_event_id === qaEventId),
      terminal_pass: (ledgerRows3?.length ?? 0) === 1 && (reversalRows3?.length ?? 0) === 1 && wallet3?.shekel_balance === 172250,
    });

    return new Response(JSON.stringify(report, null, 2), {
      headers: { "Content-Type": "application/json" },
    });
  } catch (e) {
    report.error = (e as Error).message;
    return new Response(JSON.stringify(report, null, 2), { status: 500 });
  }
});
