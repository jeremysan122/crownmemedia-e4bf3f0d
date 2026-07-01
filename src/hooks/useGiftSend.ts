import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { RoyalGift } from "@/types/gifts";

interface SendArgs {
  gift: RoyalGift;
  recipientId: string;
  postId?: string;
  quantity: number;
  /** Stable key for manual retries of the same user action. */
  idempotencyKey?: string;
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

export function makeGiftIdempotencyKey() {
  const cryptoApi = typeof globalThis !== "undefined" ? globalThis.crypto : undefined;
  if (cryptoApi?.randomUUID) return cryptoApi.randomUUID();

  // RFC4122-ish UUID fallback for older WebViews; Postgres expects uuid syntax.
  const bytes = new Uint8Array(16);
  if (cryptoApi?.getRandomValues) {
    cryptoApi.getRandomValues(bytes);
  } else {
    for (let i = 0; i < bytes.length; i++) bytes[i] = Math.floor(Math.random() * 256);
  }
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = [...bytes].map((b) => b.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

function serializeError(err: unknown) {
  if (err instanceof Error) return { message: err.message, stack: err.stack, name: err.name };
  if (err && typeof err === "object") {
    const row = err as Record<string, unknown>;
    return {
      message: typeof row.message === "string" ? row.message : JSON.stringify(row),
      code: row.code,
      details: row.details,
      hint: row.hint,
    };
  }
  return { message: String(err) };
}

function errorMessage(err: unknown) {
  return serializeError(err).message || "Failed to send gift";
}

async function logGiftFailure(stage: string, err: unknown, ctx: Record<string, unknown>) {
  try {
    const { data } = await supabase.auth.getUser();
    const serialized = serializeError(err);
    await supabase.from("error_logs").insert({
      user_id: data?.user?.id ?? undefined,
      message: `[gift-send:${stage}] ${serialized.message}`.slice(0, 2000),
      stack: typeof serialized.stack === "string" ? serialized.stack.slice(0, 8000) : undefined,
      url: typeof window !== "undefined" ? window.location.href : undefined,
      source: "client",
      level: "error",
      metadata: JSON.parse(JSON.stringify({ stage, ...ctx, error: serialized })),
    });
  } catch {
    /* never throw from logger */
  }
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export function useGiftSend() {
  const [isSending, setIsSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const sendGift = async ({ gift, recipientId, postId, quantity, idempotencyKey, maxRetries = 2 }: SendArgs): Promise<GiftSendResult> => {
    setIsSending(true);
    setError(null);
    let lastErr: unknown = null;

    // Stable idempotency key per send — reused across retries so the server
    // can dedupe and never double-charge / double-send the same gift.
    const dedupeKey = idempotencyKey ?? makeGiftIdempotencyKey();

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        const { data, error: rpcError } = await supabase.rpc("send_royal_gift", {
          p_gift_id: gift.id,
          p_recipient_id: recipientId,
          p_post_id: postId ?? null,
          p_quantity: quantity,
          p_dedupe_key: dedupeKey,
        } as never);
        if (rpcError) throw rpcError;
        setIsSending(false);
        return data as GiftSendResult;
      } catch (e: unknown) {
        lastErr = e;
        const msg = errorMessage(e);
        await logGiftFailure(`attempt-${attempt}`, e, { giftId: gift.id, recipientId, postId, quantity, attempt, dedupeKey });
        if (isFatal(msg) || attempt === maxRetries) break;
        // Exponential backoff: 350ms, 900ms
        await sleep(350 * Math.pow(2.5, attempt));
      }
    }

    const raw = errorMessage(lastErr);
    const msg = friendlyMonetizationError("gift_send", lastErr ?? raw);
    setError(msg);
    setIsSending(false);
    throw new Error(msg);
  };

  const sendDmGift = async ({ gift, recipientId, quantity, idempotencyKey, maxRetries = 2 }: Omit<SendArgs, "postId">): Promise<{ success: boolean; transaction_id: string; message_id: string; total?: number; deduped?: boolean }> => {
    setIsSending(true);
    setError(null);
    let lastErr: unknown = null;
    const dedupeKey = idempotencyKey ?? makeGiftIdempotencyKey();

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        const { data, error: rpcError } = await supabase.rpc("send_dm_gift", {
          p_gift_id: gift.id,
          p_recipient_id: recipientId,
          p_quantity: quantity,
          p_dedupe_key: dedupeKey,
        } as never);
        if (rpcError) throw rpcError;
        setIsSending(false);
        return data as { success: boolean; transaction_id: string; message_id: string; total?: number; deduped?: boolean };
      } catch (e: unknown) {
        lastErr = e;
        const msg = errorMessage(e);
        await logGiftFailure(`dm-attempt-${attempt}`, e, { giftId: gift.id, recipientId, quantity, attempt, dedupeKey });
        if (isFatal(msg) || attempt === maxRetries) break;
        await sleep(350 * Math.pow(2.5, attempt));
      }
    }
    const raw = errorMessage(lastErr);
    const msg = friendlyMonetizationError("gift_send_dm", lastErr ?? raw);
    setError(msg);
    setIsSending(false);
    throw new Error(msg);
  };

  return { sendGift, sendDmGift, isSending, error };
}
