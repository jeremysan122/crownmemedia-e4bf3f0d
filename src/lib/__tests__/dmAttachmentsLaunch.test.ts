import { describe, it, expect, beforeEach, vi } from "vitest";
import { validateUpload, UPLOAD_RULES } from "@/lib/uploadValidation";
import { isRateLimitError, RATE_LIMIT_FRIENDLY_MESSAGE } from "@/lib/rateLimit";
import { toFriendlyMessage } from "@/lib/settingsSecurityErrors";

// Contract tests for the DM attachment launch scope. These lock the
// image-only 25MB policy and the friendly-error surface so a regression
// like "let's allow all mimes" or "surface raw storage errors" fails CI.

const mkFile = (size: number, type: string) => ({ size, type, name: "x" }) as File;

describe("dm_attachment launch scope", () => {
  it("preset is image-only at 25 MB", () => {
    expect(UPLOAD_RULES.dm_attachment.maxBytes).toBe(25 * 1024 * 1024);
    expect(UPLOAD_RULES.dm_attachment.mimeTypes).toEqual(
      expect.arrayContaining(["image/jpeg", "image/png", "image/webp"]),
    );
    // Launch scope: no video mimes allowed yet.
    expect(UPLOAD_RULES.dm_attachment.mimeTypes).not.toContain("video/mp4");
    expect(UPLOAD_RULES.dm_attachment.mimeTypes).not.toContain("video/webm");
  });

  it("accepts a small jpeg", () => {
    const r = validateUpload(mkFile(500_000, "image/jpeg"), "dm_attachment");
    expect(r.ok).toBe(true);
  });

  it("rejects a 30 MB image with friendly copy", () => {
    const r = validateUpload(mkFile(30 * 1024 * 1024, "image/png"), "dm_attachment");
    expect(r.ok).toBe(false);
    expect(r.message).toMatch(/too large/i);
    expect(r.message).toMatch(/25 MB/);
  });

  it("rejects video with friendly copy", () => {
    const r = validateUpload(mkFile(1_000_000, "video/mp4"), "dm_attachment");
    expect(r.ok).toBe(false);
    expect(r.message).toMatch(/Unsupported/i);
  });

  it("rejects pdf with friendly copy", () => {
    const r = validateUpload(mkFile(1_000_000, "application/pdf"), "dm_attachment");
    expect(r.ok).toBe(false);
  });

  it("rejects empty file", () => {
    const r = validateUpload(mkFile(0, "image/png"), "dm_attachment");
    expect(r.ok).toBe(false);
  });
});

describe("dm attachment failure surface never leaks raw storage errors", () => {
  it("rate-limit error is remapped to friendly copy", () => {
    const err = {
      code: "P0001",
      message: "You're doing that too fast. Try again soon.",
      hint: "rate_limit:message_hour",
    };
    expect(isRateLimitError(err)).toBe(true);
    expect(toFriendlyMessage(err, "generic")).toBe(RATE_LIMIT_FRIENDLY_MESSAGE);
  });

  it("blocked-user RLS insert failure never surfaces raw PostgREST text", () => {
    const err = {
      message: 'new row violates row-level security policy for table "messages"',
    };
    const out = toFriendlyMessage(err, "generic");
    expect(out).not.toMatch(/row-level|violates|messages|policy/i);
    expect(out).toMatch(/something went wrong|try again/i);
  });

  it("storage HTTP error never surfaces raw response body", () => {
    const raw = "HTTP 413: Payload Too Large";
    const out = toFriendlyMessage({ message: raw }, "generic");
    // We remap upload errors to "Couldn't upload attachment. Try again."
    // in the caller — here we assert toFriendlyMessage never returns raw
    // status text unchanged.
    expect(out).not.toContain("HTTP 413");
  });
});

// Ensure the friendly message contract used by the DM send catch block
// stays intact — a regression that changes copy or leaks details fails here.
describe("DM friendly copy contract", () => {
  it("generic mapping is safe and user-friendly", () => {
    expect(toFriendlyMessage(new Error("boom"), "generic")).toMatch(/try again/i);
  });
});

// Guard against future accidental widening of the picker's `accept` attr
// to a broader glob. We assert the source contains only the launch mimes.
describe("DM picker accept attribute", () => {
  it("Messages.tsx uses image-only accept attribute", async () => {
    const fs = await import("node:fs/promises");
    const src = await fs.readFile("src/pages/Messages.tsx", "utf8");
    expect(src).toContain('accept="image/jpeg,image/png,image/webp"');
    expect(src).not.toContain('accept="image/*,application/pdf');
  });
});

// Bus/refcount contract: 30 cards → 1 shared channel.
describe("postRealtimeBus refcount", () => {
  beforeEach(async () => {
    vi.resetModules();
  });

  it("opens a single channel for many subscribers and tears down on last unsubscribe", async () => {
    const removeChannel = vi.fn();
    const subscribeFn = vi.fn().mockReturnThis();
    const onFn = vi.fn().mockReturnThis();
    const channelFactory = vi.fn(() => ({ on: onFn, subscribe: subscribeFn, unsubscribe: vi.fn() }));

    vi.doMock("@/integrations/supabase/client", () => ({
      supabase: {
        channel: channelFactory,
        removeChannel,
      },
    }));

    const mod = await import("@/lib/postRealtimeBus");
    mod.__resetBusForTests();

    const unsubs = Array.from({ length: 30 }, (_, i) =>
      mod.subscribePost(`post-${i}`, () => {}),
    );
    expect(channelFactory).toHaveBeenCalledTimes(1);
    expect(mod.__busStatsForTests().subscribers).toBe(30);
    expect(mod.__busStatsForTests().hasChannel).toBe(true);

    unsubs.forEach((u) => u());
    expect(mod.__busStatsForTests().subscribers).toBe(0);
    expect(mod.__busStatsForTests().hasChannel).toBe(false);
    expect(removeChannel).toHaveBeenCalledTimes(1);
  });
});
