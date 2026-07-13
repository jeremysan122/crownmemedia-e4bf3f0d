import { supabase } from "@/integrations/supabase/client";

/**
 * Wave 2 client-side achievement event emitter.
 *
 * Idempotency: when `source_table` + `source_id` are provided, the server
 * derives a stable event_key so repeat calls (e.g. optimistic retries,
 * duplicate realtime deliveries) are no-ops.
 *
 * The emitter is fire-and-forget from the caller's perspective; failures
 * are logged but never thrown into the UI path.
 */
export type AchievementDelta = Record<string, number>;

export interface EmitAchievementEventInput {
  userId: string;
  eventType: string;
  sourceTable?: string;
  sourceId?: string;
  delta?: AchievementDelta;
  /** Optional custom idempotency key (overrides source-derived key). */
  eventKey?: string;
  /** Optional occurred_at ISO timestamp. */
  occurredAt?: string;
}

export async function emitAchievementEvent(
  input: EmitAchievementEventInput,
): Promise<{ ok: boolean; id?: string; error?: string }> {
  try {
    const { data, error } = await supabase.rpc("emit_achievement_event", {
      _user_id: input.userId,
      _event_type: input.eventType,
      _source_table: input.sourceTable ?? null,
      _source_id: input.sourceId ?? null,
      _delta: (input.delta ?? {}) as never,
      _event_key: input.eventKey ?? null,
      _occurred_at: input.occurredAt ?? new Date().toISOString(),
    } as never);
    if (error) {
      if (import.meta.env.DEV) console.warn("[achievements] emit failed", error);
      return { ok: false, error: error.message };
    }
    return { ok: true, id: (data as string | null) ?? undefined };
  } catch (e) {
    if (import.meta.env.DEV) console.warn("[achievements] emit exception", e);
    return { ok: false, error: (e as Error).message };
  }
}

/**
 * Record a qualified active day for the given user. Called alongside emit()
 * for events that count toward the fair-play "qualified active days" gate.
 */
export async function recordQualifiedActiveDay(input: {
  userId: string;
  eventType: string;
  eventId?: string;
  occurredAt?: string;
}): Promise<void> {
  try {
    await supabase.rpc("record_qualified_active_day", {
      _user_id: input.userId,
      _event_type: input.eventType,
      _event_id: input.eventId ?? null,
      _occurred_at: input.occurredAt ?? new Date().toISOString(),
    } as never);
  } catch (e) {
    if (import.meta.env.DEV) console.warn("[achievements] active-day exception", e);
  }
}

/** Convenience wrappers for the canonical event types used across the app. */
export const AchievementEvents = {
  battleWon: (userId: string, battleId: string) =>
    emitAchievementEvent({
      userId,
      eventType: "battle_won",
      sourceTable: "battles",
      sourceId: battleId,
      delta: { qualified_battle_wins: 1 },
    }),
  postPublished: (userId: string, postId: string) =>
    emitAchievementEvent({
      userId,
      eventType: "post_published",
      sourceTable: "posts",
      sourceId: postId,
      delta: { qualifying_posts: 1 },
    }),
  voteReceived: (userId: string, voteId: string) =>
    emitAchievementEvent({
      userId,
      eventType: "vote_received",
      sourceTable: "votes",
      sourceId: voteId,
      delta: { qualified_votes_received: 1 },
    }),
  followerGained: (userId: string, followId: string) =>
    emitAchievementEvent({
      userId,
      eventType: "follower_gained",
      sourceTable: "follows",
      sourceId: followId,
      delta: { legitimate_followers: 1 },
    }),
  crownDefended: (userId: string, crownId: string) =>
    emitAchievementEvent({
      userId,
      eventType: "crown_defended",
      sourceTable: "crowns",
      sourceId: crownId,
      delta: { crown_defenses: 1 },
    }),
};
