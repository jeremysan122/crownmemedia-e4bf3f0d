/**
 * Shared helpers for capturing & redeeming invite codes from a URL like
 * `https://crownmemedia.com/?ref=ABCD1234`.
 *
 * The flow is:
 *   1. Any page that loads with `?ref=CODE` calls captureRefFromUrl() which
 *      stores the trimmed code in localStorage.
 *   2. As soon as a user is authenticated (signup OR login OR a deep-link
 *      visit while already signed in), redeemPendingInvite() runs once, calls
 *      the `redeem_invite_code` RPC, surfaces a toast describing the exact
 *      reward, and clears the pending code so we never retry.
 */
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

const STORAGE_KEY = "crownme_invite_ref";
const ATTEMPT_KEY = "crownme_invite_ref_attempted";

export const PER_SIGNUP_SHEKELS = 200;
export const PASS_BONUS_DAYS = 30;

export function captureRefFromUrl(search?: string): string | null {
  try {
    const qs = search ?? (typeof window !== "undefined" ? window.location.search : "");
    if (!qs) return null;
    const params = new URLSearchParams(qs);
    const ref = params.get("ref");
    if (!ref) return null;
    const cleaned = ref.trim().toUpperCase();
    if (cleaned.length < 4 || cleaned.length > 16) return null;
    localStorage.setItem(STORAGE_KEY, cleaned);
    // New ref invalidates any previous "already attempted" flag
    localStorage.removeItem(ATTEMPT_KEY);
    return cleaned;
  } catch {
    return null;
  }
}

export function getPendingRef(): string | null {
  try { return localStorage.getItem(STORAGE_KEY); } catch { return null; }
}

export function clearPendingRef() {
  try {
    localStorage.removeItem(STORAGE_KEY);
    localStorage.removeItem(ATTEMPT_KEY);
  } catch { /* noop */ }
}

interface RedeemResult {
  ok?: boolean;
  already_redeemed?: boolean;
  shekels_awarded?: number;
}

/**
 * Attempts to redeem the pending invite code. Safe to call repeatedly — only
 * runs once per stored code. `silent` suppresses toasts (used by tests).
 */
export async function redeemPendingInvite(opts: { silent?: boolean } = {}): Promise<RedeemResult | null> {
  let code: string | null = null;
  try { code = localStorage.getItem(STORAGE_KEY); } catch { /* noop */ }
  if (!code) return null;

  let attempted = false;
  try { attempted = localStorage.getItem(ATTEMPT_KEY) === code; } catch { /* noop */ }
  if (attempted) return null;

  try { localStorage.setItem(ATTEMPT_KEY, code); } catch { /* noop */ }

  const { data, error } = await supabase.rpc("redeem_invite_code", { _code: code });
  if (error) {
    clearPendingRef();
    if (!opts.silent) {
      const msg = error.message || "";
      if (/yourself/i.test(msg)) {
        toast.error("You cannot redeem your own invite link.");
      } else if (/not found/i.test(msg)) {
        toast.error("That invite code is no longer valid.");
      } // else: stay silent — most "errors" are just unauthenticated visitors
    }
    return null;
  }

  const result = (data ?? {}) as RedeemResult;
  clearPendingRef();

  if (!opts.silent) {
    if (result.already_redeemed) {
      toast.info("Invite already redeemed on this account", {
        description: `You earned +${PER_SIGNUP_SHEKELS} ₪ when you joined. Activate Royal Pass to unlock another +${PASS_BONUS_DAYS} free days for both of you.`,
        duration: 7000,
      });
    } else if (result.ok) {
      const amt = result.shekels_awarded ?? PER_SIGNUP_SHEKELS;
      toast.success(`Invite reward unlocked — +${amt} ₪ added 👑`, {
        description: `Your inviter also got +${PER_SIGNUP_SHEKELS} ₪. If both of you activate Royal Pass, you each get +${PASS_BONUS_DAYS} free days.`,
        duration: 9000,
      });
    }
  }
  return result;
}
