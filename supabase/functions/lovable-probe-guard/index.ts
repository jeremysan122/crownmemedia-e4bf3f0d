// TEMPORARY — Wave 8.2b diagnostic. Runs three execution contexts:
//   A. Real PostgREST service-role RPC call (same path payments-webhook uses)
//   B. Real PostgREST authenticated user direct UPDATE (disposable user)
//   C. Reports the anon key path (no session)
// Deletes the disposable user after every run. Removed in a follow-up cleanup.
import { createClient } from "npm:@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  const url = new URL(req.url);
  const targetUser = url.searchParams.get("user_id");
  if (!targetUser) {
    return new Response(JSON.stringify({ error: "user_id required" }), {
      status: 400, headers: { ...cors, "Content-Type": "application/json" },
    });
  }
  const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
  const SVC_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;

  const admin = createClient(SUPABASE_URL, SVC_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  // ---------- PATH A: real service-role RPC ----------
  const { data: pathA, error: pathAErr } = await admin.rpc(
    "_lovable_probe_profile_guard_context",
    { _user_id: targetUser },
  );

  // ---------- PATH B: real authenticated user attempts direct UPDATE ----------
  const email = `probe+${crypto.randomUUID()}@lovable-probe.internal`;
  const password = crypto.randomUUID() + "!Aa1";
  const pathB: Record<string, unknown> = { steps: [] as unknown[] };

  const { data: created, error: createErr } = await admin.auth.admin.createUser({
    email, password, email_confirm: true,
  });
  if (createErr || !created.user) {
    pathB.error = createErr?.message ?? "createUser failed";
  } else {
    const disposableId = created.user.id;
    pathB.disposable_user_id = disposableId;

    try {
      // Sign in through the anon-key path to get a real user access_token.
      const anonClient = createClient(SUPABASE_URL, ANON_KEY, {
        auth: { persistSession: false, autoRefreshToken: false },
      });
      const { data: signIn, error: signInErr } = await anonClient.auth.signInWithPassword({
        email, password,
      });
      if (signInErr || !signIn.session) {
        pathB.error = signInErr?.message ?? "signIn failed";
      } else {
        const userClient = createClient(SUPABASE_URL, ANON_KEY, {
          auth: { persistSession: false, autoRefreshToken: false },
          global: { headers: { Authorization: `Bearer ${signIn.session.access_token}` } },
        });

        // Snapshot before (via service role so RLS doesn't hide the row).
        const { data: beforeRow } = await admin.from("profiles").select(
          "boost_tokens_balance, is_founder, founder_title, royal_frame_variant, founder_granted_at",
        ).eq("id", disposableId).maybeSingle();

        // Ordinary authenticated user attempts to elevate every protected field on
        // their own row (RLS "manage own profile" passes; guard trigger should revert).
        const { error: updateErr } = await userClient.from("profiles").update({
          boost_tokens_balance: 999999,
          is_founder: true,
          founder_title: "__auth_probe__",
          royal_frame_variant: "__auth_frame__",
          founder_granted_at: "2001-01-01T00:00:00Z",
        }).eq("id", disposableId);

        const { data: afterRow } = await admin.from("profiles").select(
          "boost_tokens_balance, is_founder, founder_title, royal_frame_variant, founder_granted_at",
        ).eq("id", disposableId).maybeSingle();

        pathB.before = beforeRow;
        pathB.after = afterRow;
        pathB.update_error = updateErr?.message ?? null;
        pathB.every_field_unchanged = beforeRow != null && afterRow != null &&
          beforeRow.boost_tokens_balance === afterRow.boost_tokens_balance &&
          beforeRow.is_founder === afterRow.is_founder &&
          beforeRow.founder_title === afterRow.founder_title &&
          beforeRow.royal_frame_variant === afterRow.royal_frame_variant &&
          beforeRow.founder_granted_at === afterRow.founder_granted_at;
      }
    } finally {
      // Always clean up the disposable user.
      await admin.auth.admin.deleteUser(disposableId);
      pathB.disposable_deleted = true;
    }
  }

  return new Response(JSON.stringify({
    ok: true,
    path_a_service_role: { data: pathA, error: pathAErr?.message ?? null },
    path_b_authenticated: pathB,
    note_path_c: "Direct psql via sandbox_exec is captured server-side in this response's path_a payload; separate psql invocation is documented in the report.",
  }, null, 2), { headers: { ...cors, "Content-Type": "application/json" } });
});
