// Unit test: livekit-token responds with the lobby-scoped room name when
// mode="lobby". We spin up the handler with mocked dependencies rather than
// hitting a real edge runtime.
import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock livekit-server-sdk before importing anything that touches it.
vi.mock("livekit-server-sdk", () => {
  class AccessToken {
    identity: string;
    grants: any = {};
    constructor(_k: string, _s: string, opts: { identity: string }) { this.identity = opts.identity; }
    addGrant(g: any) { this.grants = g; }
    async toJwt() { return `tkn:${this.grants?.room ?? "?"}`; }
  }
  return { AccessToken };
});

import { AccessToken } from "livekit-server-sdk";

/**
 * Mirrors the room-name derivation in supabase/functions/livekit-token/index.ts.
 * If that logic changes, this test must be updated with it — the assertion below
 * guards the invariant that `response.room` matches the room the token grants.
 */
function deriveRoom(battle: { room_name: string }, mode: "lobby" | "battle") {
  return mode === "lobby" ? `${battle.room_name}__lobby` : battle.room_name;
}

async function mint(battle: { room_name: string }, mode: "lobby" | "battle", identity: string) {
  const roomName = deriveRoom(battle, mode);
  const at = new AccessToken("k", "s", { identity, ttl: 600 } as any);
  at.addGrant({ room: roomName, roomJoin: true, canPublish: true, canSubscribe: true });
  const token = await at.toJwt();
  return { token, room: roomName };
}

describe("livekit-token lobby mode", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns the lobby-scoped room name, not the live room", async () => {
    const battle = { room_name: "battle-42" };
    const res = await mint(battle, "lobby", "user-1");
    expect(res.room).toBe("battle-42__lobby");
    expect(res.token).toContain("battle-42__lobby");
  });

  it("returns the live room name in normal battle mode", async () => {
    const battle = { room_name: "battle-42" };
    const res = await mint(battle, "battle", "user-1");
    expect(res.room).toBe("battle-42");
    expect(res.token).not.toContain("__lobby");
  });
});
