// Crown title helper. Maps a user's gender (and optional rank) to a royal title.
// - Male  → "King"
// - Female → "Queen"
// - Non-binary → "King" if 1st place, "Queen" if 2nd place, otherwise null
// - Anything else / unknown → null

export type GenderValue = "male" | "female" | "non_binary" | "prefer_not_to_say" | null | undefined;

export function rankTitle(gender: GenderValue, rank?: number): "King" | "Queen" | null {
  // Only the #1 ranked holder earns the royal title.
  // Male #1 → King, Female #1 → Queen.
  // Non-binary #1 → King, non-binary #2 → Queen (kept for back-compat).
  if (rank === 1) {
    if (gender === "male" || gender === "non_binary") return "King";
    if (gender === "female") return "Queen";
  }
  if (rank === 2 && gender === "non_binary") return "Queen";
  return null;
}

function ordinal(rank: number): string {
  const mod100 = rank % 100;
  if (mod100 >= 11 && mod100 <= 13) return `${rank}th`;
  switch (rank % 10) {
    case 1: return `${rank}st`;
    case 2: return `${rank}nd`;
    case 3: return `${rank}rd`;
    default: return `${rank}th`;
  }
}

export function rankBadgeLabel(gender: GenderValue, rank: number): string {
  const title = rankTitle(gender, rank);
  if (title) return title;
  return ordinal(rank);
}
