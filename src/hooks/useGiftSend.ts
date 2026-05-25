import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { RoyalGift } from "@/types/gifts";

interface SendArgs {
  gift: RoyalGift;
  recipientId: string;
  postId?: string;
  quantity: number;
}

export function useGiftSend() {
  const [isSending, setIsSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const sendGift = async ({ gift, recipientId, postId, quantity }: SendArgs) => {
    setIsSending(true);
    setError(null);
    try {
      const { data, error: rpcError } = await supabase.rpc("send_royal_gift", {
        p_gift_id: gift.id,
        p_recipient_id: recipientId,
        p_post_id: postId ?? null,
        p_quantity: quantity,
      });
      if (rpcError) throw rpcError;
      return data as { success: boolean; transaction_id: string; total: number };
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Failed to send gift";
      setError(msg);
      throw e;
    } finally {
      setIsSending(false);
    }
  };

  return { sendGift, isSending, error };
}
