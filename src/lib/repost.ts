/**
 * Repost client helpers. All eligibility/creation logic lives in the
 * `check_repost_eligibility` and `create_repost` Postgres functions so the
 * client cannot bypass blocks, category validation, or duplicate guards.
 */
import { supabase } from "@/integrations/supabase/client";

export type RepostFailureCode =
  | "not_authenticated"
  | "not_found"
  | "own_post"
  | "post_unavailable"
  | "is_repost"
  | "blocked"
  | "category_invalid"
  | "already_reposted"
  | "insert_failed"
  | "network_error"
  | "unknown_error";

export interface RepostEligibility {
  eligible: boolean;
  code: RepostFailureCode | "ok";
  reason?: string;
  main_category_slug?: string;
  subcategory_slug?: string;
  existing_repost_id?: string | null;
}

const FRIENDLY: Record<string, string> = {
  not_authenticated: "Sign in to repost.",
  not_found: "Original post is no longer available.",
  own_post: "You can't repost your own post.",
  post_unavailable: "This post can't be reposted.",
  is_repost: "Reposts of reposts aren't allowed.",
  blocked: "This user is unavailable.",
  category_invalid: "Category is no longer supported.",
  already_reposted: "You already reposted this.",
  insert_failed: "Couldn't create the repost. Please try again.",
  network_error: "Network error. Check your connection and try again.",
  unknown_error: "Something went wrong. Please try again.",
};

export function friendlyRepostMessage(code: string | undefined, fallback?: string): string {
  if (code && FRIENDLY[code]) return FRIENDLY[code];
  return fallback || FRIENDLY.unknown_error;
}

/** Codes where retrying with the same input is safe and likely to succeed. */
export const RETRYABLE_REPOST_CODES = new Set<string>([
  "insert_failed",
  "network_error",
  "unknown_error",
]);

export async function checkRepostEligibility(parentPostId: string): Promise<RepostEligibility> {
  try {
    const { data, error } = await supabase.rpc("check_repost_eligibility", {
      p_parent_post_id: parentPostId,
    });
    if (error) {
      return { eligible: false, code: "network_error", reason: FRIENDLY.network_error };
    }
    const j = (data ?? {}) as any;
    return {
      eligible: !!j.eligible,
      code: (j.code ?? "unknown_error") as RepostEligibility["code"],
      reason: j.reason ?? friendlyRepostMessage(j.code),
      main_category_slug: j.main_category_slug,
      subcategory_slug: j.subcategory_slug,
      existing_repost_id: j.existing_repost_id ?? null,
    };
  } catch {
    return { eligible: false, code: "network_error", reason: FRIENDLY.network_error };
  }
}

export interface CreateRepostResult {
  ok: boolean;
  code: string;
  repostId?: string;
  message?: string;
  existingRepostId?: string | null;
  retryable: boolean;
}

export async function createRepost(args: {
  parentPostId: string;
  caption?: string;
  requestId: string;
}): Promise<CreateRepostResult> {
  try {
    const { data, error } = await supabase.rpc("create_repost", {
      p_parent_post_id: args.parentPostId,
      p_caption: args.caption ?? "",
      p_request_id: args.requestId,
    });
    if (error) {
      return {
        ok: false,
        code: "network_error",
        message: FRIENDLY.network_error,
        retryable: true,
      };
    }
    const j = (data ?? {}) as any;
    const code = j.code ?? (j.ok ? "created" : "unknown_error");
    return {
      ok: !!j.ok,
      code,
      repostId: j.repost_id,
      message: j.message ?? friendlyRepostMessage(code),
      existingRepostId: j.existing_repost_id ?? null,
      retryable: !j.ok && RETRYABLE_REPOST_CODES.has(code),
    };
  } catch {
    return {
      ok: false,
      code: "network_error",
      message: FRIENDLY.network_error,
      retryable: true,
    };
  }
}
