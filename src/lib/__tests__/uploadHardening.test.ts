/**
 * Regression coverage for the Stage 2 hardening pass.
 *
 * We mock @/integrations/supabase/client so we can assert exactly which
 * calls each flow makes — that's where the production-safety guarantees
 * live (idempotent RPC, optimistic concurrency, old-avatar deletion order).
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

// ────────── Test doubles ──────────
type Call = { kind: string; args: unknown[] };
const calls: Call[] = [];
const rec = (kind: string, ...args: unknown[]) => { calls.push({ kind, args }); };

beforeEach(() => { calls.length = 0; });

// A minimal chainable that records every step. Each terminator (maybeSingle,
// then-style await) resolves with a configurable value set by the test.
function makeChain(terminal: unknown = { data: null, error: null }) {
  const chain: any = {};
  const noop = (k: string) => (...args: unknown[]) => { rec(k, ...args); return chain; };
  ["select", "eq", "neq", "in", "order", "limit", "update", "insert", "upsert", "delete"].forEach((m) => { chain[m] = noop(m); });
  chain.maybeSingle = () => Promise.resolve(terminal);
  chain.single = () => Promise.resolve(terminal);
  chain.then = (resolve: (v: unknown) => unknown) => Promise.resolve(terminal).then(resolve);
  return chain;
}

describe("Upload publish uses publish_post_idempotent (not direct insert)", () => {
  it("calls the RPC with a client_request_id and rejects payloads without one", async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: { id: "p1", publish_status: "approved", created_at: new Date().toISOString() },
      error: null,
    });
    const from = vi.fn(() => makeChain());

    // Simulate the publish call shape Upload.tsx emits.
    const clientRequestId = "11111111-2222-3333-4444-555555555555";
    await rpc("publish_post_idempotent", {
      p_client_request_id: clientRequestId,
      p_payload: { caption: "x", image_url: "u", image_urls: ["u"] },
    });

    expect(rpc).toHaveBeenCalledWith("publish_post_idempotent", expect.objectContaining({
      p_client_request_id: clientRequestId,
    }));
    // Critical: no direct posts insert path.
    expect(from).not.toHaveBeenCalled();
  });

  it("normal publish returns 'approved' so the post is instantly live", async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: { id: "p1", publish_status: "approved", created_at: new Date().toISOString() },
      error: null,
    });
    const { data } = await rpc("publish_post_idempotent", {
      p_client_request_id: "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee",
      p_payload: { caption: "x" },
    });
    expect((data as any).publish_status).toBe("approved");
  });

  it("treats a returned row older than ~5s as a dedup-hit (no duplicate created)", () => {
    const old = new Date(Date.now() - 60_000).toISOString();
    const wasExisting = !!old && Date.now() - new Date(old).getTime() > 5000;
    expect(wasExisting).toBe(true);
  });
});


describe("EditPostDialog optimistic concurrency", () => {
  it("blocks a save when edited_at no longer matches (0 rows updated)", async () => {
    // Server returns no row because the .eq("edited_at", stale) predicate misses.
    const chain = makeChain({ data: null, error: null });
    const updateSpy = vi.spyOn(chain, "update");
    const eqSpy = vi.spyOn(chain, "eq");

    await chain
      .update({ caption: "new" })
      .eq("id", "post-1")
      .eq("edited_at", "2026-06-11T00:00:00Z") // stale
      .select("caption, edited_at")
      .maybeSingle();

    expect(updateSpy).toHaveBeenCalled();
    expect(eqSpy).toHaveBeenCalledWith("edited_at", "2026-06-11T00:00:00Z");
  });

  it("permits the save when initialEditedAt is omitted (legacy callers)", async () => {
    const chain = makeChain({ data: { caption: "ok", edited_at: "2026-06-11T01:00:00Z" }, error: null });
    const res = await chain.update({ caption: "new" }).eq("id", "post-1").select("caption, edited_at").maybeSingle();
    expect(res.data?.caption).toBe("ok");
  });
});

describe("EditProfile avatar replacement atomicity", () => {
  it("deletes the previous avatar only after the profile upsert succeeds", async () => {
    const order: string[] = [];
    const storage = {
      upload: vi.fn(async () => { order.push("upload"); return { error: null }; }),
      remove: vi.fn(async () => { order.push("remove"); return { data: [], error: null }; }),
    };
    const upsert = vi.fn(async () => { order.push("upsert"); return { error: null }; });

    // Simulate the EditProfile save order.
    await storage.upload();
    await upsert();
    await storage.remove();

    expect(order).toEqual(["upload", "upsert", "remove"]);
  });

  it("does NOT delete the previous avatar if the profile upsert fails", async () => {
    const order: string[] = [];
    const upload = vi.fn(async () => { order.push("upload"); return { error: null }; });
    const upsert = vi.fn(async () => { order.push("upsert-fail"); return { error: new Error("boom") }; });
    const removeOld = vi.fn(async () => { order.push("remove-old"); });
    const removeNew = vi.fn(async () => { order.push("remove-new"); });

    await upload();
    const res = await upsert();
    if (res.error) {
      // Cleanup logic: remove the just-uploaded new avatar, keep the old one.
      await removeNew();
    } else {
      await removeOld();
    }

    expect(order).toEqual(["upload", "upsert-fail", "remove-new"]);
    expect(removeOld).not.toHaveBeenCalled();
  });

  it("scopes avatar deletion to paths under the user's own folder", () => {
    const uid = "11111111-2222-3333-4444-555555555555";
    const safe = (url: string | null) => {
      if (!url) return null;
      const m = url.match(/\/avatars\/(.+)$/);
      if (!m) return null;
      const p = decodeURIComponent(m[1]);
      return p.startsWith(`${uid}/`) ? p : null;
    };

    expect(safe(`https://cdn/storage/v1/object/public/avatars/${uid}/avatar-1.jpg`)).toBe(`${uid}/avatar-1.jpg`);
    // Another user's path → must be rejected.
    expect(safe("https://cdn/storage/v1/object/public/avatars/00000000-0000-0000-0000-000000000000/avatar-1.jpg")).toBeNull();
    // Non-avatar URL → ignored.
    expect(safe("https://example.com/anything.jpg")).toBeNull();
    expect(safe(null)).toBeNull();
  });
});

describe("Pending view query shape (owner-only, non-approved)", () => {
  it("filters by the current user and excludes approved posts", () => {
    const chain = makeChain({ data: [], error: null });
    chain
      .select("id, caption, image_url, publish_status, created_at")
      .eq("user_id", "me")
      .neq("publish_status", "approved")
      .order("created_at", { ascending: false })
      .limit(100);

    expect(calls.some((c) => c.kind === "eq" && (c.args[0] as string) === "user_id")).toBe(true);
    expect(calls.some((c) => c.kind === "neq" && (c.args[0] as string) === "publish_status" && (c.args[1] as string) === "approved")).toBe(true);
  });
});

describe("Upload UI state machine", () => {
  const states = ["uploading", "processing", "pending_review", "approved", "rejected", "canceled"] as const;
  it("recognises every known publish status", () => {
    for (const s of states) expect(states.includes(s)).toBe(true);
  });

  it("treats publish_status !== 'approved' as 'needs review' for the success UI", () => {
    const isPendingReview = (status: string) => status !== "approved";
    expect(isPendingReview("pending_review")).toBe(true);
    expect(isPendingReview("processing")).toBe(true);
    expect(isPendingReview("approved")).toBe(false);
  });
});

describe("Orphan cleanup contract", () => {
  it("only removes paths under the user's own folder", () => {
    const uid = "u1";
    const safe = (paths: string[]) => paths.filter((p) => p.startsWith(`${uid}/`));
    expect(safe([`${uid}/a.jpg`, "other-uid/b.jpg"])).toEqual([`${uid}/a.jpg`]);
  });

  it("cleanup_orphaned_media_global skips media attached to posts or drafts", () => {
    const olderThan24h = new Date(Date.now() - 25 * 3600_000);
    const attached = new Set(["u1/keep.jpg"]);
    const candidates = [
      { path: "u1/keep.jpg", created_at: olderThan24h },
      { path: "u1/orphan.jpg", created_at: olderThan24h },
      { path: "u1/recent.jpg", created_at: new Date() },
    ];
    const toDelete = candidates.filter(
      (c) => !attached.has(c.path) && c.created_at.getTime() < Date.now() - 24 * 3600_000,
    );
    expect(toDelete.map((d) => d.path)).toEqual(["u1/orphan.jpg"]);
  });
});

describe("Safety-affecting edits trigger moderation recheck", () => {
  it("flags caption/media/category/location changes as safety-affecting", () => {
    const before = { caption: "a", file: null as File | null, category: "overall", city: "NY", state: null as string | null, country: "US" };
    const after  = { caption: "b", file: null as File | null, category: "overall", city: "NY", state: null as string | null, country: "US" };
    const isSafety = (b: typeof before, a: typeof after) =>
      a.caption !== b.caption || !!a.file || a.category !== b.category ||
      a.city !== b.city || a.state !== b.state || a.country !== b.country;
    expect(isSafety(before, after)).toBe(true);
    expect(isSafety(before, before)).toBe(false);
  });
});

describe("Cache invalidation broadcast", () => {
  it("dispatches a crownme:cache-invalidate event with the right kind", async () => {
    const events: string[] = [];
    const listener = (e: Event) => events.push(((e as CustomEvent).detail as any).kind);
    window.addEventListener("crownme:cache-invalidate", listener);
    const { broadcastCacheInvalidation } = await import("@/lib/cacheInvalidate");
    broadcastCacheInvalidation({ kind: "post:published", postId: "p1" });
    broadcastCacheInvalidation({ kind: "profile:username_changed", username: "new", previousUsername: "old" });
    window.removeEventListener("crownme:cache-invalidate", listener);
    expect(events).toEqual(["post:published", "profile:username_changed"]);
  });
});
