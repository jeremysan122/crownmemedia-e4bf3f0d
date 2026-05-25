export type ReactionLike = { id: string; message_id: string; emoji: string };

/**
 * Compute deduped emoji totals limited to a set of message ids.
 * Pure function — safe to unit test and use anywhere counts are displayed.
 */
export function computeReactionTotalsForMessages(
  reactions: ReactionLike[],
  messageIds: Iterable<string>,
): Array<[string, number]> {
  const allowed = messageIds instanceof Set ? messageIds : new Set(messageIds);
  const seen = new Set<string>();
  const totals: Record<string, number> = {};
  for (const r of reactions) {
    if (seen.has(r.id)) continue;
    if (!allowed.has(r.message_id)) continue;
    seen.add(r.id);
    totals[r.emoji] = (totals[r.emoji] || 0) + 1;
  }
  return Object.entries(totals).sort((a, b) => b[1] - a[1]);
}
