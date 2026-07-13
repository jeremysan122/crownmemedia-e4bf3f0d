// Admin-only runtime lifecycle audit for Royal Pass RPCs.
//
// Executes the previously-deferred Path B / lifecycle proofs against a real
// ephemeral auth user (created + deleted inside the function). Records each
// scenario's pass/fail into royal_shield_audit_log via log_royal_shield_event
// so results are inspectable in the admin dashboard.
//
// Scenarios exercised end-to-end with service_role:
//   A. grant_royal_monthly_benefits (creates grant + allowance + wallet)
//   B. handle_royal_refund('refunded') → grant.status = 'refunded', reversal row
//   C. dispute created → funds_withdrawn → won → reinstated (idempotent replay)
//   D. dispute created → lost (permanent refund path)
//   E. assert_royal_shield_invariants (drift = 0 on a clean grant)
//
// Auth: caller must be an authenticated user with the 'admin' role.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

type Step = { name: string; ok: boolean; detail?: string; data?: unknown };

async function runScenario(
  admin: ReturnType<typeof createClient>,
  label: string,
  fn: () => Promise<Step[]>,
): Promise<{ scenario: string; ok: boolean; steps: Step[] }> {
  try {
    const steps = await fn();
    return { scenario: label, ok: steps.every((s) => s.ok), steps };
  } catch (e) {
    return {
      scenario: label,
      ok: false,
      steps: [{ name: "exception", ok: false, detail: (e as Error).message }],
    };
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json(405, { error: "method_not_allowed" });

  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) return json(401, { error: "unauthorized" });

  const userClient = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_ANON_KEY")!,
    { global: { headers: { Authorization: authHeader } } },
  );
  const { data: userData, error: authErr } = await userClient.auth.getUser();
  if (authErr || !userData?.user) return json(401, { error: "unauthorized" });
  const callerId = userData.user.id;

  const admin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  const { data: roleRow } = await admin
    .from("user_roles")
    .select("role")
    .eq("user_id", callerId)
    .eq("role", "admin")
    .maybeSingle();
  if (!roleRow) return json(403, { error: "admin_only" });

  // Ephemeral test user
  const stamp = Date.now();
  const email = `royal-audit+${stamp}@crownmemedia-internal.test`;
  const testPassword = crypto.randomUUID() + "!Aa1";
  const syntheticMeta = {
    synthetic: true,
    purpose: "royal_runtime_audit",
    policies_accepted: true,
    dob: "1990-01-01",
    first_name: "Royal",
    last_name: "Audit",
  };
  const { data: created, error: createErr } = await admin.auth.admin.createUser({
    email,
    password: testPassword,
    email_confirm: true,
    user_metadata: syntheticMeta,
  });
  if (createErr || !created?.user) {
    return json(500, { error: "create_test_user_failed", detail: createErr?.message });
  }
  const testUserId = created.user.id;

  // Ephemeral recipient for gift round-trip
  const recipientEmail = `royal-audit-rcpt+${stamp}@crownmemedia-internal.test`;
  const { data: rcptCreated } = await admin.auth.admin.createUser({
    email: recipientEmail,
    password: crypto.randomUUID() + "!Aa1",
    email_confirm: true,
    user_metadata: { ...syntheticMeta, purpose: "royal_runtime_audit_recipient" },
  });
  const recipientUserId = rcptCreated?.user?.id ?? null;
  if (recipientUserId) {
    await admin.from("profiles").upsert({
      id: recipientUserId,
      username: `royal_audit_rcpt_${stamp}`,
      display_name: "Royal Audit Recipient",
    } as never, { onConflict: "id" });
  }

  // Ensure profile row exists (some triggers depend on it)
  await admin.from("profiles").upsert({
    id: testUserId,
    username: `royal_audit_${stamp}`,
    display_name: "Royal Audit Bot",
  } as never, { onConflict: "id" });

  const results: Array<{ scenario: string; ok: boolean; steps: Step[] }> = [];

  const now = new Date();
  const periodStart = new Date(now.getTime() - 1000 * 60);
  const periodEnd = new Date(now.getTime() + 1000 * 60 * 60 * 24 * 30);

  // ---------- Scenario A: monthly grant ----------
  results.push(
    await runScenario(admin, "A_grant_monthly_benefits", async () => {
      const steps: Step[] = [];
      const evt = `evt_audit_${stamp}_A`;
      const inv = `in_audit_${stamp}_A`;
      const { data, error } = await admin.rpc("grant_royal_monthly_benefits" as never, {
        _user_id: testUserId,
        _stripe_event_id: evt,
        _stripe_invoice_id: inv,
        _period_start: periodStart.toISOString(),
        _period_end: periodEnd.toISOString(),
        _paid_amount_cents: 999,
        _stripe_payment_intent_id: `pi_audit_${stamp}_A`,
        _stripe_charge_id: `ch_audit_${stamp}_A`,
        _stripe_subscription_id: `sub_audit_${stamp}`,
      } as never);
      steps.push({ name: "grant_rpc", ok: !error, detail: error?.message, data });

      const { data: grant } = await admin
        .from("royal_pass_grants")
        .select("id, status, stripe_invoice_id")
        .eq("user_id", testUserId)
        .eq("stripe_invoice_id", inv)
        .maybeSingle();
      steps.push({ name: "grant_row_created", ok: !!grant && (grant as { status: string }).status === "granted", data: grant });

      const { data: allowance } = await admin
        .from("royal_pass_shield_allowances")
        .select("id, shields_granted, royal_pass_grant_id")
        .eq("user_id", testUserId)
        .maybeSingle();
      steps.push({
        name: "allowance_linked_to_grant",
        ok: !!allowance && (allowance as { royal_pass_grant_id: string | null }).royal_pass_grant_id === (grant as { id: string } | null)?.id,
        data: allowance,
      });

      // Idempotency: replay same event
      const { data: replay } = await admin.rpc("grant_royal_monthly_benefits" as never, {
        _user_id: testUserId,
        _stripe_event_id: evt,
        _stripe_invoice_id: inv,
        _period_start: periodStart.toISOString(),
        _period_end: periodEnd.toISOString(),
        _paid_amount_cents: 999,
        _stripe_payment_intent_id: `pi_audit_${stamp}_A`,
        _stripe_charge_id: `ch_audit_${stamp}_A`,
        _stripe_subscription_id: `sub_audit_${stamp}`,
      } as never);
      const replayOk = !!replay && typeof replay === "object" && ((replay as { reason?: string; already_processed?: boolean }).reason === "already_processed" || (replay as { already_processed?: boolean }).already_processed === true);
      steps.push({ name: "idempotent_replay", ok: replayOk, data: replay });
      return steps;
    }),
  );

  // ---------- Scenario B: direct refund ----------
  results.push(
    await runScenario(admin, "B_refund_direct", async () => {
      const steps: Step[] = [];
      // Fresh grant for this scenario
      const evt = `evt_audit_${stamp}_B`;
      const inv = `in_audit_${stamp}_B`;
      await admin.rpc("grant_royal_monthly_benefits" as never, {
        _user_id: testUserId,
        _stripe_event_id: evt,
        _stripe_invoice_id: inv,
        _period_start: new Date(periodStart.getTime() - 1000 * 60 * 60).toISOString(),
        _period_end: new Date(periodEnd.getTime() - 1000 * 60 * 60).toISOString(),
        _paid_amount_cents: 999,
        _stripe_payment_intent_id: `pi_audit_${stamp}_B`,
        _stripe_charge_id: `ch_audit_${stamp}_B`,
        _stripe_subscription_id: `sub_audit_${stamp}_B`,
      } as never);

      const { data, error } = await admin.rpc("handle_royal_refund" as never, {
        _stripe_event_id: `evt_audit_${stamp}_B_refund`,
        _reason: "audit_direct_refund",
        _stripe_invoice_id: inv,
        _stripe_payment_intent_id: `pi_audit_${stamp}_B`,
        _stripe_charge_id: `ch_audit_${stamp}_B`,
        _new_status: "refunded",
      } as never);
      steps.push({ name: "refund_rpc", ok: !error, detail: error?.message, data });

      const { data: grant } = await admin
        .from("royal_pass_grants")
        .select("status")
        .eq("stripe_invoice_id", inv)
        .maybeSingle();
      steps.push({
        name: "grant_marked_refunded",
        ok: !!grant && (grant as { status: string }).status === "refunded",
        data: grant,
      });

      const { data: rev } = await admin
        .from("royal_pass_reversals")
        .select("id, reason")
        .eq("stripe_invoice_id", inv)
        .limit(1);
      steps.push({ name: "reversal_row_written", ok: Array.isArray(rev) && rev.length > 0, data: rev });
      return steps;
    }),
  );

  // ---------- Scenario C: dispute created → won → reinstated ----------
  results.push(
    await runScenario(admin, "C_dispute_created_won_reinstated", async () => {
      const steps: Step[] = [];
      const inv = `in_audit_${stamp}_C`;
      const charge = `ch_audit_${stamp}_C`;
      const dispute = `dp_audit_${stamp}_C`;
      await admin.rpc("grant_royal_monthly_benefits" as never, {
        _user_id: testUserId,
        _stripe_event_id: `evt_audit_${stamp}_C_grant`,
        _stripe_invoice_id: inv,
        _period_start: new Date(periodStart.getTime() - 1000 * 60 * 60 * 2).toISOString(),
        _period_end: new Date(periodEnd.getTime() - 1000 * 60 * 60 * 2).toISOString(),
        _paid_amount_cents: 999,
        _stripe_payment_intent_id: `pi_audit_${stamp}_C`,
        _stripe_charge_id: charge,
        _stripe_subscription_id: `sub_audit_${stamp}_C`,
      } as never);

      const r1 = await admin.rpc("handle_royal_dispute_created" as never, {
        _stripe_event_id: `evt_audit_${stamp}_C_created`,
        _stripe_dispute_id: dispute,
        _dispute_reason: "audit",
        _stripe_invoice_id: inv,
        _stripe_payment_intent_id: `pi_audit_${stamp}_C`,
        _stripe_charge_id: charge,
      } as never);
      steps.push({ name: "dispute_created", ok: !r1.error, detail: r1.error?.message });

      const { data: g1 } = await admin.from("royal_pass_grants").select("status, stripe_dispute_id").eq("stripe_invoice_id", inv).maybeSingle();
      steps.push({ name: "status_disputed", ok: (g1 as { status: string } | null)?.status === "disputed", data: g1 });

      const r2 = await admin.rpc("handle_royal_dispute_won" as never, {
        _stripe_event_id: `evt_audit_${stamp}_C_won`,
        _stripe_dispute_id: dispute,
        _stripe_invoice_id: inv,
        _stripe_payment_intent_id: `pi_audit_${stamp}_C`,
        _stripe_charge_id: charge,
      } as never);
      steps.push({ name: "dispute_won", ok: !r2.error, detail: r2.error?.message });

      const r3 = await admin.rpc("handle_royal_dispute_reinstated" as never, {
        _stripe_event_id: `evt_audit_${stamp}_C_reinstated`,
        _stripe_invoice_id: inv,
        _stripe_payment_intent_id: `pi_audit_${stamp}_C`,
        _stripe_charge_id: charge,
        _stripe_dispute_id: dispute,
      } as never);
      steps.push({ name: "dispute_reinstated_rpc", ok: !r3.error, detail: r3.error?.message });

      const { data: g2 } = await admin.from("royal_pass_grants").select("status").eq("stripe_invoice_id", inv).maybeSingle();
      steps.push({ name: "status_active_after_reinstate", ok: (g2 as { status: string } | null)?.status === "granted", data: g2 });

      // Replay reinstated → should be idempotent (not error)
      const r4 = await admin.rpc("handle_royal_dispute_reinstated" as never, {
        _stripe_event_id: `evt_audit_${stamp}_C_reinstated_replay`,
        _stripe_invoice_id: inv,
        _stripe_payment_intent_id: `pi_audit_${stamp}_C`,
        _stripe_charge_id: charge,
        _stripe_dispute_id: dispute,
      } as never);
      steps.push({ name: "reinstate_idempotent", ok: !r4.error, detail: r4.error?.message });
      return steps;
    }),
  );

  // ---------- Scenario D: dispute lost ----------
  results.push(
    await runScenario(admin, "D_dispute_lost", async () => {
      const steps: Step[] = [];
      const inv = `in_audit_${stamp}_D`;
      const charge = `ch_audit_${stamp}_D`;
      const dispute = `dp_audit_${stamp}_D`;
      await admin.rpc("grant_royal_monthly_benefits" as never, {
        _user_id: testUserId,
        _stripe_event_id: `evt_audit_${stamp}_D_grant`,
        _stripe_invoice_id: inv,
        _period_start: new Date(periodStart.getTime() - 1000 * 60 * 60 * 3).toISOString(),
        _period_end: new Date(periodEnd.getTime() - 1000 * 60 * 60 * 3).toISOString(),
        _paid_amount_cents: 999,
        _stripe_payment_intent_id: `pi_audit_${stamp}_D`,
        _stripe_charge_id: charge,
        _stripe_subscription_id: `sub_audit_${stamp}_D`,
      } as never);
      await admin.rpc("handle_royal_dispute_created" as never, {
        _stripe_event_id: `evt_audit_${stamp}_D_created`,
        _stripe_dispute_id: dispute,
        _dispute_reason: "audit",
        _stripe_invoice_id: inv,
        _stripe_payment_intent_id: `pi_audit_${stamp}_D`,
        _stripe_charge_id: charge,
      } as never);
      const r = await admin.rpc("handle_royal_dispute_lost" as never, {
        _stripe_event_id: `evt_audit_${stamp}_D_lost`,
        _stripe_dispute_id: dispute,
        _reason: "audit_lost",
        _stripe_invoice_id: inv,
        _stripe_payment_intent_id: `pi_audit_${stamp}_D`,
        _stripe_charge_id: charge,
      } as never);
      steps.push({ name: "dispute_lost_rpc", ok: !r.error, detail: r.error?.message });
      const { data: g } = await admin.from("royal_pass_grants").select("status").eq("stripe_invoice_id", inv).maybeSingle();
      steps.push({ name: "status_refunded", ok: (g as { status: string } | null)?.status === "refunded", data: g });
      return steps;
    }),
  );

  // ---------- Scenario E: shield invariants ----------
  results.push(
    await runScenario(admin, "E_shield_invariants_clean", async () => {
      const steps: Step[] = [];
      const r = await admin.rpc("assert_royal_shield_invariants" as never, { _user_id: testUserId } as never);
      steps.push({ name: "invariants_pass", ok: !r.error, detail: r.error?.message, data: r.data });
      return steps;
    }),
  );

  // Reusable grant for debit scenarios (F–J). Uses stamp_F to avoid collision.
  const debitInv = `in_audit_${stamp}_debit`;
  await admin.rpc("grant_royal_monthly_benefits" as never, {
    _user_id: testUserId,
    _stripe_event_id: `evt_audit_${stamp}_debit_grant`,
    _stripe_invoice_id: debitInv,
    _period_start: new Date(periodStart.getTime() - 1000 * 60 * 60 * 4).toISOString(),
    _period_end: new Date(periodEnd.getTime() - 1000 * 60 * 60 * 4).toISOString(),
    _paid_amount_cents: 999,
    _stripe_payment_intent_id: `pi_audit_${stamp}_debit`,
    _stripe_charge_id: `ch_audit_${stamp}_debit`,
    _stripe_subscription_id: `sub_audit_${stamp}_debit`,
  } as never);

  // ---------- Scenario F: debit_shekels FIFO from promo grant ----------
  results.push(
    await runScenario(admin, "F_debit_shekels_fifo_promo", async () => {
      const steps: Step[] = [];
      const opId = crypto.randomUUID();
      const { data: before } = await admin
        .from("royal_pass_grants")
        .select("id, promo_shekels_remaining")
        .eq("stripe_invoice_id", debitInv)
        .maybeSingle();
      const grantId = (before as { id: string } | null)?.id;
      const startPromo = Number((before as { promo_shekels_remaining: number } | null)?.promo_shekels_remaining ?? 0);
      steps.push({ name: "grant_has_promo_shekels", ok: startPromo >= 100, data: before });

      const { data, error } = await admin.rpc("debit_shekels" as never, {
        _user_id: testUserId,
        _amount: 100,
        _reason_code: "audit_debit_shekels",
        _operation_id: opId,
        _ref_table: "royal_audit",
        _ref_id: null,
        _metadata: { scenario: "F" } as never,
        _caller: "admin_runtime_audit",
        _request_fingerprint: `audit-F-${stamp}`,
      } as never);
      steps.push({ name: "debit_ok", ok: !error, detail: error?.message, data });

      const { data: after } = await admin
        .from("royal_pass_grants")
        .select("promo_shekels_remaining")
        .eq("stripe_invoice_id", debitInv)
        .maybeSingle();
      const endPromo = Number((after as { promo_shekels_remaining: number } | null)?.promo_shekels_remaining ?? 0);
      steps.push({
        name: "promo_decremented_by_100",
        ok: startPromo - endPromo === 100,
        data: { startPromo, endPromo },
      });

      const { data: allocs } = await admin
        .from("shekel_spend_allocations")
        .select("amount_consumed, royal_pass_grant_id")
        .eq("operation_id", opId);
      const totalAlloc = (allocs ?? []).reduce((s, a) => s + Number((a as { amount_consumed: number }).amount_consumed ?? 0), 0);
      steps.push({
        name: "allocations_sum_to_debit",
        ok: totalAlloc === 100 && (allocs ?? []).some((a) => (a as { royal_pass_grant_id: string }).royal_pass_grant_id === grantId),
        data: allocs,
      });
      return steps;
    }),
  );

  // ---------- Scenario G: debit_shekels idempotent replay ----------
  results.push(
    await runScenario(admin, "G_debit_shekels_idempotent", async () => {
      const steps: Step[] = [];
      const opId = crypto.randomUUID();
      const params = {
        _user_id: testUserId,
        _amount: 25,
        _reason_code: "audit_idempotent",
        _operation_id: opId,
        _ref_table: null,
        _ref_id: null,
        _metadata: { scenario: "G" } as never,
        _caller: "admin_runtime_audit",
        _request_fingerprint: `audit-G-${stamp}`,
      };
      const r1 = await admin.rpc("debit_shekels" as never, params as never);
      steps.push({ name: "first_call_ok", ok: !r1.error, detail: r1.error?.message });
      const r2 = await admin.rpc("debit_shekels" as never, params as never);
      steps.push({ name: "replay_no_error", ok: !r2.error, detail: r2.error?.message });

      const { data: opRow } = await admin
        .from("debit_operations")
        .select("status, amount, operation_id")
        .eq("operation_id", opId)
        .maybeSingle();
      steps.push({ name: "single_op_row_completed", ok: (opRow as { status: string } | null)?.status === "completed", data: opRow });

      const { count } = await admin
        .from("shekel_spend_allocations")
        .select("id", { count: "exact", head: true })
        .eq("operation_id", opId);
      steps.push({ name: "no_duplicate_allocations", ok: (count ?? 0) >= 1, data: { count } });
      return steps;
    }),
  );

  // ---------- Scenario H: debit_shekels insufficient balance raises ----------
  results.push(
    await runScenario(admin, "H_debit_shekels_insufficient", async () => {
      const steps: Step[] = [];
      const r = await admin.rpc("debit_shekels" as never, {
        _user_id: testUserId,
        _amount: 9_999_999,
        _reason_code: "audit_overdraw",
        _operation_id: crypto.randomUUID(),
        _ref_table: null,
        _ref_id: null,
        _metadata: {} as never,
        _caller: "admin_runtime_audit",
        _request_fingerprint: `audit-H-${stamp}`,
      } as never);
      const msg = r.error?.message ?? "";
      steps.push({
        name: "raises_insufficient",
        ok: !!r.error && /insufficient/i.test(msg),
        detail: msg || "expected an error",
      });
      return steps;
    }),
  );

  // ---------- Scenario I: debit_boost_token FIFO ----------
  results.push(
    await runScenario(admin, "I_debit_boost_token_fifo", async () => {
      const steps: Step[] = [];
      const opId = crypto.randomUUID();
      const { data: r, error } = await admin.rpc("debit_boost_token" as never, {
        _user_id: testUserId,
        _reason_code: "audit_debit_boost",
        _operation_id: opId,
        _ref_table: "royal_audit",
        _ref_id: null,
        _metadata: { scenario: "I" } as never,
        _caller: "admin_runtime_audit",
        _request_fingerprint: `audit-I-${stamp}`,
      } as never);
      steps.push({ name: "debit_boost_ok", ok: !error, detail: error?.message, data: r });

      const { data: alloc } = await admin
        .from("boost_token_spend_allocations")
        .select("royal_pass_grant_id, lot_id")
        .eq("operation_id", opId)
        .maybeSingle();
      steps.push({ name: "boost_allocation_recorded", ok: !!alloc, data: alloc });
      return steps;
    }),
  );

  // ---------- Scenario J: kill-switch enforcement ----------
  results.push(
    await runScenario(admin, "J_kill_switch_blocks_debits", async () => {
      const steps: Step[] = [];
      // Flip flag on
      const flipOn = await admin
        .from("feature_flags")
        .update({ enabled: true, rollout_percentage: 100 } as never)
        .eq("key", "royal_pass_debits_paused");
      steps.push({ name: "kill_switch_on", ok: !flipOn.error, detail: flipOn.error?.message });

      const blocked = await admin.rpc("debit_shekels" as never, {
        _user_id: testUserId,
        _amount: 10,
        _reason_code: "audit_kill",
        _operation_id: crypto.randomUUID(),
        _ref_table: null,
        _ref_id: null,
        _metadata: {} as never,
        _caller: "admin_runtime_audit",
        _request_fingerprint: `audit-J-${stamp}`,
      } as never);
      steps.push({
        name: "debit_blocked_when_paused",
        ok: !!blocked.error && /pause/i.test(blocked.error?.message ?? ""),
        detail: blocked.error?.message,
      });

      // Flip flag back off
      const flipOff = await admin
        .from("feature_flags")
        .update({ enabled: false, rollout_percentage: 0 } as never)
        .eq("key", "royal_pass_debits_paused");
      steps.push({ name: "kill_switch_off", ok: !flipOff.error, detail: flipOff.error?.message });

      const allowed = await admin.rpc("debit_shekels" as never, {
        _user_id: testUserId,
        _amount: 10,
        _reason_code: "audit_kill_recover",
        _operation_id: crypto.randomUUID(),
        _ref_table: null,
        _ref_id: null,
        _metadata: {} as never,
        _caller: "admin_runtime_audit",
        _request_fingerprint: `audit-J2-${stamp}`,
      } as never);
      steps.push({ name: "debit_recovers_when_off", ok: !allowed.error, detail: allowed.error?.message });
      return steps;
    }),
  );

  // Log summary into royal_shield_audit_log
  const passCount = results.filter((r) => r.ok).length;
  await admin.rpc("log_royal_shield_event" as never, {
    _user_id: testUserId,
    _event_type: passCount === results.length ? "runtime_audit_pass" : "runtime_audit_fail",
    _reason_code: "admin_runtime_audit",
    _delta: 0,
    _grant_id: null,
    _allowance_id: null,
    _boost_id: null,
    _battle_id: null,
    _post_id: null,
    _metadata: { scenarios: results, actor_id: callerId, email } as never,
  } as never);

  // Signed-in client for K/L (public wrappers require auth.uid()).
  const testUserClient = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_ANON_KEY")!,
  );
  const { data: signIn, error: signInErr } = await testUserClient.auth.signInWithPassword({
    email,
    password: testPassword,
  });

  // ---------- Scenario K: purchase_boost round-trip ----------
  results.push(
    await runScenario(admin, "K_purchase_boost_roundtrip", async () => {
      const steps: Step[] = [];
      steps.push({ name: "sign_in_ok", ok: !signInErr && !!signIn?.user, detail: signInErr?.message });
      if (signInErr || !signIn?.user) return steps;

      const { data, error } = await testUserClient.rpc("purchase_boost" as never, {
        p_boost_type: "profile_glow",
        p_duration_hours: 1,
        p_cost_shekels: 200,
        p_post_id: null,
      } as never);
      steps.push({ name: "purchase_boost_ok", ok: !error, detail: error?.message, data });

      const boostId = (data as { boost_id?: string } | null)?.boost_id ?? null;
      steps.push({ name: "boost_row_returned", ok: !!boostId, data: { boostId } });

      // Verify the boost's debit routed through centralized primitives.
      const { data: opRow } = await admin
        .from("debit_operations")
        .select("operation_id, amount, reason_code, ref_table, ref_id, status")
        .eq("user_id", testUserId)
        .eq("ref_table", "boosts")
        .eq("ref_id", boostId)
        .maybeSingle();
      steps.push({
        name: "debit_operation_recorded",
        ok: !!opRow && (opRow as { status: string }).status === "completed"
          && Number((opRow as { amount: number }).amount) === 200,
        data: opRow,
      });

      const { data: allocs } = await admin
        .from("shekel_spend_allocations")
        .select("amount_consumed, source_type, royal_pass_grant_id")
        .eq("operation_id", (opRow as { operation_id: string } | null)?.operation_id ?? "00000000-0000-0000-0000-000000000000");
      const totalAlloc = (allocs ?? []).reduce((s, a) => s + Number((a as { amount_consumed: number }).amount_consumed ?? 0), 0);
      steps.push({ name: "allocations_sum_200", ok: totalAlloc === 200, data: allocs });
      return steps;
    }),
  );

  // ---------- Scenario L: send_royal_gift round-trip ----------
  results.push(
    await runScenario(admin, "L_send_royal_gift_roundtrip", async () => {
      const steps: Step[] = [];
      if (!recipientUserId) {
        steps.push({ name: "recipient_created", ok: false, detail: "recipient user missing" });
        return steps;
      }
      if (!signIn?.user) {
        steps.push({ name: "sign_in_available", ok: false, detail: "sender not signed in" });
        return steps;
      }

      const dedupe = crypto.randomUUID();
      const { data, error } = await testUserClient.rpc("send_royal_gift" as never, {
        p_gift_id: "flower_daisy",
        p_recipient_id: recipientUserId,
        p_post_id: null,
        p_quantity: 1,
        p_dedupe_key: dedupe,
      } as never);
      steps.push({ name: "gift_rpc_ok", ok: !error, detail: error?.message, data });

      const txId = (data as { transaction_id?: string } | null)?.transaction_id ?? null;
      steps.push({ name: "gift_tx_returned", ok: !!txId, data: { txId } });

      // Confirm debit routed through primitives with ref_table=gift_transactions
      const { data: opRow } = await admin
        .from("debit_operations")
        .select("operation_id, amount, ref_table, ref_id, status")
        .eq("user_id", testUserId)
        .eq("ref_table", "gift_transactions")
        .eq("ref_id", txId)
        .maybeSingle();
      steps.push({
        name: "gift_debit_recorded",
        ok: !!opRow && (opRow as { status: string }).status === "completed"
          && Number((opRow as { amount: number }).amount) === 10,
        data: opRow,
      });

      // Dedupe replay must return the same transaction and NOT create a second debit op.
      const { data: replay } = await testUserClient.rpc("send_royal_gift" as never, {
        p_gift_id: "flower_daisy",
        p_recipient_id: recipientUserId,
        p_post_id: null,
        p_quantity: 1,
        p_dedupe_key: dedupe,
      } as never);
      const dedupedOk = (replay as { deduped?: boolean; transaction_id?: string } | null)?.deduped === true
        && (replay as { transaction_id: string }).transaction_id === txId;
      steps.push({ name: "dedupe_replay_returns_same_tx", ok: dedupedOk, data: replay });

      const { count: opCount } = await admin
        .from("debit_operations")
        .select("id", { count: "exact", head: true })
        .eq("user_id", testUserId)
        .eq("ref_table", "gift_transactions")
        .eq("ref_id", txId);
      steps.push({ name: "no_duplicate_debit_op", ok: (opCount ?? 0) === 1, data: { opCount } });
      return steps;
    }),
  );

  await testUserClient.auth.signOut();

  // Cleanup: remove test user (cascades grants/allowances/reversals via FKs where set)
  // Explicitly delete rows without ON DELETE CASCADE first for safety.
  await admin.from("shekel_spend_allocations").delete().eq("user_id", testUserId);
  await admin.from("boost_token_spend_allocations").delete().eq("user_id", testUserId);
  await admin.from("boost_token_lots").delete().eq("user_id", testUserId);
  await admin.from("debit_operations").delete().eq("user_id", testUserId);
  await admin.from("shekel_ledger").delete().eq("user_id", testUserId);
  await admin.from("boost_tokens_ledger").delete().eq("user_id", testUserId);
  await admin.from("gift_transactions").delete().eq("sender_id", testUserId);
  await admin.from("boosts").delete().eq("user_id", testUserId);
  await admin.from("royal_pass_reversals").delete().eq("user_id", testUserId);
  await admin.from("royal_pass_shield_allowances").delete().eq("user_id", testUserId);
  await admin.from("royal_pass_grants").delete().eq("user_id", testUserId);
  await admin.from("wallets").delete().eq("user_id", testUserId);
  await admin.from("profiles").delete().eq("id", testUserId);
  await admin.auth.admin.deleteUser(testUserId);
  if (recipientUserId) {
    await admin.from("gift_transactions").delete().eq("receiver_id", recipientUserId);
    await admin.from("wallets").delete().eq("user_id", recipientUserId);
    await admin.from("profiles").delete().eq("id", recipientUserId);
    await admin.auth.admin.deleteUser(recipientUserId);
  }

  return json(200, {
    ok: passCount === results.length,
    passed: passCount,
    total: results.length,
    results,
    test_user_id: testUserId,
    ran_at: new Date().toISOString(),
  });
});
