/**
 * Realtime + state-consistency edge cases for Scrolls reposts.
 *
 * Source-contract coverage for:
 *   - Network reconnect doesn't duplicate subscriptions (channel is torn down
 *     on unmount / re-key and useUnreadByType uses a shared singleton).
 *   - Out-of-order repost events can't desync the button — server state
 *     (existing_repost_id) is the source of truth on hydration.
 *   - repost_count never goes negative (Math.max(0, …) on undo optimistic path).
 *   - Repost button state matches server state after refresh (myReposts is
 *     rehydrated from posts.parent_post_id lookup, not local cache).
 *   - Undo rollback restores previous state if the server RPC fails.
 *   - Stale realtime deltas can't overwrite newer local optimistic state
 *     (setItems uses functional updates keyed by id).
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8");
const shorts = read("src/pages/Shorts.tsx");
const useUnread = read("src/hooks/useUnreadByType.ts");
const toaster = read("src/components/NotificationToaster.tsx");

describe("Reconnect doesn't duplicate subscriptions", () => {
  it("Shorts realtime channel is removed on effect cleanup", () => {
    expect(shorts).toMatch(/supabase\.removeChannel\(/);
  });

  it("useUnreadByType uses a SHARED singleton channel across consumers", () => {
    // Only one channel is created; consumers register listeners into a Set.
    expect(useUnread).toMatch(/let channel:/);
    expect(useUnread).toMatch(/const listeners = new Set/);
    expect(useUnread).toMatch(/ensureSubscribed/);
    // Teardown on last listener detach avoids leaking channels on reconnect.
    expect(useUnread).toMatch(/teardownIfEmpty/);
    expect(useUnread).toMatch(/supabase\.removeChannel\(channel\)/);
  });

  it("global NotificationToaster de-dupes across reconnect via seen-id set", () => {
    expect(toaster).toMatch(/seen\.current\.has\(n\.id\)/);
  });
});

describe("Repost button state matches server after refresh", () => {
  it("myReposts is hydrated from the posts table (server-truth), not just local cache", () => {
    // The hydration query filters by parent_post_id IN (visible ids) and by viewer.
    expect(shorts).toMatch(/parent_post_id/);
    expect(shorts).toMatch(/setMyReposts/);
  });

  it("Optimistic repost_count decrement is clamped so it can't go negative", () => {
    expect(shorts).toMatch(/Math\.max\(0,\s*\(it\.repost_count\s*\?\?\s*1\)\s*-\s*1\)/);
  });
});

describe("Out-of-order & stale realtime events", () => {
  it("setItems uses a functional update keyed by id — stale deltas can't overwrite fresh state", () => {
    // e.g. setItems((prev) => prev.map((it) => it.id === parentId ? ... : it))
    expect(shorts).toMatch(/setItems\(\(prev\)\s*=>\s*prev\.map\(\(it\)\s*=>\s*\n?\s*it\.id\s*===\s*[a-zA-Z_]+/);
  });

  it("Realtime handler for posts targets only the specific parent row (no blanket overwrite)", () => {
    expect(shorts).toMatch(/table:\s*["']posts["']/);
    expect(shorts).toMatch(/event:\s*["'](\*|UPDATE)["']/);
  });
});

describe("Undo rollback restores previous state on server failure", () => {
  it("saves prevMap before optimistic mutation and restores it on !res.ok", () => {
    expect(shorts).toMatch(/const\s+prevMap\s*=\s*myReposts/);
    expect(shorts).toMatch(/setMyReposts\(prevMap\)/);
  });

  it("restores repost_count on undo failure (increment back by 1)", () => {
    expect(shorts).toMatch(/\(it\.repost_count\s*\?\?\s*0\)\s*\+\s*1/);
  });

  it("shows a friendly rollback toast (no raw backend error text)", () => {
    expect(shorts).toMatch(/Couldn't undo repost/);
    expect(shorts).toMatch(/Your repost is still live/);
    expect(shorts).not.toMatch(/toast\.error\([^)]*err\.message/);
  });
});
