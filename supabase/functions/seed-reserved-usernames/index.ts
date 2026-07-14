// Admin-only seed loader for the 15,000-row reserved usernames dataset.
// Idempotent: upserts by primary key `username`.
//
// Auth: requires the caller to have the `admin` role. Uses the caller's JWT
// to check role, then uses the service role client for bulk upserts.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;

type Row = {
  username: string;
  category: string;
  reserved_reason: string;
  reservation_policy: string;
  source_label: string;
  priority: number;
  is_active: boolean;
  requires_identity_verification: boolean;
};

// Minimal CSV parser: handles quoted fields with embedded commas and doubled quotes.
function parseCsv(text: string): Row[] {
  const rows: Row[] = [];
  const lines: string[][] = [];
  let field = "";
  let row: string[] = [];
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; } else { inQuotes = false; }
      } else field += c;
    } else {
      if (c === '"') inQuotes = true;
      else if (c === ",") { row.push(field); field = ""; }
      else if (c === "\n") { row.push(field); lines.push(row); row = []; field = ""; }
      else if (c === "\r") { /* skip */ }
      else field += c;
    }
  }
  if (field.length > 0 || row.length > 0) { row.push(field); lines.push(row); }
  const header = lines.shift();
  if (!header) return rows;
  const idx = Object.fromEntries(header.map((h, i) => [h.trim(), i]));
  for (const r of lines) {
    if (!r || r.length < header.length) continue;
    rows.push({
      username: r[idx.username],
      category: r[idx.category],
      reserved_reason: r[idx.reserved_reason],
      reservation_policy: r[idx.reservation_policy],
      source_label: r[idx.source_label],
      priority: Number(r[idx.priority]) || 50,
      is_active: /true/i.test(r[idx.is_active] || "true"),
      requires_identity_verification: /true/i.test(r[idx.requires_identity_verification] || "false"),
    });
  }
  return rows;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization") ?? "";
    if (!authHeader) {
      return json({ error: "missing_auth" }, 401);
    }

    // Verify admin via the caller's JWT
    const userClient = createClient(SUPABASE_URL, ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userRes, error: userErr } = await userClient.auth.getUser();
    if (userErr || !userRes.user) return json({ error: "not_authenticated" }, 401);

    const admin = createClient(SUPABASE_URL, SERVICE_ROLE);
    const { data: roleOk, error: roleErr } = await admin.rpc("has_role", {
      _user_id: userRes.user.id,
      _role: "admin",
    });
    if (roleErr || !roleOk) return json({ error: "not_authorized" }, 403);

    // Body opts: { dryRun?: boolean }
    let dryRun = false;
    try { const body = await req.json(); dryRun = !!body?.dryRun; } catch { /* no body */ }

    const csvUrl = new URL("./data.csv", import.meta.url);
    const csvText = await Deno.readTextFile(csvUrl);
    const rows = parseCsv(csvText);

    if (dryRun) {
      return json({ ok: true, dryRun: true, parsed: rows.length, sample: rows.slice(0, 3) });
    }

    // Batch upsert in chunks of 1000
    const CHUNK = 1000;
    let upserted = 0;
    const errors: { chunk: number; error: string }[] = [];
    for (let i = 0; i < rows.length; i += CHUNK) {
      const slice = rows.slice(i, i + CHUNK);
      const { error, count } = await admin
        .from("reserved_usernames")
        .upsert(slice, { onConflict: "username", count: "exact", ignoreDuplicates: false });
      if (error) {
        errors.push({ chunk: i / CHUNK, error: error.message });
      } else {
        upserted += count ?? slice.length;
      }
    }

    // Conflicts with existing profiles
    const usernames = rows.map((r) => r.username);
    const conflicts: { username: string; profile_id: string }[] = [];
    for (let i = 0; i < usernames.length; i += 1000) {
      const slice = usernames.slice(i, i + 1000);
      const { data: hits } = await admin
        .from("profiles")
        .select("id, username")
        .in("username", slice);
      for (const h of hits ?? []) conflicts.push({ username: h.username, profile_id: h.id });
    }

    return json({
      ok: errors.length === 0,
      parsed: rows.length,
      upserted,
      chunk_errors: errors,
      existing_profile_conflicts: conflicts,
    });
  } catch (e) {
    return json({ error: (e as Error).message }, 500);
  }
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
