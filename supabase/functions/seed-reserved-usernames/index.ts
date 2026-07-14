// Admin-only seed loader for the 100,000-row reserved usernames dataset.
// Idempotent: upserts by primary key `username` in resumable chunks.
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
    if (!r || r.length < 3) continue;
    const uname = (r[idx.username] ?? "").trim().toLowerCase();
    if (!uname) continue;
    rows.push({
      username: uname,
      category: r[idx.category] ?? "unknown",
      reserved_reason: r[idx.reserved_reason] ?? "",
      reservation_policy: r[idx.reservation_policy] ?? "claimable",
      source_label: r[idx.source_label] ?? "seed",
      priority: Number(r[idx.priority]) || 50,
      is_active: /true/i.test(r[idx.is_active] ?? "true"),
      requires_identity_verification: /true/i.test(r[idx.requires_identity_verification] ?? "false"),
    });
  }
  return rows;
}

async function loadDataset(): Promise<string> {
  // Prefer the gzipped bundle (100k rows). Fall back to plain CSV if present.
  const gzUrl = new URL("./data.csv.gz", import.meta.url);
  try {
    const gzBytes = await Deno.readFile(gzUrl);
    const stream = new Blob([gzBytes]).stream().pipeThrough(new DecompressionStream("gzip"));
    return await new Response(stream).text();
  } catch (_e) {
    const csvUrl = new URL("./data.csv", import.meta.url);
    return await Deno.readTextFile(csvUrl);
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization") ?? "";
    if (!authHeader) return json({ error: "missing_auth" }, 401);

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

    let dryRun = false;
    let chunkSize = 2000;
    try {
      const body = await req.json();
      dryRun = !!body?.dryRun;
      if (typeof body?.chunkSize === "number" && body.chunkSize >= 500 && body.chunkSize <= 5000) {
        chunkSize = Math.floor(body.chunkSize);
      }
    } catch { /* no body */ }

    const csvText = await loadDataset();
    const rows = parseCsv(csvText);

    if (dryRun) {
      const policies: Record<string, number> = {};
      for (const r of rows) policies[r.reservation_policy] = (policies[r.reservation_policy] ?? 0) + 1;
      return json({ ok: true, dryRun: true, parsed: rows.length, policies, sample: rows.slice(0, 3) });
    }

    let upserted = 0;
    const errors: { chunk: number; error: string }[] = [];
    for (let i = 0; i < rows.length; i += chunkSize) {
      const slice = rows.slice(i, i + chunkSize);
      const { error, count } = await admin
        .from("reserved_usernames")
        .upsert(slice, { onConflict: "username", count: "exact", ignoreDuplicates: false });
      if (error) errors.push({ chunk: Math.floor(i / chunkSize), error: error.message });
      else upserted += count ?? slice.length;
    }

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
      chunk_size: chunkSize,
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
