// Achievements batch processor: runs the idempotent Wave 2 pipeline.
// - Admins (via has_role) may invoke on demand from the UI.
// - Cron / service-role callers use the SERVICE_ROLE bearer.
import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
  const ANON = Deno.env.get("SUPABASE_ANON_KEY")!;
  const SERVICE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

  try {
    const authHeader = req.headers.get("Authorization") ?? "";
    const isServiceRole = authHeader === `Bearer ${SERVICE}`;

    let batchSize = 500;
    let timeLimit = 500;
    if (req.method === "POST") {
      try {
        const body = await req.json();
        if (typeof body?.batch_size === "number") batchSize = Math.min(2000, Math.max(1, body.batch_size));
        if (typeof body?.time_limit === "number") timeLimit = Math.min(2000, Math.max(0, body.time_limit));
      } catch { /* empty body ok */ }
    }

    // Authorize: admin OR service role
    if (!isServiceRole) {
      if (!authHeader.startsWith("Bearer ")) {
        return json({ error: "Unauthorized" }, 401);
      }
      const userClient = createClient(SUPABASE_URL, ANON, {
        global: { headers: { Authorization: authHeader } },
      });
      const token = authHeader.replace("Bearer ", "");
      const { data: claims, error: claimErr } = await userClient.auth.getClaims(token);
      if (claimErr || !claims?.claims?.sub) return json({ error: "Unauthorized" }, 401);

      const admin = createClient(SUPABASE_URL, SERVICE);
      const { data: isAdmin } = await admin.rpc("has_role", {
        _user_id: claims.claims.sub,
        _role: "admin",
      });
      if (!isAdmin) return json({ error: "Forbidden" }, 403);
    }

    const admin = createClient(SUPABASE_URL, SERVICE);
    const { data, error } = await admin.rpc("run_achievement_pipeline", {
      _batch_size: batchSize,
      _time_limit: timeLimit,
    });
    if (error) {
      console.error("run_achievement_pipeline failed", error);
      return json({ error: error.message }, 500);
    }
    return json({ ok: true, result: data });
  } catch (e) {
    console.error("achievements-process-batch fatal", e);
    return json({ error: String(e?.message ?? e) }, 500);
  }
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
