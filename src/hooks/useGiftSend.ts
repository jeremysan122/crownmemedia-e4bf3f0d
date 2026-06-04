import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { RoyalGift } from "@/types/gifts";

interface SendArgs {
  gift: RoyalGift;
  recipientId: string;
  postId?: string;
  quantity: number;
  /** Max retry attempts on transient RPC failures (default 2). */
  maxRetries?: number;
}

export type GiftSendResult = { success: boolean; transaction_id: string; total: number };

/** Errors that should NOT be retried (business-rule failures). */
const FATAL_PATTERNS = [
  /insufficient/i,
  /not allowed/i,
  /permission/i,
  /denied/i,
  /self/i,
  /not.*found/i,
  /banned|suspended|blocked/i,
];

function isFatal(msg: string) {
  return FATAL_PATTERNS.some((re) => re.test(msg));
}

async function logGiftFailure(stage: string, err: unknown, ctx: Record<string, unknown>) {
  try {
    const { data } = await supabase.auth.getUser();
    const message = err instanceof Error ? err.message : String(err);
    await supabase.from("error_logs").insert({
      user_id: data?.user?.id ?? undefined,
      message: `[gift-send:${stage}] ${message}`.slice(0, 2000),
      stack: err instanceof Error ? err.stack?.slice(0, 8000) : undefined,
      url: typeof window !== "undefined" ? window.location.href : undefined,
      source: "client",
      level: "error",
      metadata: JSON.parse(JSON.stringify({ stage, ...ctx })),
    });
  } catch {
    /* never throw from logger */
  }
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export function useGiftSend() {
  const [isSending, setIsSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const sendGift = async ({ gift, recipientId, postId, quantity, maxRetries = 2 }: SendArgs): Promise<GiftSendResult> => {
    setIsSending(true);
    setError(null);
    let lastErr: unknown = null;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        const { data, error: rpcError } = await supabase.rpc("send_royal_gift", {
          p_gift_id: gift.id,
          p_recipient_id: recipientId,
          p_post_id: postId ?? null,
          p_quantity: quantity,
        });
        if (rpcError) throw rpcError;
        setIsSending(false);
        return data as GiftSendResult;
      } catch (e: unknown) {
        lastErr = e;
        const msg = e instanceof Error ? e.message : String(e);
        await logGiftFailure(`attempt-${attempt}`, e, { giftId: gift.id, recipientId, postId, quantity, attempt });
        if (isFatal(msg) || attempt === maxRetries) break;
        // Exponential backoff: 350ms, 900ms
        await sleep(350 * Math.pow(2.5, attempt));
      }
    }

    const msg = lastErr instanceof Error ? lastErr.message : "Failed to send gift";
    setError(msg);
    setIsSending(false);
    throw lastErr instanceof Error ? lastErr : new Error(msg);
  };

  return { sendGift, isSending, error };
}
