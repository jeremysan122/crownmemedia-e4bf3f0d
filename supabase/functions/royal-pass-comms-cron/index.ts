// Royal Pass retention comms cron.
// Scans royal_pass_subscriptions and enqueues renewal reminders (T-3d),
// trial-ending notices (T-2d), and cancellation confirmations.
// Idempotency keys guarantee at-most-once-per-period delivery.
import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";

const admin = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);

async function constantTimeEquals(a: string, b: string): Promise<boolean> {
  const encoder = new TextEncoder();
  const [ad, bd] = await Promise.all([
    crypto.subtle.digest("SHA-256", encoder.encode(a)),
    crypto.subtle.digest("SHA-256", encoder.encode(b)),
  ]);
  const l = new Uint8Array(ad);
  const r = new Uint8Array(bd);
  let mismatch = l.length ^ r.length;
  for (let i = 0; i < Math.min(l.length, r.length); i += 1) mismatch |= l[i] ^ r[i];
  return mismatch === 0;
}

async function isAuthorizedCronRequest(req: Request): Promise<boolean> {
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  const supplied = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "");
  if (serviceKey && supplied && await constantTimeEquals(serviceKey, supplied)) return true;

  const cronSecret = Deno.env.get("CRON_SHARED_SECRET") ?? "";
  const header = req.headers.get("x-cron-secret") ?? "";
  if (cronSecret && header && await constantTimeEquals(cronSecret, header)) return true;

  return false;
}

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
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (!(await isServiceRoleRequest(req))) {
    return new Response(JSON.stringify({ ok: false, error: "Unauthorized" }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
  try {
    const counts = await run();
    return new Response(JSON.stringify({ ok: true, counts }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("royal-pass-comms-cron error", e);
    return new Response(JSON.stringify({ ok: false, error: String(e) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
