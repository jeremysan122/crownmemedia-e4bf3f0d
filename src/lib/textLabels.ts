// User-facing label helpers. Internal identifiers (category slugs, enum
// values, ended reasons) are stored as machine slugs like "beauty-makeup" or
// "opponent_declined" — never show those raw to users.

/**
 * Convert an internal slug ("beauty-makeup", "host_cancelled") into friendly
 * Title Case wording ("Beauty Makeup", "Host Cancelled").
 */
export function humanizeSlug(value: string | null | undefined): string {
  if (!value) return "";
  return value
    .replace(/[-_]+/g, " ")
    .trim()
    .split(/\s+/)
    .map((w) => (w ? w[0].toUpperCase() + w.slice(1) : w))
    .join(" ");
}

/** Friendly explanations for live-battle ended reasons. */
const ENDED_REASON_LABELS: Record<string, string> = {
  host_end: "The host ended the battle",
  admin_force_end: "A moderator ended the battle",
  opponent_declined: "The opponent declined the invite",
  host_cancelled: "The host cancelled the invite",
  time_up: "Time ran out",
  timeout: "Time ran out",
};

export function endedReasonLabel(reason: string | null | undefined): string {
  if (!reason) return "";
  return ENDED_REASON_LABELS[reason] ?? humanizeSlug(reason);
}
