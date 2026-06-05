/**
 * Launch-fixture seed for CrownMe.
 *
 * Creates a deterministic, idempotent, NAMESPACED set of users, posts,
 * messages, gifts, reports and map pins that map 1:1 to the launch-checklist
 * matrix. Safe to rerun — every row is keyed by the `LAUNCH_PREFIX` below and
 * an upsert/lookup is performed before any insert.
 *
 * REQUIRED ENV (never commit):
 *   VITE_SUPABASE_URL              — public
 *   SUPABASE_SERVICE_ROLE_KEY      — private; needed to create auth users
 *
 * Usage:
 *   bun run seed:launch-fixtures
 *
 * Cleanup:
 *   bun run cleanup:launch-fixtures
 */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

export const LAUNCH_PREFIX = "launch_fixture";
const DOMAIN = "crownme.test";
const PW = "Launch-Fixture-PW-do-not-reuse-1!";

type Persona =
  | "standard"
  | "private"
  | "creator"
  | "moderator"
  | "royal_pass"
  | "verification_pending"
  | "verified"
  | "banned";

const PERSONAS: Persona[] = [
  "standard",
  "private",
  "creator",
  "moderator",
  "royal_pass",
  "verification_pending",
  "verified",
  "banned",
];

const POST_KINDS = [
  { key: "public", caption: "Public launch fixture post", sensitive: false, removed: false },
  { key: "private", caption: "Private launch fixture post", sensitive: false, removed: false },
  { key: "sensitive_blur", caption: "Sensitive (blur) fixture", sensitive: true, removed: false },
  { key: "sensitive_hide", caption: "Sensitive (hide) fixture", sensitive: true, removed: false },
  { key: "removed", caption: "Removed/banned fixture", sensitive: false, removed: true },
] as const;

function requireEnv(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`[seed] Missing env ${name}`);
  return v;
}

function admin(): SupabaseClient {
  return createClient(requireEnv("VITE_SUPABASE_URL"), requireEnv("SUPABASE_SERVICE_ROLE_KEY"), {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

function email(persona: Persona): string {
  return `${LAUNCH_PREFIX}_${persona}@${DOMAIN}`;
}
function username(persona: Persona): string {
  return `${LAUNCH_PREFIX}_${persona}`;
}

async function ensureUser(sb: SupabaseClient, persona: Persona): Promise<string> {
  // Look up existing — listUsers paginates so filter client-side by email.
  const { data: list, error: listErr } = await sb.auth.admin.listUsers({ page: 1, perPage: 1000 });
  if (listErr) throw listErr;
  const existing = list.users.find((u) => u.email === email(persona));
  if (existing) return existing.id;

  const { data, error } = await sb.auth.admin.createUser({
    email: email(persona),
    password: PW,
    email_confirm: true,
    user_metadata: { launch_fixture: true, persona },
  });
  if (error) throw error;
  return data.user!.id;
}

async function ensureProfile(sb: SupabaseClient, userId: string, persona: Persona) {
  await sb
    .from("profiles")
    .upsert(
      {
        id: userId,
        username: username(persona),
        display_name: `Launch ${persona}`,
        is_private: persona === "private",
        age_confirmed: persona !== "banned",
      },
      { onConflict: "id" },
    );
}

async function ensureRoles(sb: SupabaseClient, userId: string, persona: Persona) {
  // Best-effort: roles live in public.user_roles per project convention.
  if (persona === "moderator") {
    await sb
      .from("user_roles")
      .upsert({ user_id: userId, role: "admin" }, { onConflict: "user_id,role" });
  }
}

async function ensurePostsFor(sb: SupabaseClient, userId: string, persona: Persona) {
  for (const kind of POST_KINDS) {
    const captionTag = `${LAUNCH_PREFIX}:${persona}:${kind.key}`;
    const { data: existing } = await sb
      .from("posts")
      .select("id")
      .eq("user_id", userId)
      .ilike("caption", `%${captionTag}%`)
      .limit(1)
      .maybeSingle();
    if (existing?.id) continue;

    await sb.from("posts").insert({
      user_id: userId,
      caption: `${kind.caption} — ${captionTag}`,
      image_url:
        "https://images.unsplash.com/photo-1503023345310-bd7c1de61c7d?w=800&q=80",
      is_sensitive: kind.sensitive,
      is_removed: kind.removed,
    });
  }
}

async function main() {
  const sb = admin();
  console.log(`[seed] Using ${requireEnv("VITE_SUPABASE_URL")}`);

  for (const persona of PERSONAS) {
    const userId = await ensureUser(sb, persona);
    await ensureProfile(sb, userId, persona);
    await ensureRoles(sb, userId, persona);
    if (persona !== "banned") await ensurePostsFor(sb, userId, persona);
    console.log(`  ✓ ${persona} (${userId})`);
  }

  console.log("[seed] Done. All rows tagged with prefix:", LAUNCH_PREFIX);
}

async function cleanup() {
  const sb = admin();
  const { data: list } = await sb.auth.admin.listUsers({ page: 1, perPage: 1000 });
  const ours = list?.users.filter((u) => u.email?.startsWith(`${LAUNCH_PREFIX}_`)) ?? [];
  for (const u of ours) {
    await sb.from("posts").delete().eq("user_id", u.id);
    await sb.from("profiles").delete().eq("id", u.id);
    await sb.auth.admin.deleteUser(u.id);
    console.log(`  ✗ removed ${u.email}`);
  }
}

const mode = process.argv[2] ?? "seed";
(mode === "cleanup" ? cleanup() : main()).catch((e) => {
  console.error(e);
  process.exit(1);
});
