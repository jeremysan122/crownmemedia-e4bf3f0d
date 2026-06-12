// Share a post or profile into a DM thread.
//
// Mirrors the gift-DM flow: SECURITY DEFINER RPC `send_dm_share` does the
// safety checks (block, removed/archived post, banned recipient) atomically
// and returns the inserted message id. On the client we just retry transient
// failures and never retry business-rule failures.
import { supabase } from "@/integrations/supabase/client";
import { makeGiftIdempotencyKey } from "@/hooks/useGiftSend";

export type DmShareKind = "post_share" | "profile_share";

export interface DmShareArgs {
  recipientId: string;
  kind: DmShareKind;
  postId?: string | null;
  profileId?: string | null;
  body?: string | null;
  idempotencyKey?: string;
  maxRetries?: number;
}

export interface DmShareResult {
  success: boolean;
  message_id: string;
  deduped?: boolean;
}

const FATAL = [
  /not authenticated/i,
  /invalid recipient/i,
  /invalid kind/i,
  /missing /i,
  /unavailable/i,
  /cannot send/i,
  /permission/i,
  /denied/i,
];

export function isFatalDmShareError(msg: string): boolean {
  return FATAL.some((re) => re.test(msg));
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export async function sendDmShare(args: DmShareArgs): Promise<DmShareResult> {
  const { recipientId, kind, postId = null, profileId = null, body = null } = args;
  const dedupeKey = args.idempotencyKey ?? makeGiftIdempotencyKey();
  const maxRetries = args.maxRetries ?? 2;

  let lastErr: unknown = null;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const { data, error } = await supabase.rpc("send_dm_share", {
        p_recipient_id: recipientId,
        p_kind: kind,
        p_post_id: postId,
        p_profile_id: profileId,
        p_body: body,
        p_dedupe_key: dedupeKey,
      } as never);
      if (error) throw error;
      return data as unknown as DmShareResult;
    } catch (e) {
      lastErr = e;
      const msg = e instanceof Error ? e.message : String((e as { message?: string })?.message ?? e);
      if (isFatalDmShareError(msg) || attempt === maxRetries) break;
      await sleep(350 * Math.pow(2.5, attempt));
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error(String(lastErr));
}
