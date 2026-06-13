// Admin-only: syncs all Shekel bundles + boost bundles in DB → updates the
// matching Stripe Product (name, description, tax_code, metadata) and verifies
// the Stripe Price unit_amount matches the DB `usd` value.
import Stripe from "npm:stripe@17.5.0";
import { createClient } from "npm:@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const stripeKey = Deno.env.get("STRIPE_SECRET_KEY");
const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);
const stripe = stripeKey
  ? new Stripe(stripeKey, {
      apiVersion: "2024-12-18.acacia",
      httpClient: Stripe.createFetchHttpClient(),
    })
  : null;

// All digital — Stripe tax_code for "Digital products > Business and web services"
const TAX_CODE_DIGITAL_SERVICES = "txcd_10103001";

// Authoritative product copy keyed by stripe_price_id
const COPY: Record<string, { name: string; description: string }> = {
  // Shekel bundles
  price_1TSNoeK87HQxUc0wrVXLLZtc: {
    name: "Starter Pouch",
    description: "Get 500 Shekels to send Royal Gifts to other members. Perfect for trying out the gift store.",
  },
  price_1TSNpXK87HQxUc0wrXKPu0GY: {
    name: "Royal Bag",
    description: "Get 1,100 Shekels — 10% bonus value. Stock up to send more Royal Gifts.",
  },
  price_1TSNqTK87HQxUc0wm3AxeXvF: {
    name: "Noble Chest",
    description: "Get 3,000 Shekels — 20% bonus value. Send bigger gifts to the creators you love.",
  },
  price_1TSNrIK87HQxUc0wV3IWkgpH: {
    name: "Crown Vault",
    description: "Get 6,500 Shekels — 30% bonus value. Send premium Royal Gifts and combo sends.",
  },
  price_1TSNsCK87HQxUc0wgzwK8RBl: {
    name: "King's Hoard",
    description: "Get 14,000 Shekels — 40% bonus value. The royal stockpile for serious gifters.",
  },
  price_1TSNtkK87HQxUc0w7dlzGmqN: {
    name: "Empire Treasury",
    description: "Get 38,000 Shekels — 50% bonus value. The ultimate gift-giving war chest.",
  },
  // Boosts
  price_1TSNvDK87HQxUc0waYA8LjNN: {
    name: "Royal Boost",
    description: "Multiply your crown score by 1.5x for 24 hours. Climb the leaderboard faster than ever.",
  },
  price_1TSNvjK87HQxUc0wGwlPFpTT: {
    name: "Vote Boost",
    description: "Double the impact of every vote your posts receive for 24 hours.",
  },
  price_1TSNwEK87HQxUc0w81C9mgpm: {
    name: "Crown Spotlight",
    description: "Pin your top post to the spotlight feed for 24 hours. Maximum visibility, maximum reach.",
  },
  price_1TSNwlK87HQxUc0wc2VQanMX: {
    name: "Profile Glow",
    description: "Add a glowing royal aura to your profile across the app for 24 hours. Stand out everywhere.",
  },
  price_1TSNxZK87HQxUc0w3p2h0ZvW: {
    name: "Crown Shield",
    description: "Protect your crown from being stolen for 12 hours. Defend your throne while you sleep.",
  },
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (!stripe) {
    return new Response(JSON.stringify({ error: "STRIPE_SECRET_KEY not configured" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  // Admin-only
  const authHeader = req.headers.get("Authorization");
  if (!authHeader) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
  const userClient = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_ANON_KEY")!,
    { global: { headers: { Authorization: authHeader } } },
  );
  const { data: { user } } = await userClient.auth.getUser();
  if (!user) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
  const { data: isAdmin } = await supabase.rpc("has_role", { _user_id: user.id, _role: "admin" });
  if (!isAdmin) {
    return new Response(JSON.stringify({ error: "Forbidden — admin only" }), {
      status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const dryRun = new URL(req.url).searchParams.get("dry_run") === "1";

  // Pull DB rows
  const [{ data: bundles }, { data: boosts }] = await Promise.all([
    supabase.from("shekel_bundles").select("stripe_price_id, label, usd, shekels"),
    supabase.from("boost_bundles").select("stripe_price_id, label, usd, boost_type, duration_hours"),
  ]);

  type Row = { kind: "bundle" | "boost"; price_id: string; usd: number; meta: Record<string, string>; db_label: string; };
  const rows: Row[] = [];
  for (const b of bundles ?? []) {
    rows.push({
      kind: "bundle", price_id: b.stripe_price_id, usd: Number(b.usd), db_label: b.label,
      meta: { kind: "shekel_bundle", shekels: String(b.shekels), db_label: b.label },
    });
  }
  for (const b of boosts ?? []) {
    rows.push({
      kind: "boost", price_id: b.stripe_price_id, usd: Number(b.usd), db_label: b.label,
      meta: { kind: "boost", boost_type: b.boost_type, duration_hours: String(b.duration_hours), db_label: b.label },
    });
  }

  const report: Array<Record<string, unknown>> = [];

  for (const row of rows) {
    const entry: Record<string, unknown> = { price_id: row.price_id, kind: row.kind, db_label: row.db_label, db_usd: row.usd };
    try {
      const price = await stripe.prices.retrieve(row.price_id, { expand: ["product"] });
      const product = price.product as Stripe.Product;
      const stripeUsd = (price.unit_amount ?? 0) / 100;
      entry.stripe_price_usd = stripeUsd;
      entry.product_id = product.id;
      entry.price_match = Math.abs(stripeUsd - row.usd) < 0.005;

      const copy = COPY[row.price_id];
      if (!copy) {
        entry.warning = "no copy mapping in sync function";
        report.push(entry);
        continue;
      }

      if (!dryRun) {
        const updated = await stripe.products.update(product.id, {
          name: copy.name,
          description: copy.description,
          tax_code: TAX_CODE_DIGITAL_SERVICES,
          metadata: row.meta,
        });
        entry.synced = true;
        entry.new_name = updated.name;
      } else {
        entry.would_update = { name: copy.name, description: copy.description, tax_code: TAX_CODE_DIGITAL_SERVICES, metadata: row.meta };
      }
    } catch (err) {
      entry.error = (err as Error).message;
    }
    report.push(entry);
  }

  const errors = report.filter((r) => r.error).length;
  const mismatches = report.filter((r) => r.price_match === false).length;

  // Audit log entry (service role bypasses RLS, so we set actor_id to the admin who called us)
  await supabase.from("admin_audit_log").insert({
    actor_id: user.id,
    actor_email: user.email ?? null,
    action: dryRun ? "stripe_sync_products.dry_run" : "stripe_sync_products.run",
    target_type: "stripe",
    target_id: null,
    details: { total: report.length, errors, price_mismatches: mismatches },
  });

  return new Response(
    JSON.stringify({ ok: errors === 0, dry_run: dryRun, total: report.length, errors, price_mismatches: mismatches, report }, null, 2),
    { headers: { ...corsHeaders, "Content-Type": "application/json" } },
  );
});
