// Launch-gate regression tests for Live Battles.
// - createLiveBattle routes through the RPC (never direct INSERT)
// - notificationRouting deep-links live_battle_* → /live/:id
// - LIVEKIT_API_SECRET is not present in the client bundle sources

import { describe, it, expect, vi, beforeEach } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { getNotificationTarget } from "../notificationRouting";

const rpcMock = vi.fn();
const insertMock = vi.fn(() => ({ select: () => ({ single: () => Promise.resolve({ data: null, error: null }) }) }));
const fromMock = vi.fn((_t: string) => ({ insert: insertMock }));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    auth: { getUser: () => Promise.resolve({ data: { user: { id: "u1" } } }) },
    from: (t: string) => fromMock(t),
    rpc: (name: string, args?: unknown) => rpcMock(name, args),
    functions: { invoke: vi.fn() },
  },
}));

beforeEach(() => { rpcMock.mockReset(); insertMock.mockClear(); fromMock.mockClear(); });

describe("Live Battles launch gate", () => {
  it("createLiveBattle uses the create_live_battle RPC, never direct insert", async () => {
    rpcMock.mockResolvedValueOnce({ data: { id: "b9", host_id: "u1" }, error: null });
    const { createLiveBattle } = await import("@/lib/liveBattles");
    const row = await createLiveBattle("opp1", 300, "beauty", "LA");
    expect(rpcMock).toHaveBeenCalledWith("create_live_battle", {
      _opponent_id: "opp1", _duration_seconds: 300,
      _category_slug: "beauty", _region: "LA",
    });
    expect(fromMock).not.toHaveBeenCalledWith("live_battles");
    expect(insertMock).not.toHaveBeenCalled();
    expect(row.id).toBe("b9");
  });

  it("accept/decline/cancel/heartbeat go through their RPCs only", async () => {
    const { acceptLiveBattle, declineLiveBattle, cancelLiveBattle, heartbeatLiveBattleViewer, fetchLiveBattleViewerCount } =
      await import("@/lib/liveBattles");
    rpcMock.mockResolvedValue({ data: { id: "b1" }, error: null });
    await acceptLiveBattle("b1");
    await declineLiveBattle("b1");
    await cancelLiveBattle("b1");
    await heartbeatLiveBattleViewer("b1");
    rpcMock.mockResolvedValueOnce({ data: 3, error: null });
    const n = await fetchLiveBattleViewerCount("b1");
    const names = rpcMock.mock.calls.map((c) => c[0]);
    expect(names).toEqual(expect.arrayContaining([
      "live_battle_accept", "live_battle_decline", "live_battle_cancel",
      "live_battle_viewer_heartbeat", "live_battle_viewer_count",
    ]));
    expect(fromMock).not.toHaveBeenCalledWith("live_battles");
    expect(n).toBe(3);
  });
});

describe("Notification routing: live_battle_*", () => {
  it("prefers explicit payload.link=/live/:id (emitted by _notify_live_battle)", () => {
    expect(getNotificationTarget({
      type: "system",
      payload: { kind: "live_battle_invite", battle_id: "b1", link: "/live/b1" },
    })).toBe("/live/b1");
  });
  it("falls back to /live/:battle_id when payload.link is missing", () => {
    for (const kind of ["live_battle_invite","live_battle_started","live_battle_declined","live_battle_cancelled","live_battle_ended"]) {
      expect(getNotificationTarget({ type: "system", payload: { kind, battle_id: "b2" } })).toBe("/live/b2");
    }
  });
  it("returns null when kind is live_battle_* but battle_id is missing", () => {
    expect(getNotificationTarget({ type: "system", payload: { kind: "live_battle_invite" } })).toBeNull();
  });
});

describe("Client bundle secrecy", () => {
  const walk = (dir: string, out: string[] = []): string[] => {
    for (const name of readdirSync(dir)) {
      const p = join(dir, name);
      const s = statSync(p);
      if (s.isDirectory()) walk(p, out);
      else if (/\.(ts|tsx|js|jsx)$/.test(p)) out.push(p);
    }
    return out;
  };
  it("LIVEKIT_API_SECRET / LIVEKIT_SECRET never appear in client sources", () => {
    const files = walk("src").filter((f) => !f.includes("__tests__") && !f.includes(".test."));
    const hits = files.filter((f) => /LIVEKIT_API_SECRET|LIVEKIT_SECRET/.test(readFileSync(f, "utf8")));
    expect(hits).toEqual([]);
  });
});

describe("livekit-webhook function", () => {
  it("uses WebhookReceiver, is verify_jwt=false, and dedupes on event_id", () => {
    const src = readFileSync("supabase/functions/livekit-webhook/index.ts", "utf8");
    expect(src).toMatch(/WebhookReceiver/);
    expect(src).toMatch(/livekit_webhook_events/);
    expect(src).toMatch(/invalid_signature/);
    expect(src).toMatch(/23505/);

    const cfg = readFileSync("supabase/config.toml", "utf8");
    expect(cfg).toMatch(/\[functions\.livekit-webhook\][\s\S]*verify_jwt\s*=\s*false/);
  });

  it("does NOT terminate battles on participant_left (prevents transient-disconnect false endings)", () => {
    const src = readFileSync("supabase/functions/livekit-webhook/index.ts", "utf8");
    expect(src).not.toMatch(/participant_left[\s\S]{0,400}live_battle_end_by_room/);
    expect(src).toMatch(/room_finished[\s\S]{0,200}live_battle_end_by_room/);
  });

  it("ignores lobby room_finished before calling the battle-ending RPC", () => {
    const src = readFileSync("supabase/functions/livekit-webhook/index.ts", "utf8");
    expect(src).toContain('eventType === "room_finished" && roomName && !roomName.endsWith("__lobby")');
  });

  it("pins livekit-server-sdk to an explicit patch version in every function", () => {
    for (const p of [
      "supabase/functions/livekit-webhook/index.ts",
      "supabase/functions/livekit-token/index.ts",
      "supabase/functions/livekit-room-control/index.ts",
    ]) {
      const src = readFileSync(p, "utf8");
      const m = src.match(/livekit-server-sdk@(\d+\.\d+\.\d+)"/);
      expect(m, `missing pinned sdk in ${p}`).not.toBeNull();
      expect(m![1]).toBe("2.17.0");
    }
  });
});
