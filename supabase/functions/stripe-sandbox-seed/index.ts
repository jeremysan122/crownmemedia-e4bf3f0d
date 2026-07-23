// One-shot idempotent seeder for Stripe TEST-mode catalog.
// Creates products + prices with stable lookup_keys used by CrownMe checkout functions.
// Guarded by CRON_SHARED_SECRET (x-cron-secret header). Sandbox only.
import { createStripeClient } from "../_shared/stripe.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-cron-secret",
};

type Item = {
  lookup_key: string;
  name: string;
  amount: number; // cents
  interval?: "month" | "year";
};

const CATALOG: Item[] = [
  // Shekel bundles
  { lookup_key: "shekels_starter_pouch",  name: "Starter Pouch — 500 Shekels",      amount: 249 },
  { lookup_key: "shekels_royal_bag",      name: "Royal Bag — 1,100 Shekels",        amount: 499 },
  { lookup_key: "shekels_noble_chest",    name: "Noble Chest — 3,000 Shekels",      amount: 1249 },
  { lookup_key: "shekels_crown_vault",    name: "Crown Vault — 6,500 Shekels",      amount: 2499 },
  { lookup_key: "shekels_kings_hoard",    name: "King's Hoard — 14,000 Shekels",    amount: 4999 },
  { lookup_key: "shekels_empire_treasury",name: "Empire Treasury — 38,000 Shekels", amount: 12499 },
  // Boosts
  { lookup_key: "boost_profile_glow",     name: "Profile Glow Boost",  amount: 199 },
  { lookup_key: "boost_vote",             name: "Vote Boost",          amount: 299 },
  { lookup_key: "boost_royal",            name: "Royal Boost",         amount: 499 },
  { lookup_key: "boost_crown_shield",     name: "Crown Shield Boost",  amount: 799 },
  { lookup_key: "boost_crown_spotlight",  name: "Crown Spotlight Boost", amount: 999 },
  // Royal Pass gift (one-time)
  { lookup_key: "royal_pass_gift_1mo",    name: "Royal Pass Gift · 1 Month", amount: 999 },
  // Subscriptions
  { lookup_key: "royal_pass_monthly",     name: "Royal Pass · Monthly",  amount: 999,  interval: "month" },
  { lookup_key: "royal_pass_annual",      name: "Royal Pass · Annual",   amount: 7999, interval: "year" },
  { lookup_key: "verification_monthly",   name: "Verified Badge · Monthly", amount: 199, interval: "month" },
];

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const secret = Deno.env.get("CRON_SHARED_SECRET");
  if (!secret || req.headers.get("x-cron-secret") !== secret) {
    return new Response(JSON.stringify({ error: "forbidden" }), {
      status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const stripe = createStripeClient("sandbox");
  const results: Array<Record<string, unknown>> = [];

  for (const item of CATALOG) {
    try {
      // Check if a price with this lookup_key already exists
      const existing = await stripe.prices.list({ lookup_keys: [item.lookup_key], limit: 1, active: true });
      if (existing.data.length > 0) {
        const p = existing.data[0];
        results.push({ lookup_key: item.lookup_key, status: "exists", price_id: p.id, product: p.product });
        continue;
      }

      // Create product
      const product = await stripe.products.create({
        name: item.name,
        metadata: { lookup_key: item.lookup_key },
      });

      const priceParams: Record<string, unknown> = {
        product: product.id,
        unit_amount: item.amount,
        currency: "usd",
        lookup_key: item.lookup_key,
        transfer_lookup_key: true,
        metadata: { lookup_key: item.lookup_key },
      };
      if (item.interval) priceParams.recurring = { interval: item.interval };

      const price = await stripe.prices.create(priceParams as any);
      results.push({ lookup_key: item.lookup_key, status: "created", price_id: price.id, product: product.id });
    } catch (err) {
      results.push({ lookup_key: item.lookup_key, status: "error", error: (err as Error).message });
    }
  }

  return new Response(JSON.stringify({ ok: true, results }, null, 2), {
    status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
