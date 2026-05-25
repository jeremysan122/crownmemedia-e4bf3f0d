/**
 * Pure helpers that decide whether engagement counts should be visible to a
 * given viewer based on the post owner's privacy flags.
 *
 * Owners always see their own counts. Admins/moderators are handled at the
 * RLS layer and can be passed in here as `isPrivileged` if needed.
 */
export interface PrivacyFlags {
  hide_likes?: boolean | null;
  hide_comments?: boolean | null;
  hide_views?: boolean | null;
}

export interface VisibilityContext {
  isOwner: boolean;
  isPrivileged?: boolean;
}

export function canSeeLikes(flags: PrivacyFlags | null | undefined, ctx: VisibilityContext): boolean {
  if (ctx.isOwner || ctx.isPrivileged) return true;
  return !flags?.hide_likes;
}

export function canSeeComments(flags: PrivacyFlags | null | undefined, ctx: VisibilityContext): boolean {
  if (ctx.isOwner || ctx.isPrivileged) return true;
  return !flags?.hide_comments;
}

export function canSeeViews(flags: PrivacyFlags | null | undefined, ctx: VisibilityContext): boolean {
  if (ctx.isOwner || ctx.isPrivileged) return true;
  return !flags?.hide_views;
}
