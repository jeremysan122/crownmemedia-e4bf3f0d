/**
 * Wave 7 — viewer safety hook integration tests.
 *
 * Verifies the hook loads blocklist + muted-words from Supabase and that
 * blockUser / unblockUser / muteWord issue the right table writes.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";

const calls: Array<{ table: string; op: string; args?: any; payload?: any }> = [];

vi.mock("@/context/AuthContext", () => ({
  useAuth: () => ({ user: { id: "viewer-1" } }),
}));

vi.mock("@/integrations/supabase/client", () => {
  const makeQuery = (table: string) => {
    const state: any = { table, filters: {} as Record<string, any> };
    const q: any = {
      select(_cols: string) {
        state.op = "select";
        return q;
      },
      eq(col: string, val: any) {
        state.filters[col] = val;
        // resolve on await if this is a select
        if (state.op === "select") {
          return {
            eq: q.eq,
            then: (r: any) => {
              calls.push({ table, op: "select", args: { ...state.filters } });
              if (table === "blocks") {
                return Promise.resolve({ data: [{ blocked_id: "bad-1" }, { blocked_id: "bad-2" }] }).then(r);
              }
              if (table === "muted_words") {
                return Promise.resolve({ data: [{ word: "spoiler" }, { word: "  YELL " }] }).then(r);
              }
              return Promise.resolve({ data: [] }).then(r);
            },
          };
        }
        if (state.op === "delete") {
          if (Object.keys(state.filters).length === 2) {
            calls.push({ table, op: "delete", args: { ...state.filters } });
            return Promise.resolve({ error: null });
          }
        }
        return q;
      },
      insert(payload: any) {
        calls.push({ table, op: "insert", payload });
        return Promise.resolve({ error: null });
      },
      delete() {
        state.op = "delete";
        return q;
      },
      then(r: any) {
        if (state.op === "select") {
          calls.push({ table, op: "select", args: { ...state.filters } });
          return Promise.resolve({ data: [] }).then(r);
        }
        return Promise.resolve({ error: null }).then(r);
      },
    };
    return q;
  };
  return {
    supabase: {
      from: (table: string) => makeQuery(table),
    },
  };
});

// Import AFTER mocks are registered.
import { useViewerSafety } from "@/hooks/useViewerSafety";

describe("useViewerSafety", () => {
  beforeEach(() => {
    calls.length = 0;
  });

  it("loads blocks and muted_words from the tables scoped to the viewer", async () => {
    const { result } = renderHook(() => useViewerSafety());
    await waitFor(() => expect(result.current.ready).toBe(true));

    const selects = calls.filter((c) => c.op === "select");
    expect(selects.some((c) => c.table === "blocks" && c.args?.blocker_id === "viewer-1")).toBe(true);
    expect(selects.some((c) => c.table === "muted_words" && c.args?.user_id === "viewer-1")).toBe(true);

    expect(result.current.isBlocked("bad-1")).toBe(true);
    expect(result.current.isBlocked("safe")).toBe(false);
    // words are lowercased + trimmed
    expect(result.current.mutedWords).toEqual(["spoiler", "yell"]);
    expect(result.current.matchesMutedWord("no SPOILER here")).toBe(true);
    expect(result.current.matchesMutedWord("clean text")).toBe(false);
  });

  it("blockUser inserts blocker_id = viewer + blocked_id = target", async () => {
    const { result } = renderHook(() => useViewerSafety());
    await waitFor(() => expect(result.current.ready).toBe(true));
    await act(async () => { await result.current.blockUser("target-9"); });
    const insert = calls.find((c) => c.op === "insert" && c.table === "blocks");
    expect(insert?.payload).toEqual({ blocker_id: "viewer-1", blocked_id: "target-9" });
    expect(result.current.isBlocked("target-9")).toBe(true);
  });

  it("blockUser refuses to block self", async () => {
    const { result } = renderHook(() => useViewerSafety());
    await waitFor(() => expect(result.current.ready).toBe(true));
    let res: any;
    await act(async () => { res = await result.current.blockUser("viewer-1"); });
    expect(res).toEqual({ error: "cannot_block_self" });
  });

  it("unblockUser deletes only that viewer's row", async () => {
    const { result } = renderHook(() => useViewerSafety());
    await waitFor(() => expect(result.current.ready).toBe(true));
    await act(async () => { await result.current.unblockUser("bad-1"); });
    const del = calls.find((c) => c.op === "delete" && c.table === "blocks");
    expect(del?.args).toEqual({ blocker_id: "viewer-1", blocked_id: "bad-1" });
    expect(result.current.isBlocked("bad-1")).toBe(false);
  });

  it("muteWord lowercases, trims, clamps to 64 chars, and inserts", async () => {
    const { result } = renderHook(() => useViewerSafety());
    await waitFor(() => expect(result.current.ready).toBe(true));
    const long = "X".repeat(200);
    await act(async () => { await result.current.muteWord("  Hello WORLD  "); });
    await act(async () => { await result.current.muteWord(long); });

    const inserts = calls.filter((c) => c.op === "insert" && c.table === "muted_words");
    expect(inserts[0].payload).toEqual({ user_id: "viewer-1", word: "hello world" });
    expect(inserts[1].payload.word).toHaveLength(64);
    expect(inserts[1].payload.word).toBe("x".repeat(64));
  });

  it("muteWord rejects empty input without hitting the network", async () => {
    const { result } = renderHook(() => useViewerSafety());
    await waitFor(() => expect(result.current.ready).toBe(true));
    let res: any;
    await act(async () => { res = await result.current.muteWord("   "); });
    expect(res).toEqual({ error: "empty" });
    expect(calls.filter((c) => c.op === "insert" && c.table === "muted_words")).toHaveLength(0);
  });
});
