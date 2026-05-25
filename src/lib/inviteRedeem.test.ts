/**
 * Unit tests for the client-side invite redemption helper. Covers:
 *   - Capturing ?ref=CODE from the URL into localStorage
 *   - Auto-redeem with successful reward
 *   - Auto-redeem with already_redeemed
 *   - Self-invite & not-found error handling (no toast spam)
 *   - Double redemption guard (ATTEMPT_KEY) — only runs once per code
 */
import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";

// Mock the supabase client BEFORE importing the helper
const rpcMock = vi.fn();
vi.mock("@/integrations/supabase/client", () => ({
  supabase: { rpc: (...args: unknown[]) => rpcMock(...args) },
}));

const toastSuccess = vi.fn();
const toastInfo = vi.fn();
const toastError = vi.fn();
vi.mock("sonner", () => ({
  toast: {
    success: (...a: unknown[]) => toastSuccess(...a),
    info:    (...a: unknown[]) => toastInfo(...a),
    error:   (...a: unknown[]) => toastError(...a),
  },
}));

import {
  captureRefFromUrl,
  redeemPendingInvite,
  clearPendingRef,
  getPendingRef,
  PER_SIGNUP_SHEKELS,
  PASS_BONUS_DAYS,
} from "@/lib/inviteRedeem";

beforeEach(() => {
  localStorage.clear();
  rpcMock.mockReset();
  toastSuccess.mockReset();
  toastInfo.mockReset();
  toastError.mockReset();
});

afterEach(() => { localStorage.clear(); });

describe("captureRefFromUrl", () => {
  it("stores a valid code uppercased", () => {
    expect(captureRefFromUrl("?ref=abcd1234")).toBe("ABCD1234");
    expect(getPendingRef()).toBe("ABCD1234");
  });

  it("rejects too-short codes", () => {
    expect(captureRefFromUrl("?ref=ab")).toBeNull();
    expect(getPendingRef()).toBeNull();
  });

  it("returns null when no ref param", () => {
    expect(captureRefFromUrl("?other=1")).toBeNull();
  });

  it("clears prior attempt flag when a NEW ref arrives", () => {
    localStorage.setItem("crownme_invite_ref", "OLDCODE0");
    localStorage.setItem("crownme_invite_ref_attempted", "OLDCODE0");
    captureRefFromUrl("?ref=NEWCODE0");
    expect(localStorage.getItem("crownme_invite_ref_attempted")).toBeNull();
  });
});

describe("redeemPendingInvite", () => {
  it("returns null when no pending code", async () => {
    const r = await redeemPendingInvite();
    expect(r).toBeNull();
    expect(rpcMock).not.toHaveBeenCalled();
  });

  it("calls RPC, shows success toast, and clears the pending code", async () => {
    captureRefFromUrl("?ref=ABCD1234");
    rpcMock.mockResolvedValue({
      data: { ok: true, shekels_awarded: PER_SIGNUP_SHEKELS },
      error: null,
    });

    const r = await redeemPendingInvite();
    expect(r?.ok).toBe(true);
    expect(rpcMock).toHaveBeenCalledWith("redeem_invite_code", { _code: "ABCD1234" });
    expect(toastSuccess).toHaveBeenCalledTimes(1);
    const [title, opts] = toastSuccess.mock.calls[0];
    expect(String(title)).toContain(`+${PER_SIGNUP_SHEKELS}`);
    expect(String((opts as { description?: string })?.description ?? "")).toContain(`${PASS_BONUS_DAYS}`);
    expect(getPendingRef()).toBeNull();
  });

  it("shows info toast for already_redeemed", async () => {
    captureRefFromUrl("?ref=ABCD1234");
    rpcMock.mockResolvedValue({ data: { ok: true, already_redeemed: true }, error: null });

    await redeemPendingInvite();
    expect(toastInfo).toHaveBeenCalledTimes(1);
    expect(toastSuccess).not.toHaveBeenCalled();
  });

  it("does NOT call the RPC twice within the same render cycle (no re-capture)", async () => {
    captureRefFromUrl("?ref=ABCD1234");
    rpcMock.mockResolvedValue({ data: { ok: true, shekels_awarded: 200 }, error: null });

    await redeemPendingInvite();
    // Second call without re-capturing (e.g. a re-render) is a no-op
    await redeemPendingInvite();
    expect(rpcMock).toHaveBeenCalledTimes(1);
  });

  it("handles self-invite error with a clear toast and stops retrying", async () => {
    captureRefFromUrl("?ref=ABCD1234");
    rpcMock.mockResolvedValue({ data: null, error: { message: "You cannot invite yourself" } });

    await redeemPendingInvite();
    expect(toastError).toHaveBeenCalledTimes(1);
    expect(getPendingRef()).toBeNull();

    // Subsequent call is a no-op
    await redeemPendingInvite();
    expect(rpcMock).toHaveBeenCalledTimes(1);
  });

  it("handles 'not found' error", async () => {
    captureRefFromUrl("?ref=BADCODE0");
    rpcMock.mockResolvedValue({ data: null, error: { message: "Invite code not found" } });

    await redeemPendingInvite();
    expect(toastError).toHaveBeenCalledTimes(1);
    const [msg] = toastError.mock.calls[0];
    expect(String(msg).toLowerCase()).toContain("no longer valid");
  });

  it("silent mode suppresses all toasts", async () => {
    captureRefFromUrl("?ref=ABCD1234");
    rpcMock.mockResolvedValue({ data: { ok: true, shekels_awarded: 200 }, error: null });
    await redeemPendingInvite({ silent: true });
    expect(toastSuccess).not.toHaveBeenCalled();
    expect(toastInfo).not.toHaveBeenCalled();
    expect(toastError).not.toHaveBeenCalled();
  });
});

describe("clearPendingRef", () => {
  it("removes both ref and attempt flags", () => {
    localStorage.setItem("crownme_invite_ref", "X");
    localStorage.setItem("crownme_invite_ref_attempted", "X");
    clearPendingRef();
    expect(localStorage.getItem("crownme_invite_ref")).toBeNull();
    expect(localStorage.getItem("crownme_invite_ref_attempted")).toBeNull();
  });
});
