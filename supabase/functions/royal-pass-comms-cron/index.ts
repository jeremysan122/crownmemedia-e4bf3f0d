// Royal Pass retention comms cron.
// Scans royal_pass_subscriptions and enqueues renewal reminders (T-3d),
// trial-ending notices (T-2d), and cancellation confirmations.
// Idempotency keys guarantee at-most-once-per-period delivery.
import { createClient } from "npm:@supabase/supabase-js@2";
import { authorizeCronRequest, cronResponseHeaders } from "../_shared/cron-auth.ts";

const admin = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);

type Sub = {
  id: string;
  user_id: string;
  stripe_subscription_id: string | null;
  status: string;
  current_period_end: string | null;
  cancel_at_period_end: boolean;
};

async function getPlanMeta(planId: string | null): Promise<{ usd?: number; interval?: string }> {
  if (!planId) return {};
  const { data } = await admin
    .from("royal_pass_plans")
    .select("usd, interval")
    .eq("id", planId)
    .maybeSingle();
  return { usd: Number(data?.usd) || undefined, interval: (data?.interval as string) || undefined };
}

async function resolveEmail(userId: string): Promise<string | null> {
  const { data, error } = await admin.auth.admin.getUserById(userId);
  if (error || !data?.user?.email) return null;
  return data.user.email;
}

async function enqueue(params: {
  templateName: string;
  recipientEmail: string;
  idempotencyKey: string;
  templateData: Record<string, unknown>;
}) {
  const { error } = await admin.functions.invoke("send-transactional-email", {
    body: {
      templateName: params.templateName,
      recipientEmail: params.recipientEmail,
      idempotencyKey: params.idempotencyKey,
      templateData: params.templateData,
    },
  });
  if (error) console.error("enqueue error", params.templateName, params.idempotencyKey, error);
  return !error;
}

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

async function run() {
  const now = new Date();
  const in2dLo = new Date(now.getTime() + 42 * 3600 * 1000).toISOString();
  const in2dHi = new Date(now.getTime() + 54 * 3600 * 1000).toISOString();
  const in3dLo = new Date(now.getTime() + 66 * 3600 * 1000).toISOString();
  const in3dHi = new Date(now.getTime() + 78 * 3600 * 1000).toISOString();

  const counts = { renewal: 0, trial: 0, cancel: 0, skipped: 0 };

  // ---- Renewal reminders (T-3d, active, not canceling) ----
  const { data: renewals } = await admin
    .from("royal_pass_subscriptions")
    .select("id,user_id,plan_id,stripe_subscription_id,status,current_period_end,cancel_at_period_end")
    .eq("cancel_at_period_end", false)
    .in("status", ["active", "trialing"])
    .gte("current_period_end", in3dLo)
    .lte("current_period_end", in3dHi);
  for (const s of (renewals ?? []) as (Sub & { plan_id: string | null })[]) {
    if (!s.current_period_end) { counts.skipped++; continue; }
    // Skip trialing rows (they get the trial-ending email instead)
    if (s.status === "trialing") continue;
    const email = await resolveEmail(s.user_id);
    if (!email) { counts.skipped++; continue; }
    const meta = await getPlanMeta(s.plan_id);
    const ok = await enqueue({
      templateName: "royal-pass-renewal-reminder",
      recipientEmail: email,
      idempotencyKey: `royal-renewal-${s.id}-${s.current_period_end}`,
      templateData: {
        renews_on: fmtDate(s.current_period_end),
        amount: meta.usd,
        interval: meta.interval,
      },
    });
    if (ok) counts.renewal++;
  }

  // ---- Trial ending (T-2d, trialing) ----
  const { data: trials } = await admin
    .from("royal_pass_subscriptions")
    .select("id,user_id,plan_id,stripe_subscription_id,status,current_period_end,cancel_at_period_end")
    .eq("status", "trialing")
    .gte("current_period_end", in2dLo)
    .lte("current_period_end", in2dHi);
  for (const s of (trials ?? []) as (Sub & { plan_id: string | null })[]) {
    if (!s.current_period_end) { counts.skipped++; continue; }
    const email = await resolveEmail(s.user_id);
    if (!email) { counts.skipped++; continue; }
    const meta = await getPlanMeta(s.plan_id);
    const ok = await enqueue({
      templateName: "royal-pass-trial-ending",
      recipientEmail: email,
      idempotencyKey: `royal-trial-${s.id}-${s.current_period_end}`,
      templateData: {
        charges_on: fmtDate(s.current_period_end),
        amount: meta.usd,
        interval: meta.interval,
      },
    });
    if (ok) counts.trial++;
  }

  // ---- Cancellation confirmations (cancel_at_period_end true, still active) ----
  const { data: cancels } = await admin
    .from("royal_pass_subscriptions")
    .select("id,user_id,plan_id,stripe_subscription_id,status,current_period_end,cancel_at_period_end,updated_at")
    .eq("cancel_at_period_end", true)
    .in("status", ["active", "trialing"])
    // Only recently-updated rows so we don't spam on every run
    .gte("updated_at", new Date(now.getTime() - 24 * 3600 * 1000).toISOString());
  for (const s of (cancels ?? []) as (Sub & { plan_id: string | null })[]) {
    if (!s.current_period_end) { counts.skipped++; continue; }
    const email = await resolveEmail(s.user_id);
    if (!email) { counts.skipped++; continue; }
    const ok = await enqueue({
      templateName: "royal-pass-canceled",
      recipientEmail: email,
      idempotencyKey: `royal-cancel-${s.id}-${s.current_period_end}`,
      templateData: { expires_on: fmtDate(s.current_period_end) },
    });
    if (ok) counts.cancel++;
  }

  return counts;
}

Deno.serve(async (req) => {
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ ok: false, error: "method not allowed" }), {
      status: 405,
      headers: { ...cronResponseHeaders, Allow: "POST" },
    });
  }
  const authorization = authorizeCronRequest(req);
  if (!authorization.ok) {
    return new Response(JSON.stringify({ ok: false, error: authorization.error }), {
      status: authorization.status,
      headers: cronResponseHeaders,
    });
  }
  try {
    const counts = await run();
    return new Response(JSON.stringify({ ok: true, counts }), {
      headers: cronResponseHeaders,
    });
  } catch (e) {
    console.error("royal-pass-comms-cron error", e);
    return new Response(JSON.stringify({ ok: false, error: String(e) }), {
      status: 500,
      headers: cronResponseHeaders,
    });
  }
});
