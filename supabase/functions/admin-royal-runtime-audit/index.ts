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
  const { data: created, error: createErr } = await admin.auth.admin.createUser({
    email,
    password: crypto.randomUUID() + "!Aa1",
    email_confirm: true,
    user_metadata: { synthetic: true, purpose: "royal_runtime_audit" },
  });
  if (createErr || !created?.user) {
    return json(500, { error: "create_test_user_failed", detail: createErr?.message });
  }
  const testUserId = created.user.id;

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
      const replayOk = !!replay && typeof replay === "object" && (replay as { reason?: string }).reason === "already_processed";
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

  // Cleanup: remove test user (cascades grants/allowances/reversals via FKs where set)
  // Explicitly delete rows without ON DELETE CASCADE first for safety.
  await admin.from("royal_pass_reversals").delete().eq("user_id", testUserId);
  await admin.from("royal_pass_shield_allowances").delete().eq("user_id", testUserId);
  await admin.from("royal_pass_grants").delete().eq("user_id", testUserId);
  await admin.from("wallets").delete().eq("user_id", testUserId);
  await admin.from("profiles").delete().eq("id", testUserId);
  await admin.auth.admin.deleteUser(testUserId);

  return json(200, {
    ok: passCount === results.length,
    passed: passCount,
    total: results.length,
    results,
    test_user_id: testUserId,
    ran_at: new Date().toISOString(),
  });
});
