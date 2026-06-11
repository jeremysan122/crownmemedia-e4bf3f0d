// User-initiated payout request.
// - Requires fully set-up Connect account (charges + payouts + details)
// - Eligibility is computed ONLY from gift_transactions with status='completed'
//   (purchased Shekels and bonuses can never be cashed out)
// - Rejects if ANY non-completed receiver gift_transaction exists for the user
//   (pending/refunded/failed/disputed) — those must resolve first
// - Records the exact batch of gift_transaction IDs consumed, the conversion
//   rate used, and the locked Shekel amount on the `payouts` row so finance
//   admins can audit each request.
// - The actual transfer is finalized by an admin in the Command Center; the
//   stripe-connect-webhook flips the row to 'paid'/'failed' once Stripe reports back.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Conversion rate: 100 Shekels = $1 USD ($0.01 per Shekel).
const SHEKELS_PER_USD = 100;
const USD_PER_SHEKEL = 1 / SHEKELS_PER_USD;
const MIN_PAYOUT_USD = 25;
const MIN_SHEKELS = MIN_PAYOUT_USD * SHEKELS_PER_USD;

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return json(401, { error: "Unauthorized" });
    }

    const userClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } },
    );
    const { data: ud, error: ae } = await userClient.auth.getUser();
    if (ae || !ud?.user) return json(401, { error: "Unauthorized" });
    const userId = ud.user.id;

    let body: { shekels?: number } = {};
    try { body = await req.json(); } catch { /* default below */ }

    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // Eligibility gate: account must be verified, not banned, not suspended.
    // Server-authoritative — never trust the client.
    const { data: prof, error: profErr } = await admin
      .from("profiles")
      .select("verified, is_banned, is_suspended")
      .eq("id", userId)
      .maybeSingle();
    if (profErr || !prof) {
      console.error("[request-payout] profile read failed:", profErr);
      return json(500, { error: "Could not read profile" });
    }
    if (prof.is_banned) {
      return json(403, { error: "banned", message: "Banned accounts cannot request payouts." });
    }
    if (prof.is_suspended) {
      return json(403, { error: "suspended", message: "Your account is suspended. Payouts are paused until this is resolved." });
    }
    if (!prof.verified) {
      // Surface whether a verification request is in flight so the UI can
      // distinguish "verification required" from "under review".
      const { data: vr } = await admin
        .from("verification_requests")
        .select("status")
        .eq("user_id", userId)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      const vstatus = vr?.status ?? null;
      // Audit the blocked attempt so finance/admin can investigate.
      await admin.from("shekel_ledger").insert({
        user_id: userId,
        kind: "payout_blocked",
        shekels_delta: 0,
        usd_amount: 0,
        label: "Payout blocked: not verified",
        metadata: { reason: "not_verified", verification_status: vstatus },
      });
      return json(403, {
        error: "not_verified",
        message:
          vstatus === "pending" || vstatus === "more_info_required"
            ? "Your verification is under review. You can request payouts once it's approved."
            : "You must be verified before receiving payouts.",
        verification_status: vstatus,
      });
    }

    // Connect account must be fully set up
    const { data: ca } = await admin
      .from("connect_accounts")
      .select("stripe_account_id, charges_enabled, payouts_enabled, details_submitted")
      .eq("user_id", userId)
      .maybeSingle();
    if (!ca?.stripe_account_id || !ca.charges_enabled || !ca.payouts_enabled || !ca.details_submitted) {
      return json(400, {
        error: "stripe_not_ready",
        message: "Finish Stripe onboarding before requesting a payout.",
      });
    }

    // Pull ALL gift_transactions for this receiver so we can both (a) sum
    // ONLY completed earnings and (b) detect non-completed rows that block
    // payout until they resolve.
    const { data: allGiftRows, error: gErr } = await admin
      .from("gift_transactions")
      .select("id, status, receiver_earnings_shekels, created_at")
      .eq("receiver_id", userId)
      .order("created_at", { ascending: true });
    if (gErr) {
      console.error("[request-payout] gift_transactions read failed:", gErr);
      return json(500, { error: "Could not read earnings" });
    }
    const rows = allGiftRows ?? [];

    const nonCompleted = rows.filter((r) => r.status !== "completed");
    if (nonCompleted.length > 0) {
      const byStatus: Record<string, number> = {};
      for (const r of nonCompleted) byStatus[r.status] = (byStatus[r.status] ?? 0) + 1;
      return json(409, {
        error: "non_completed_earnings",
        message:
          "Some of your gift earnings are still pending or under review. " +
          "Payout is locked until they resolve.",
        non_completed_count: nonCompleted.length,
        by_status: byStatus,
      });
    }

    const completed = rows.filter((r) => r.status === "completed");
    const earned = completed.reduce(
      (s, r) => s + Number(r.receiver_earnings_shekels ?? 0),
      0,
    );

    // Subtract Shekels already locked by previous pending/paid payout requests.
    const { data: prior } = await admin
      .from("payouts")
      .select("amount_usd, shekels_locked, status")
      .eq("user_id", userId)
      .in("status", ["pending", "paid"]);
    const lockedShekels = (prior ?? []).reduce((s, p) => {
      const locked = Number(p.shekels_locked ?? 0);
      // Back-compat: older rows have shekels_locked = 0 but a real amount_usd.
      return s + (locked > 0 ? locked : Number(p.amount_usd ?? 0) * SHEKELS_PER_USD);
    }, 0);
    const availableShekels = Math.max(0, earned - lockedShekels);

    const requested = Math.floor(Number(body.shekels ?? availableShekels));
    if (!Number.isFinite(requested) || requested <= 0) {
      return json(400, {
        error: "no_balance",
        message: "You have no Shekels available for payout yet.",
        available_shekels: availableShekels,
      });
    }
    if (requested < MIN_SHEKELS) {
      return json(400, {
        error: "below_minimum",
        message: `Minimum payout is $${MIN_PAYOUT_USD} (${MIN_SHEKELS.toLocaleString()} Shekels).`,
        min_shekels: MIN_SHEKELS,
        min_usd: MIN_PAYOUT_USD,
      });
    }
    if (requested > availableShekels) {
      return json(400, {
        error: "insufficient_funds",
        message: "Requested amount exceeds available Shekels.",
        available_shekels: availableShekels,
      });
    }

    // Build the exact eligible batch (oldest first) consumed by this request.
    // We walk completed rows in chronological order, skipping the Shekels that
    // are already locked by earlier payouts, then take rows until we cover
    // `requested`. The final row may be partially consumed — we record that.
    const batch: Array<{ id: string; created_at: string; shekels: number; partial?: boolean }> = [];
    let toSkip = lockedShekels;
    let remaining = requested;
    for (const r of completed) {
      const rowAmount = Number(r.receiver_earnings_shekels ?? 0);
      if (rowAmount <= 0) continue;
      let avail = rowAmount;
      if (toSkip > 0) {
        const skipNow = Math.min(toSkip, avail);
        toSkip -= skipNow;
        avail -= skipNow;
      }
      if (avail <= 0) continue;
      const take = Math.min(avail, remaining);
      batch.push({
        id: r.id,
        created_at: r.created_at,
        shekels: take,
        partial: take < rowAmount ? true : undefined,
      });
      remaining -= take;
      if (remaining <= 0) break;
    }

    const amountUsd = Math.round((requested / SHEKELS_PER_USD) * 100) / 100;

    const { data: payout, error: payErr } = await admin
      .from("payouts")
      .insert({
        user_id: userId,
        amount_usd: amountUsd,
        status: "pending",
        payout_method: "stripe_connect",
        stripe_account_id: ca.stripe_account_id,
        shekels_locked: requested,
        metadata: {
          conversion: {
            shekels_per_usd: SHEKELS_PER_USD,
            usd_per_shekel: USD_PER_SHEKEL,
          },
          eligible_batch: batch,
          batch_size: batch.length,
          totals: {
            earned_shekels: earned,
            locked_before_shekels: lockedShekels,
            available_shekels_before: availableShekels,
            requested_shekels: requested,
          },
        },
      })
      .select("id, amount_usd, status, created_at")
      .single();
    if (payErr || !payout) {
      console.error("[request-payout] insert payout failed:", payErr);
      return json(500, { error: "Could not create payout request" });
    }

    // Audit ledger entry — references the new payout for traceability.
    await admin.from("shekel_ledger").insert({
      user_id: userId,
      kind: "payout_request",
      shekels_delta: 0,
      usd_amount: amountUsd,
      label: `Payout requested · $${amountUsd.toFixed(2)}`,
      reference_id: payout.id,
      metadata: {
        shekels_locked: requested,
        payout_id: payout.id,
        batch_size: batch.length,
        conversion_rate: `${SHEKELS_PER_USD} Shekels = $1`,
      },
    });

    return json(200, {
      ok: true,
      payout,
      amount_usd: amountUsd,
      shekels_locked: requested,
      conversion: { shekels_per_usd: SHEKELS_PER_USD, usd_per_shekel: USD_PER_SHEKEL },
      batch_size: batch.length,
    });
  } catch (err) {
    console.error("[request-payout]", err);
    return json(500, { error: "Could not process payout request" });
  }
});
