import { describe, it, expect, vi, beforeEach } from "vitest";

const rpcMock = vi.fn();
vi.mock("@/integrations/supabase/client", () => ({
  supabase: { rpc: (...args: any[]) => rpcMock(...args) },
}));

import {
  checkRepostEligibility,
  createRepost,
  friendlyRepostMessage,
  RETRYABLE_REPOST_CODES,
} from "../repost";

const REQ = "00000000-0000-4000-8000-000000000001";
const PARENT = "00000000-0000-4000-8000-000000000010";

beforeEach(() => rpcMock.mockReset());

describe("checkRepostEligibility", () => {
  it("returns eligible result with normalized category", async () => {
    rpcMock.mockResolvedValueOnce({
      data: { eligible: true, code: "ok", main_category_slug: "royal-crowns", subcategory_slug: "overall-crown" },
      error: null,
    });
    const r = await checkRepostEligibility(PARENT);
    expect(r.eligible).toBe(true);
    expect(r.main_category_slug).toBe("royal-crowns");
    expect(r.subcategory_slug).toBe("overall-crown");
  });

  it("maps blocked-user response", async () => {
    rpcMock.mockResolvedValueOnce({
      data: { eligible: false, code: "blocked", reason: "This user is unavailable." },
      error: null,
    });
    const r = await checkRepostEligibility(PARENT);
    expect(r.eligible).toBe(false);
    expect(r.code).toBe("blocked");
  });

  it("treats RPC error as network_error", async () => {
    rpcMock.mockResolvedValueOnce({ data: null, error: { message: "boom" } });
    const r = await checkRepostEligibility(PARENT);
    expect(r.eligible).toBe(false);
    expect(r.code).toBe("network_error");
  });

  it("surfaces already_reposted with existing id", async () => {
    rpcMock.mockResolvedValueOnce({
      data: { eligible: false, code: "already_reposted", existing_repost_id: "abc" },
      error: null,
    });
    const r = await checkRepostEligibility(PARENT);
    expect(r.code).toBe("already_reposted");
    expect(r.existing_repost_id).toBe("abc");
  });
});

describe("createRepost", () => {
  it("returns created repost id on success", async () => {
    rpcMock.mockResolvedValueOnce({
      data: { ok: true, code: "created", repost_id: "rp-1" },
      error: null,
    });
    const r = await createRepost({ parentPostId: PARENT, requestId: REQ, caption: "nice" });
    expect(r.ok).toBe(true);
    expect(r.repostId).toBe("rp-1");
    expect(r.retryable).toBe(false);
  });

  it("marks idempotent replay as ok with same repost id", async () => {
    rpcMock.mockResolvedValueOnce({
      data: { ok: true, code: "idempotent_replay", repost_id: "rp-1" },
      error: null,
    });
    const r = await createRepost({ parentPostId: PARENT, requestId: REQ });
    expect(r.ok).toBe(true);
    expect(r.code).toBe("idempotent_replay");
  });

  it("flags category_invalid as non-retryable", async () => {
    rpcMock.mockResolvedValueOnce({
      data: { ok: false, code: "category_invalid", message: "Category is no longer supported." },
      error: null,
    });
    const r = await createRepost({ parentPostId: PARENT, requestId: REQ });
    expect(r.ok).toBe(false);
    expect(r.retryable).toBe(false);
  });

  it("flags insert_failed as retryable", async () => {
    rpcMock.mockResolvedValueOnce({
      data: { ok: false, code: "insert_failed" },
      error: null,
    });
    const r = await createRepost({ parentPostId: PARENT, requestId: REQ });
    expect(r.retryable).toBe(true);
    expect(RETRYABLE_REPOST_CODES.has("insert_failed")).toBe(true);
  });

  it("converts transport errors to retryable network_error", async () => {
    rpcMock.mockResolvedValueOnce({ data: null, error: { message: "fetch failed" } });
    const r = await createRepost({ parentPostId: PARENT, requestId: REQ });
    expect(r.code).toBe("network_error");
    expect(r.retryable).toBe(true);
  });

  it("blocks own_post permanently (non-retryable)", async () => {
    rpcMock.mockResolvedValueOnce({
      data: { ok: false, code: "own_post" },
      error: null,
    });
    const r = await createRepost({ parentPostId: PARENT, requestId: REQ });
    expect(r.retryable).toBe(false);
  });

  it("sends the same request_id across retries (idempotency contract)", async () => {
    rpcMock.mockResolvedValue({ data: { ok: true, code: "created", repost_id: "rp-x" }, error: null });
    await createRepost({ parentPostId: PARENT, requestId: REQ });
    await createRepost({ parentPostId: PARENT, requestId: REQ });
    const calls = rpcMock.mock.calls;
    expect(calls[0][1].p_request_id).toBe(REQ);
    expect(calls[1][1].p_request_id).toBe(REQ);
  });
});

describe("friendlyRepostMessage", () => {
  it("uses known mapping over fallback", () => {
    expect(friendlyRepostMessage("blocked", "raw db error")).toBe("This user is unavailable.");
  });
  it("falls back when code is unknown", () => {
    expect(friendlyRepostMessage("weird_code", "Backup msg")).toBe("Backup msg");
  });
  it("never leaks raw error when no fallback provided", () => {
    expect(friendlyRepostMessage(undefined)).toMatch(/went wrong/i);
  });
});
