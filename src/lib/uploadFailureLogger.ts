import { supabase } from "@/integrations/supabase/client";

export type UploadFailureEvent =
  | "upload_validation_failed"
  | "storage_upload_failed"
  | "video_upload_failed"
  | "thumbnail_generation_failed"
  | "dm_attachment_upload_failed"
  | "verification_doc_upload_failed";

export type MonitoringEvent =
  | UploadFailureEvent
  | "stripe_webhook_failed"
  | "revenuecat_webhook_failed"
  | "checkout_failed"
  | "invoice_payment_failed"
  | "subscription_sync_failed"
  | "verification_checkout_failed"
  | "push_send_failed"
  | "notification_send_failed"
  | "realtime_reconnect"
  | "realtime_error"
  | "poll_fallback_active";

/**
 * Structured, admin-visible logger for infra/monitoring events.
 * Writes to `error_logs` with `metadata.event` set to a well-known tag.
 * Never throws — logging must never break user flows.
 */
export async function logMonitoringEvent(
  event: MonitoringEvent,
  message: string,
  context?: Record<string, unknown>,
): Promise<void> {
  try {
    const { data } = await supabase.auth.getUser();
    await supabase.from("error_logs").insert({
      user_id: data?.user?.id ?? undefined,
      message: (message || event).slice(0, 2000),
      source: "monitoring",
      level: "warn",
      url: typeof window !== "undefined" ? window.location.href : undefined,
      metadata: JSON.parse(
        JSON.stringify({ event, ...(context ?? {}) }),
      ),
    });
  } catch {
    /* swallow */
  }
}

export const logUploadFailure = (
  event: UploadFailureEvent,
  message: string,
  context?: Record<string, unknown>,
) => logMonitoringEvent(event, message, context);
