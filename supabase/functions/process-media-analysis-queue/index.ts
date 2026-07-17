import { createClient } from "npm:@supabase/supabase-js@2";
import { authorizeCronRequest, cronResponseHeaders } from "../_shared/cron-auth.ts";

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const admin = createClient(supabaseUrl, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
  auth: { autoRefreshToken: false, persistSession: false },
});

type Job = { post_id: string; user_id: string };
const json = (status: number, body: unknown) => new Response(JSON.stringify(body), {
  status,
  headers: cronResponseHeaders,
});

Deno.serve(async (req) => {
  if (req.method !== "POST") return json(405, { ok: false, error: "method not allowed" });
  const authorization = authorizeCronRequest(req);
  if (!authorization.ok) return json(authorization.status, { ok: false, error: authorization.error });

  const secret = Deno.env.get("CRON_SECRET")!;
  const { data, error } = await admin.rpc("claim_post_media_analysis_jobs", { _limit: 10 });
  if (error) return json(500, { ok: false, error: error.message });

  const results = [];
  for (const job of (data ?? []) as Job[]) {
    try {
      const response = await fetch(`${supabaseUrl}/functions/v1/analyze-post-media`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-crownme-cron-secret": secret,
        },
        body: JSON.stringify({ post_id: job.post_id }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || payload?.ok === false) {
        throw new Error(payload?.error || payload?.status || `analysis HTTP ${response.status}`);
      }
      const { error: completeError } = await admin.rpc("complete_post_media_analysis_job", {
        _post_id: job.post_id,
      });
      if (completeError) throw completeError;
      results.push({ post_id: job.post_id, ok: true });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      await admin.rpc("fail_post_media_analysis_job", { _post_id: job.post_id, _error: message });
      results.push({ post_id: job.post_id, ok: false, error: message });
    }
  }

  return json(results.some((result) => !result.ok) ? 500 : 200, {
    ok: results.every((result) => result.ok),
    claimed: results.length,
    results,
  });
});
