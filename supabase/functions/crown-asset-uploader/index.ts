// Admin-only helper: accepts a JSON payload with { slug, variant, contentType, base64 }
// and writes the file to the achievement-crowns-v2 bucket using the service role.
// Used by the sandbox tooling to batch-upload v2 crown assets without needing 120
// individual storage_upload tool calls per turn.
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const BUCKET = "achievement-crowns-v2";
const ALLOWED_VARIANTS = new Set(["master", "gallery", "wearable", "thumb"]);

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "POST only" }, 405);

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
  const ANON = Deno.env.get("SUPABASE_ANON_KEY")!;
  const SERVICE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

  const authHeader = req.headers.get("Authorization") ?? "";
  if (!authHeader.startsWith("Bearer ")) return json({ error: "Unauthorized" }, 401);

  // Authorize: caller must be admin (service role via user token flow)
  const userClient = createClient(SUPABASE_URL, ANON, {
    global: { headers: { Authorization: authHeader } },
  });
  const token = authHeader.replace("Bearer ", "");
  const { data: claims, error: claimErr } = await userClient.auth.getClaims(token);
  if (claimErr || !claims?.claims?.sub) return json({ error: "Unauthorized" }, 401);

  const admin = createClient(SUPABASE_URL, SERVICE);
  const { data: isAdmin } = await admin.rpc("has_role", { _user_id: claims.claims.sub, _role: "admin" });
  if (!isAdmin) return json({ error: "Forbidden" }, 403);

  let payload: { slug?: string; variant?: string; contentType?: string; base64?: string };
  try {
    payload = await req.json();
  } catch {
    return json({ error: "Invalid JSON" }, 400);
  }

  const { slug, variant, contentType, base64 } = payload;
  if (!slug || !/^crown-\d{3}$/.test(slug)) return json({ error: "Invalid slug" }, 400);
  if (!variant || !ALLOWED_VARIANTS.has(variant)) return json({ error: "Invalid variant" }, 400);
  if (!contentType || !base64) return json({ error: "Missing contentType or base64" }, 400);

  const ext = variant === "master" ? "png" : "webp";
  const path = `${slug}/${variant}.${ext}`;

  const bytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
  const { error: upErr } = await admin.storage.from(BUCKET).upload(path, bytes, {
    contentType,
    upsert: true,
  });
  if (upErr) return json({ error: upErr.message }, 500);

  const publicUrl = `${SUPABASE_URL}/storage/v1/object/public/${BUCKET}/${path}`;
  return json({ ok: true, path, publicUrl });
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
