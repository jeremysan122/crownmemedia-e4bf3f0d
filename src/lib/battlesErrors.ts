// Central mapping from raw Supabase/Postgres/RLS errors to friendly, safe
// user-facing messages for Crown Battles. Never expose the raw error to the UI.
//
// Callers should still `console.error(...)` the raw error for diagnostics.

type Kind = "challenge" | "accept" | "decline" | "vote" | "share";

export function battleErrorMessage(kind: Kind, err: unknown): string {
  // Best-effort extraction of a machine-readable hint without exposing SQL text.
  const raw = err as any;
  const msg = String(raw?.message || raw?.error?.message || "").toLowerCase();

  if (msg.includes("too many pending")) return "You already have several pending challenges with this royal.";
  if (msg.includes("not challengeable") || msg.includes("no longer challengeable")) {
    return "This royal can't be challenged right now.";
  }
  if (msg.includes("not battle-eligible")) return "That post can't be used in a battle.";
  if (msg.includes("only opponent can accept")) return "Only the challenged royal can accept this battle.";
  if (msg.includes("only participants can decline")) return "Only participants can decline this battle.";
  if (msg.includes("battle not pending")) return "This battle already started or ended.";
  if (msg.includes("battle not found")) return "This battle is no longer available.";
  if (msg.includes("invalid duration")) return "Please pick a duration between 15 minutes and 72 hours.";
  if (msg.includes("not signed in")) return "Sign in to continue.";

  switch (kind) {
    case "challenge": return "Couldn't send challenge. Try again.";
    case "accept":    return "Couldn't accept battle. Try again.";
    case "decline":   return "Couldn't decline battle. Try again.";
    case "vote":      return "Couldn't record your vote. Try again.";
    case "share":     return "Couldn't build share card. Try again.";
  }
}
