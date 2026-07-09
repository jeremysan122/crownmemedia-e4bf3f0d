import { supabase } from "@/integrations/supabase/client";

export interface PlatformHealthSummary {
  upload_failures_24h: number;
  webhook_failures_24h: number;
  email_failed_24h: number;
  email_pending_over_5m: number;
  oldest_pending_email_age_seconds: number;
  push_failures_24h: number;
  realtime_errors_24h: number;
  realtime_reconnects_24h: number;
  captured_at: string;
}

const EMPTY_SUMMARY: PlatformHealthSummary = {
  upload_failures_24h: 0,
  webhook_failures_24h: 0,
  email_failed_24h: 0,
  email_pending_over_5m: 0,
  oldest_pending_email_age_seconds: 0,
  push_failures_24h: 0,
  realtime_errors_24h: 0,
  realtime_reconnects_24h: 0,
  captured_at: new Date(0).toISOString(),
};

export async function fetchPlatformHealthSummary(): Promise<{
  data: PlatformHealthSummary;
  error: string | null;
}> {
  try {
    const { data, error } = await supabase.rpc("admin_platform_health_summary" as never);
    if (error) return { data: EMPTY_SUMMARY, error: error.message };
    return { data: { ...EMPTY_SUMMARY, ...(data as object) }, error: null };
  } catch (e) {
    return { data: EMPTY_SUMMARY, error: (e as Error)?.message ?? "Query failed" };
  }
}

export interface StorageBucketUsage {
  bucket_id: string;
  object_count: number;
  total_bytes: number;
  last_upload: string | null;
}

export async function fetchStorageUsage(): Promise<{
  data: StorageBucketUsage[];
  error: string | null;
}> {
  try {
    const { data, error } = await supabase.rpc("admin_storage_usage" as never);
    if (error) return { data: [], error: error.message };
    return { data: (data as StorageBucketUsage[]) ?? [], error: null };
  } catch (e) {
    return { data: [], error: (e as Error)?.message ?? "Query failed" };
  }
}

export const TRACKED_BUCKETS = [
  "avatars",
  "banners",
  "share-cards",
  "posts",
  "media",
  "dm-attachments",
  "verification-docs",
  "evidence",
] as const;

export async function fetchUploadFailureBreakdown(hours = 24) {
  const since = new Date(Date.now() - hours * 3600_000).toISOString();
  const { data, error } = await supabase
    .from("error_logs")
    .select("id, message, metadata, created_at")
    .gte("created_at", since)
    .in("metadata->>event", [
      "upload_validation_failed",
      "storage_upload_failed",
      "video_upload_failed",
      "thumbnail_generation_failed",
      "dm_attachment_upload_failed",
      "verification_doc_upload_failed",
    ] as never)
    .order("created_at", { ascending: false })
    .limit(50);
  return { data: data ?? [], error: error?.message ?? null };
}

export async function fetchWebhookFailures(hours = 24) {
  const since = new Date(Date.now() - hours * 3600_000).toISOString();
  const { data, error } = await supabase
    .from("error_logs")
    .select("id, message, metadata, created_at")
    .gte("created_at", since)
    .in("metadata->>event", [
      "stripe_webhook_failed",
      "revenuecat_webhook_failed",
      "checkout_failed",
      "invoice_payment_failed",
      "subscription_sync_failed",
      "verification_checkout_failed",
    ] as never)
    .order("created_at", { ascending: false })
    .limit(50);
  return { data: data ?? [], error: error?.message ?? null };
}

export function formatBytes(n: number): string {
  if (!n || n <= 0) return "0 B";
  const u = ["B", "KB", "MB", "GB", "TB"];
  let i = 0;
  let v = n;
  while (v >= 1024 && i < u.length - 1) {
    v /= 1024;
    i++;
  }
  return `${v.toFixed(v >= 10 || i === 0 ? 0 : 1)} ${u[i]}`;
}
