// Central source of truth for sensitive-content visibility decisions.
//
// Every surface that renders post media (Feed, PostCard, Profile, PostPage,
// Shorts, Leaderboard previews, Share cards) must call into this module so
// the same rules apply everywhere.
//
// IMPORTANT: This file ONLY decides visibility for *allowed* sensitive content.
// Banned / removed posts (is_removed = true) are handled elsewhere via
// `isPostDeleted` in @/lib/postShare and the regular Feed filter chain. Never
// downgrade banned/removed content into a sensitive blur state — those are
// separate concerns.

export type SensitiveMode = "blur" | "show" | "hide";

export interface SensitivePostLike {
  user_id?: string | null;
  is_sensitive?: boolean | null;
  is_removed?: boolean | null;
}

export interface SensitiveViewer {
  /** Authenticated user id, or null for anonymous viewers. */
  userId: string | null;
  /** Viewer's Content Filters preference (defaults to "blur"). */
  mode: SensitiveMode;
  /** True when the viewer has cleared the existing AgeGate / 18+ flow. */
  ageConfirmed: boolean;
  /** True when the viewer is an admin or moderator. */
  isModerator?: boolean;
}

/**
 * The single decision used by every surface.
 *
 *  - "show"       → render media in clear.
 *  - "blur"       → render blurred with a "View post" reveal button.
 *  - "hide"       → do not render media; show "Hidden by your settings".
 *  - "unavailable" → post is removed / banned; show unavailable state.
 *  - "confirm"    → render blurred with a "Confirm to view" CTA that routes
 *                   into the existing eligibility flow.
 */
export type SensitiveDecision = "show" | "blur" | "hide" | "unavailable" | "confirm";

export function resolveSensitiveDecision(
  post: SensitivePostLike | null | undefined,
  viewer: SensitiveViewer,
): SensitiveDecision {
  if (!post) return "unavailable";
  if (post.is_removed === true) return "unavailable";
  if (!post.is_sensitive) return "show";

  // Authors always see their own sensitive content in clear. This is a private
  // author view only — share cards / other viewers still respect their own
  // preferences (this helper is called per-viewer).
  if (viewer.userId && post.user_id && viewer.userId === post.user_id) return "show";

  // Moderators can see media to do their job. UI may still expose a manual
  // re-blur toggle, but the default for mod views is clear.
  if (viewer.isModerator) return "show";

  if (viewer.mode === "hide") return "hide";

  if (viewer.mode === "show") {
    // Show is gated on age/eligibility — fall back to a confirm flow when the
    // viewer hasn't completed it (or when they are anonymous).
    return viewer.ageConfirmed ? "show" : "confirm";
  }

  // mode === "blur" (default)
  return "blur";
}

/** Convenience helpers used by surface code so it doesn't repeat the switch. */
export function shouldBlurMedia(d: SensitiveDecision): boolean {
  return d === "blur" || d === "hide" || d === "confirm";
}
export function shouldHideMediaEntirely(d: SensitiveDecision): boolean {
  return d === "hide" || d === "unavailable";
}
