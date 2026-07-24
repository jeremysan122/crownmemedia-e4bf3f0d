import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

if (process.env.PRODUCTION_RLS_AUDIT !== "1") {
  console.error("Refusing to probe production without PRODUCTION_RLS_AUDIT=1.");
  process.exit(2);
}

const envPath = fileURLToPath(new URL("../.env", import.meta.url));
const envText = await readFile(envPath, "utf8");
const env = Object.fromEntries(
  envText
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith("#") && line.includes("="))
    .map((line) => {
      const separator = line.indexOf("=");
      return [line.slice(0, separator), line.slice(separator + 1)];
    }),
);

const supabaseUrl = env.VITE_SUPABASE_URL;
const anonKey = env.VITE_SUPABASE_PUBLISHABLE_KEY;

if (!supabaseUrl || !anonKey) {
  console.error("Missing browser-public Supabase configuration in .env.");
  process.exit(2);
}

// These tables contain private identity, communication, moderation, payout, or
// infrastructure data. An unauthenticated caller must never be able to count
// or read rows from any of them.
const sensitiveTables = [
  "admin_audit_log",
  "connect_accounts",
  "dm_attachments",
  "email_send_log",
  "messages",
  "notifications",
  "payment_transactions",
  "payouts",
  "push_subscriptions",
  "reports",
  "royal_pass_subscriptions",
  "stripe_events",
  "user_roles",
  "wallet_ledger",
  "wallets",
];

const results = [];
const permissionResults = [];
let unsafe = false;

for (const table of sensitiveTables) {
  const endpoint = new URL(`/rest/v1/${encodeURIComponent(table)}`, supabaseUrl);
  endpoint.searchParams.set("select", "*");
  endpoint.searchParams.set("limit", "1");

  const response = await fetch(endpoint, {
    method: "HEAD",
    headers: {
      apikey: anonKey,
      Authorization: `Bearer ${anonKey}`,
      Prefer: "count=exact",
    },
  });

  if (response.status === 401 || response.status === 403 || response.status === 404) {
    results.push({ table, result: "blocked", status: response.status });
    continue;
  }

  if (!response.ok) {
    unsafe = true;
    results.push({ table, result: "unexpected-response", status: response.status });
    continue;
  }

  const contentRange = response.headers.get("content-range") ?? "";
  const match = contentRange.match(/\/(\d+)$/);
  const visibleRows = match ? Number(match[1]) : null;

  if (visibleRows === 0) {
    results.push({ table, result: "filtered", status: response.status });
  } else {
    unsafe = true;
    results.push({
      table,
      result: visibleRows === null ? "missing-count" : "anonymous-rows-visible",
      status: response.status,
      visibleRows,
    });
  }
}

// Column grants are independent from RLS. These probes catch the exact class
// of regression where a later table-wide GRANT SELECT silently defeats an
// earlier protected-column allowlist.
const permissionProbes = [
  { name: "profiles-public-columns", table: "profiles", select: "id,username", shouldBlock: false },
  { name: "profiles-protected-columns", table: "profiles", select: "first_name,last_name,banned_reason,deletion_requested_at,verification_plan", shouldBlock: true },
  { name: "posts-public-columns", table: "posts", select: "id,caption", shouldBlock: false },
  { name: "posts-protected-columns", table: "posts", select: "submission_key,client_request_id,moderation_notes,moderated_by,post_lat,post_lng,location_captured_at", shouldBlock: true },
  { name: "profiles-public-view", table: "profiles_public", select: "id,username", shouldBlock: false },
];

for (const probe of permissionProbes) {
  const endpoint = new URL(`/rest/v1/${encodeURIComponent(probe.table)}`, supabaseUrl);
  endpoint.searchParams.set("select", probe.select);
  endpoint.searchParams.set("limit", "1");
  const response = await fetch(endpoint, {
    method: "HEAD",
    headers: { apikey: anonKey, Authorization: `Bearer ${anonKey}` },
  });
  const blocked = response.status === 401 || response.status === 403 || response.status === 404;
  const passed = probe.shouldBlock ? blocked : response.ok;
  if (!passed) unsafe = true;
  permissionResults.push({
    name: probe.name,
    expected: probe.shouldBlock ? "blocked" : "allowed",
    result: blocked ? "blocked" : response.ok ? "allowed" : "unexpected-response",
    status: response.status,
  });
}

console.log(JSON.stringify({ unsafe, results, permissionResults }, null, 2));
process.exit(unsafe ? 1 : 0);
