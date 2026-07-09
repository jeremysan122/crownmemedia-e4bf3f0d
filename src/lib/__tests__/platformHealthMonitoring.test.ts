import { describe, it, expect, vi, beforeEach } from "vitest";

const insertMock = vi.fn((..._args: unknown[]) => Promise.resolve({ data: null, error: null }));
const rpcMock = vi.fn((..._args: unknown[]) => Promise.resolve({ data: null as unknown, error: null as unknown }));
const fromMock = vi.fn((..._args: unknown[]) => ({
  insert: insertMock,
  select: vi.fn().mockReturnThis(),
  gte: vi.fn().mockReturnThis(),
  in: vi.fn().mockReturnThis(),
  order: vi.fn().mockReturnThis(),
  limit: vi.fn().mockResolvedValue({ data: [], error: null }),
}));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    auth: { getUser: () => Promise.resolve({ data: { user: { id: "u1" } } }) },
    from: (t: string) => fromMock(t),
    rpc: (name: string, args?: unknown) => rpcMock(name, args),
  },
}));

beforeEach(() => {
  insertMock.mockClear();
  rpcMock.mockReset();
  fromMock.mockClear();
});

describe("Batch D monitoring", () => {
  it("logUploadFailure writes to error_logs with event tag", async () => {
    const { logUploadFailure } = await import("@/lib/uploadFailureLogger");
    await logUploadFailure("storage_upload_failed", "boom", { where: "test" });
    expect(fromMock).toHaveBeenCalledWith("error_logs");
    expect(insertMock).toHaveBeenCalledTimes(1);
    const row = (insertMock.mock.calls[0] as unknown[])[0] as { source: string; level: string; metadata: { event: string; where: string } };
    expect(row.source).toBe("monitoring");
    expect(row.level).toBe("warn");
    expect(row.metadata.event).toBe("storage_upload_failed");
    expect(row.metadata.where).toBe("test");
  });

  it("logMonitoringEvent handles all monitoring events without throwing", async () => {
    const { logMonitoringEvent } = await import("@/lib/uploadFailureLogger");
    const events = [
      "stripe_webhook_failed",
      "push_send_failed",
      "realtime_reconnect",
      "poll_fallback_active",
    ] as const;
    for (const e of events) {
      await expect(logMonitoringEvent(e, `msg-${e}`)).resolves.toBeUndefined();
    }
    expect(insertMock).toHaveBeenCalledTimes(events.length);
  });

  it("fetchPlatformHealthSummary calls the admin RPC and normalizes shape", async () => {
    rpcMock.mockResolvedValueOnce({
      data: { upload_failures_24h: 3, webhook_failures_24h: 1 },
      error: null,
    });
    const { fetchPlatformHealthSummary } = await import("@/lib/platformHealthQueries");
    const res = await fetchPlatformHealthSummary();
    expect(rpcMock).toHaveBeenCalledWith("admin_platform_health_summary", undefined);
    expect(res.error).toBeNull();
    expect(res.data.upload_failures_24h).toBe(3);
    expect(res.data.webhook_failures_24h).toBe(1);
    // Defaults still populated for missing fields
    expect(res.data.email_failed_24h).toBe(0);
    expect(res.data.realtime_reconnects_24h).toBe(0);
  });

  it("fetchPlatformHealthSummary surfaces friendly error string, never throws", async () => {
    rpcMock.mockResolvedValueOnce({ data: null, error: { message: "not_authorized" } });
    const { fetchPlatformHealthSummary } = await import("@/lib/platformHealthQueries");
    const res = await fetchPlatformHealthSummary();
    expect(res.error).toBe("not_authorized");
    // Data is empty summary, not undefined — no raw backend error rendered
    expect(res.data.upload_failures_24h).toBe(0);
  });

  it("fetchStorageUsage returns array via admin RPC", async () => {
    rpcMock.mockResolvedValueOnce({
      data: [{ bucket_id: "avatars", object_count: 5, total_bytes: 1000, last_upload: null }],
      error: null,
    });
    const { fetchStorageUsage } = await import("@/lib/platformHealthQueries");
    const res = await fetchStorageUsage();
    expect(rpcMock).toHaveBeenCalledWith("admin_storage_usage", undefined);
    expect(res.data).toHaveLength(1);
    expect(res.data[0].bucket_id).toBe("avatars");
  });

  it("TRACKED_BUCKETS covers all launch-scope buckets", async () => {
    const { TRACKED_BUCKETS } = await import("@/lib/platformHealthQueries");
    for (const b of ["avatars", "banners", "share-cards", "posts", "dm-attachments", "verification-docs", "evidence"]) {
      expect(TRACKED_BUCKETS).toContain(b);
    }
  });

  it("formatBytes renders human-readable sizes", async () => {
    const { formatBytes } = await import("@/lib/platformHealthQueries");
    expect(formatBytes(0)).toBe("0 B");
    expect(formatBytes(1024)).toBe("1.0 KB");
    expect(formatBytes(5 * 1024 * 1024)).toBe("5.0 MB");
  });
});
