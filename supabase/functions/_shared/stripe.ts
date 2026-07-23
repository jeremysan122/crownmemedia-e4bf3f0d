// Shared Stripe utility for BYOK (bring-your-own-key) Stripe.
// All payment edge functions import createStripeClient from here.
// The API key is the builder's own Stripe secret key (sk_test_... / sk_live_...),
// NOT a Lovable-managed gateway connection identifier.
import Stripe from "https://esm.sh/stripe@22.0.2";

const getEnv = (key: string): string => {
  const value = Deno.env.get(key);
  if (!value) throw new Error(`${key} is not configured`);
  return value;
};

export type StripeEnv = "sandbox" | "live";

// Sandbox mode is enabled when a test secret key is configured, or when the
// single configured STRIPE_SECRET_KEY is a test key. For production BYOK
// deployments, live webhooks use STRIPE_SECRET_KEY (sk_live_... or rk_live_...).
// Restricted keys (rk_...) are accepted but may not support every Stripe operation.
export function isStripeEnvironmentEnabled(env: StripeEnv): boolean {
  const mainKey = Deno.env.get("STRIPE_SECRET_KEY");
  const testKey = Deno.env.get("STRIPE_TEST_SECRET_KEY");
  const isLive = !!mainKey && (mainKey.startsWith("sk_live_") || mainKey.startsWith("rk_live_"));
  const isTest = !!mainKey && (mainKey.startsWith("sk_test_") || mainKey.startsWith("rk_test_"));
  if (env === "live") return isLive;
  return !!(testKey || isTest);
}

function isStripeKey(key: string): boolean {
  return key.startsWith("sk_test_") || key.startsWith("sk_live_") || key.startsWith("rk_test_") ||
    key.startsWith("rk_live_");
}

function resolveSecretKey(env: StripeEnv): string {
  if (env === "sandbox") {
    const testKey = Deno.env.get("STRIPE_TEST_SECRET_KEY");
    if (testKey) return testKey;
    const mainKey = Deno.env.get("STRIPE_SECRET_KEY");
    if (mainKey && isStripeKey(mainKey)) return mainKey;
    throw new Error(
      "Stripe sandbox is not configured. Add STRIPE_TEST_SECRET_KEY or set STRIPE_SECRET_KEY to a test key (sk_test_... / rk_test_...).",
    );
  }
  const mainKey = getEnv("STRIPE_SECRET_KEY");
  if (!isStripeKey(mainKey)) {
    throw new Error(
      "STRIPE_SECRET_KEY is not a valid Stripe key. For production BYOK use sk_live_... or rk_live_...",
    );
  }
  return mainKey;
}

export function createStripeClient(env: StripeEnv): Stripe {
  const secretKey = resolveSecretKey(env);
  return new Stripe(secretKey, {
    apiVersion: "2026-03-25.dahlia",
  });
}

function resolveWebhookSecret(env: StripeEnv): string {
  if (env === "sandbox") {
    const testSecret = Deno.env.get("STRIPE_TEST_WEBHOOK_SECRET");
    if (testSecret) return testSecret;
    const mainSecret = Deno.env.get("STRIPE_WEBHOOK_SECRET");
    if (mainSecret) return mainSecret;
    throw new Error(
      "Stripe sandbox webhook secret is not configured. Add STRIPE_TEST_WEBHOOK_SECRET or STRIPE_WEBHOOK_SECRET.",
    );
  }
  return getEnv("STRIPE_WEBHOOK_SECRET");
}

export async function verifyWebhook(
  req: Request,
  env: StripeEnv,
): Promise<{ id: string; type: string; data: { object: any } }> {
  const signature = req.headers.get("stripe-signature");
  const body = await req.text();
  if (!signature || !body) throw new Error("Missing signature or body");

  const secret = resolveWebhookSecret(env);
  const stripe = createStripeClient(env);
  const event = stripe.webhooks.constructEvent(body, signature, secret);
  return event as { id: string; type: string; data: { object: any } };
}

export async function verifyConnectWebhook(
  req: Request,
): Promise<{ id: string; type: string; account?: string; data: { object: any } }> {
  const signature = req.headers.get("stripe-signature");
  const body = await req.text();
  if (!signature || !body) throw new Error("Missing signature or body");

  const secret = getEnv("STRIPE_CONNECT_WEBHOOK_SECRET");
  const secretKey = getEnv("STRIPE_SECRET_KEY");
  const stripe = new Stripe(secretKey, {
    apiVersion: "2026-03-25.dahlia",
  });
  const event = stripe.webhooks.constructEvent(body, signature, secret);
  return event as { id: string; type: string; account?: string; data: { object: any } };
}

// Resolve/create a Stripe Customer keyed by userId metadata.
// MUST be used for every user-linked checkout so later reads (portal,
// subscriptions.search) can find the user without depending on Session metadata.
export async function resolveOrCreateCustomer(
  stripe: Stripe,
  options: { email?: string; userId?: string },
): Promise<string> {
  if (options.userId && !/^[a-zA-Z0-9_-]+$/.test(options.userId)) {
    throw new Error("Invalid userId");
  }
  if (options.userId) {
    const found = await stripe.customers.search({
      query: `metadata['userId']:'${options.userId}'`,
      limit: 1,
    });
    if (found.data.length) return found.data[0].id;
  }
  if (options.email) {
    const existing = await stripe.customers.list({ email: options.email, limit: 1 });
    if (existing.data.length) {
      const customer = existing.data[0];
      if (options.userId && customer.metadata?.userId !== options.userId) {
        await stripe.customers.update(customer.id, {
          metadata: { ...customer.metadata, userId: options.userId },
        });
      }
      return customer.id;
    }
  }
  const created = await stripe.customers.create({
    ...(options.email && { email: options.email }),
    ...(options.userId && { metadata: { userId: options.userId } }),
  });
  return created.id;
}
