/**
 * Friendly, user-safe error messages for every monetization flow.
 *
 * Raw Stripe/Supabase/Postgres/RLS errors leak internal details and are
 * hostile to end users. Log the raw error for diagnostics (server-side or via
 * error_logs), but surface a mapped message in the UI.
 */

export type MonetizationScope =
  | "checkout"
  | "royal_pass_checkout"
  | "royal_pass_gift_checkout"
  | "royal_pass_portal"
  | "royal_pass_cancel"
  | "verification_submit"
  | "verification_checkout"
  | "connect_onboard"
  | "connect_status"
  | "payout_request"
  | "purchase_verify"
  | "boost_purchase"
  | "gift_send"
  | "gift_send_dm"
  | "wallet_load";

const DEFAULT_MESSAGES: Record<MonetizationScope, string> = {
  checkout: "Couldn't start checkout. Try again.",
  royal_pass_checkout: "Couldn't start Royal Pass checkout. Try again.",
  royal_pass_portal: "Couldn't open billing portal. Try again.",
  royal_pass_cancel: "Couldn't update your subscription. Try again.",
  verification_submit: "Couldn't submit verification. Try again.",
  verification_checkout: "Couldn't start verification checkout. Try again.",
  connect_onboard: "Couldn't start Stripe onboarding. Try again.",
  connect_status: "Couldn't refresh payout status. Try again.",
  payout_request: "Couldn't request payout. Try again.",
  purchase_verify: "Couldn't verify your purchase. Refresh in a moment.",
  boost_purchase: "Couldn't start boost checkout. Try again.",
  gift_send: "Couldn't send gift. Try again.",
  gift_send_dm: "Couldn't send DM gift. Try again.",
  wallet_load: "Couldn't load your wallet. Try again.",
};

/** Business-rule patterns worth surfacing verbatim (short, user-safe strings). */
const SAFE_PATTERNS: Array<{ re: RegExp; msg: (raw: string) => string }> = [
  { re: /insufficient\s+shekels?/i, msg: () => "Not enough Shekels for this action." },
  { re: /insufficient\s+balance/i, msg: () => "Not enough balance for this action." },
  { re: /cannot\s+gift\s+yourself|gift\s+yourself/i, msg: () => "You can't send a gift to yourself." },
  { re: /recipient\s+is\s+unavailable|banned|suspended/i, msg: () => "This recipient can't receive gifts right now." },
  { re: /cannot\s+send\s+to\s+this\s+recipient|blocked/i, msg: () => "You can't send to this recipient." },
  { re: /invalid\s+recipient|recipient\s+not\s+found/i, msg: () => "Recipient not found." },
  { re: /invalid\s+gift/i, msg: () => "That gift isn't available." },
  { re: /invalid\s+quantity/i, msg: () => "Invalid quantity — try again." },
  { re: /you\s+can\s+only\s+boost\s+your\s+own\s+posts/i, msg: () => "You can only boost your own posts." },
  { re: /invalid\s+product|price\s+not\s+found|invalid\s+plan|invalid\s+bundle/i, msg: () => "That item is no longer available." },
  { re: /not\s+authenticated|unauthorized/i, msg: () => "Please sign in and try again." },
  { re: /rate\s*limit|too many/i, msg: () => "You're doing that too fast — wait a moment and retry." },
  { re: /network|failed to fetch|load failed/i, msg: () => "Network hiccup — check your connection and retry." },
];

/**
 * Extract the underlying message from anything a Supabase/Stripe/Postgres/Fetch
 * error might return. Never returns undefined — always a string.
 */
export function extractRawMessage(err: unknown): string {
  if (!err) return "";
  if (typeof err === "string") return err;
  if (err instanceof Error) return err.message || "";
  if (typeof err === "object") {
    const row = err as Record<string, unknown>;
    if (typeof row.message === "string") return row.message;
    if (typeof row.error === "string") return row.error;
    if (row.error && typeof (row.error as { message?: unknown }).message === "string") {
      return (row.error as { message: string }).message;
    }
  }
  try {
    return JSON.stringify(err);
  } catch {
    return "";
  }
}

/**
 * Map any error into a short, user-safe message for the given monetization flow.
 * Always safe to display in a toast or inline error.
 */
export function friendlyMonetizationError(scope: MonetizationScope, err: unknown): string {
  const raw = extractRawMessage(err);
  if (raw) {
    for (const { re, msg } of SAFE_PATTERNS) {
      if (re.test(raw)) return msg(raw);
    }
  }
  return DEFAULT_MESSAGES[scope];
}
