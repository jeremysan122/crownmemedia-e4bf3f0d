/**
 * Admin Command Center — action helpers
 *
 * Centralized client API for all admin operations. Every dangerous action
 * writes to `admin_audit_log` (either via the helper here or via DB triggers).
 *
 * RLS enforces who can call what — these helpers are convenience wrappers,
 * not security boundaries.
 */
import { supabase } from "@/integrations/supabase/client";
import { invalidateShareStatus } from "@/lib/shareStatusCache";

export type AdminRole =
  | "admin"
  | "super_admin"
  | "finance_admin"
  | "security_admin"
  | "content_admin"
  | "support_admin"
  | "moderator";

export type AdminTargetType = "post" | "comment" | "user" | "message";

// ---------- Audit logging ----------

export async function logAdminAction(
  action: string,
  targetType: string | null,
  targetId: string | null,
  details: Record<string, unknown> = {},
) {
  const { data: u } = await supabase.auth.getUser();
  const actorId = u.user?.id;
  const actorEmail = u.user?.email ?? null;
  if (!actorId) throw new Error("Not authenticated");

  const { error } = await supabase.from("admin_audit_log").insert([
    {
      actor_id: actorId,
      actor_email: actorEmail,
      action,
      target_type: targetType,
      target_id: targetId,
      details: details as never,
    },
  ]);
  if (error) throw error;
}

// ---------- Role check ----------

export async function getMyAdminRoles(): Promise<AdminRole[]> {
  // Uses the SECURITY DEFINER RPC `get_my_admin_roles` so the client never
  // needs SELECT on `user_roles`. RPC internally scopes to auth.uid() and
  // returns empty for anon.
  const { data, error } = await supabase.rpc("get_my_admin_roles");
  if (error) return [];
  return ((data as { role: string }[] | null) ?? []).map((r) => r.role as AdminRole);
}

export async function isAdmin(): Promise<boolean> {
  const roles = await getMyAdminRoles();
  return roles.some((r) =>
    [
      "admin",
      "super_admin",
      "finance_admin",
      "security_admin",
      "content_admin",
      "support_admin",
    ].includes(r),
  );
}

// ---------- Content moderation ----------

export async function removePost(postId: string, reason: string, notes?: string) {
  const { data: u } = await supabase.auth.getUser();
  if (!u.user) throw new Error("Not authenticated");

  const { error: e1 } = await supabase
    .from("posts")
    .update({ is_removed: true })
    .eq("id", postId);
  if (e1) throw e1;

  const { error: e2 } = await supabase.from("content_takedowns").insert({
    target_type: "post",
    target_id: postId,
    removed_by: u.user.id,
    reason,
    notes: notes ?? null,
  });
  if (e2) throw e2;
  // Bust any cached share-status entry so ShareDialog can't keep saying
  // "visible" until the TTL expires.
  invalidateShareStatus(postId);
}

export async function reversePostTakedown(takedownId: string, postId: string) {
  const { data: u } = await supabase.auth.getUser();
  if (!u.user) throw new Error("Not authenticated");

  const { error: e1 } = await supabase
    .from("posts")
    .update({ is_removed: false })
    .eq("id", postId);
  if (e1) throw e1;

  const { error: e2 } = await supabase
    .from("content_takedowns")
    .update({ reversed_at: new Date().toISOString(), reversed_by: u.user.id })
    .eq("id", takedownId);
  if (e2) throw e2;
  invalidateShareStatus(postId);
}

export async function removeComment(commentId: string, reason: string) {
  const { data: u } = await supabase.auth.getUser();
  if (!u.user) throw new Error("Not authenticated");

  const { error: e1 } = await supabase
    .from("comments")
    .update({ is_removed: true })
    .eq("id", commentId);
  if (e1) throw e1;

  const { error: e2 } = await supabase.from("content_takedowns").insert({
    target_type: "comment",
    target_id: commentId,
    removed_by: u.user.id,
    reason,
  });
  if (e2) throw e2;
}

// ---------- User actions ----------

export async function suspendUser(userId: string, reason: string) {
  const { error: e1 } = await supabase
    .from("profiles")
    .update({ is_suspended: true })
    .eq("id", userId);
  if (e1) throw e1;
  await logAdminAction("suspend_user", "user", userId, { reason });
}

export async function unsuspendUser(userId: string) {
  const { error } = await supabase
    .from("profiles")
    .update({ is_suspended: false })
    .eq("id", userId);
  if (error) throw error;
  await logAdminAction("unsuspend_user", "user", userId, {});
}

export async function issueStrike(
  userId: string,
  reason: string,
  severity: "minor" | "major" | "severe" = "minor",
  expiresAt?: string,
) {
  const { data: u } = await supabase.auth.getUser();
  if (!u.user) throw new Error("Not authenticated");

  const { error } = await supabase.from("user_strikes").insert({
    user_id: userId,
    issued_by: u.user.id,
    reason,
    severity,
    expires_at: expiresAt ?? null,
  });
  if (error) throw error;
}

export async function grantRole(userId: string, role: AdminRole) {
  const { error } = await supabase
    .from("user_roles")
    .insert({ user_id: userId, role });
  if (error) throw error;
  await logAdminAction("grant_role", "user", userId, { role });
}

export async function revokeRole(userId: string, role: AdminRole) {
  const { error } = await supabase
    .from("user_roles")
    .delete()
    .eq("user_id", userId)
    .eq("role", role);
  if (error) throw error;
  await logAdminAction("revoke_role", "user", userId, { role });
}

// ---------- Moderation queue ----------

export async function enqueueForReview(
  targetType: AdminTargetType,
  targetId: string,
  reason: string,
  priority: "low" | "normal" | "high" | "urgent" = "normal",
) {
  const { error } = await supabase.from("moderation_queue").insert({
    target_type: targetType,
    target_id: targetId,
    reason,
    priority,
  });
  if (error) throw error;
}

export async function resolveQueueItem(
  itemId: string,
  status: "resolved" | "dismissed",
  notes?: string,
) {
  const { data: u } = await supabase.auth.getUser();
  if (!u.user) throw new Error("Not authenticated");

  const { error } = await supabase
    .from("moderation_queue")
    .update({
      status,
      resolved_by: u.user.id,
      resolved_at: new Date().toISOString(),
      metadata: notes ? { notes } : {},
    })
    .eq("id", itemId);
  if (error) throw error;
}

// ---------- Platform settings ----------

export async function setPlatformSetting(
  key: string,
  value: unknown,
  description?: string,
) {
  const { data: u } = await supabase.auth.getUser();
  if (!u.user) throw new Error("Not authenticated");

  const { error } = await supabase.from("platform_settings").upsert({
    key,
    value: value as never,
    description: description ?? "",
    updated_by: u.user.id,
    updated_at: new Date().toISOString(),
  });
  if (error) throw error;
}

export async function getPlatformSetting<T = unknown>(key: string): Promise<T | null> {
  const { data, error } = await supabase
    .from("platform_settings")
    .select("value")
    .eq("key", key)
    .maybeSingle();
  if (error || !data) return null;
  return data.value as T;
}

// ---------- Alerts ----------

export async function acknowledgeAlert(alertId: string) {
  const { data: u } = await supabase.auth.getUser();
  if (!u.user) throw new Error("Not authenticated");
  const { error } = await supabase
    .from("admin_alerts")
    .update({
      acknowledged: true,
      acknowledged_by: u.user.id,
      acknowledged_at: new Date().toISOString(),
    })
    .eq("id", alertId);
  if (error) throw error;
}

// ---------- Broadcasts ----------

export async function createBroadcast(args: {
  title: string;
  body: string;
  audience?: "all" | "royal_pass" | "non_pass" | "admins" | "region";
  region?: Record<string, unknown>;
  scheduledFor?: string;
}) {
  const { data: u } = await supabase.auth.getUser();
  if (!u.user) throw new Error("Not authenticated");

  const { error } = await supabase.from("admin_broadcasts").insert([
    {
      title: args.title,
      body: args.body,
      audience: args.audience ?? "all",
      region: (args.region ?? {}) as never,
      scheduled_for: args.scheduledFor ?? null,
      created_by: u.user.id,
    },
  ]);
  if (error) throw error;
}

// ---------- Support tickets ----------

export async function assignTicket(ticketId: string, adminId: string) {
  const { error } = await supabase
    .from("support_tickets")
    .update({ assigned_to: adminId, status: "in_progress" })
    .eq("id", ticketId);
  if (error) throw error;
  await logAdminAction("assign_ticket", "support_ticket", ticketId, {
    assigned_to: adminId,
  });
}

export async function resolveTicket(ticketId: string) {
  const { error } = await supabase
    .from("support_tickets")
    .update({ status: "resolved", resolved_at: new Date().toISOString() })
    .eq("id", ticketId);
  if (error) throw error;
  await logAdminAction("resolve_ticket", "support_ticket", ticketId, {});
}

// ---------- Error log capture (client-side) ----------

export async function captureError(
  source: string,
  message: string,
  stack?: string,
  metadata: Record<string, unknown> = {},
) {
  const { data: u } = await supabase.auth.getUser();
  try {
    await supabase.from("error_logs").insert([
      {
        source,
        level: "error",
        message: message.slice(0, 2000),
        stack: stack?.slice(0, 8000) ?? null,
        user_id: u.user?.id ?? null,
        url: typeof window !== "undefined" ? window.location.href : null,
        metadata: metadata as never,
      },
    ]);
  } catch {
    // swallow — never throw from error logger
  }
}

// ---------- Admin session tracking ----------

export async function startAdminSession() {
  const { data: u } = await supabase.auth.getUser();
  if (!u.user) return null;
  const { data, error } = await supabase
    .from("admin_sessions")
    .insert({
      admin_id: u.user.id,
      user_agent:
        typeof navigator !== "undefined" ? navigator.userAgent.slice(0, 500) : null,
    })
    .select("id")
    .maybeSingle();
  if (error) return null;
  return data?.id ?? null;
}

export async function pingAdminSession(sessionId: string) {
  await supabase
    .from("admin_sessions")
    .update({ last_seen_at: new Date().toISOString() })
    .eq("id", sessionId);
}

export async function endAdminSession(sessionId: string) {
  await supabase
    .from("admin_sessions")
    .update({ ended_at: new Date().toISOString() })
    .eq("id", sessionId);
}

// ---------- Bans (stronger than suspend; persistent) ----------

export async function banUser(userId: string, reason: string) {
  const { data: u } = await supabase.auth.getUser();
  if (!u.user) throw new Error("Not authenticated");
  const { error } = await supabase
    .from("profiles")
    .update({
      is_banned: true,
      is_suspended: true,
      banned_at: new Date().toISOString(),
      banned_by: u.user.id,
      banned_reason: reason,
    })
    .eq("id", userId);
  if (error) throw error;
  // Ban is the most severe user action — always write an audit entry.
  await logAdminAction("ban_user", "user", userId, { reason });
}

export async function unbanUser(userId: string) {
  const { error } = await supabase
    .from("profiles")
    .update({
      is_banned: false,
      is_suspended: false,
      banned_at: null,
      banned_by: null,
      banned_reason: null,
    })
    .eq("id", userId);
  if (error) throw error;
  await logAdminAction("unban_user", "user", userId, {});
}

// ---------- Reports ----------

export async function resolveReport(reportId: string, resolution: string) {
  const { data: u } = await supabase.auth.getUser();
  if (!u.user) throw new Error("Not authenticated");
  const { error } = await supabase
    .from("reports")
    .update({
      status: "resolved",
      resolution,
      resolved_by: u.user.id,
      resolved_at: new Date().toISOString(),
    })
    .eq("id", reportId);
  if (error) throw error;
}

export async function dismissReport(reportId: string, reason: string) {
  const { data: u } = await supabase.auth.getUser();
  if (!u.user) throw new Error("Not authenticated");
  const { error } = await supabase
    .from("reports")
    .update({
      status: "dismissed",
      resolution: reason,
      resolved_by: u.user.id,
      resolved_at: new Date().toISOString(),
    })
    .eq("id", reportId);
  if (error) throw error;
}

// ---------- Payouts ----------

export async function freezePayout(payoutId: string, reason: string) {
  const { data: u } = await supabase.auth.getUser();
  if (!u.user) throw new Error("Not authenticated");
  const { error } = await supabase
    .from("payouts")
    .update({
      frozen: true,
      frozen_at: new Date().toISOString(),
      frozen_by: u.user.id,
      frozen_reason: reason,
      status: "frozen",
      updated_at: new Date().toISOString(),
    })
    .eq("id", payoutId);
  if (error) throw error;
}

export async function unfreezePayout(payoutId: string) {
  const { error } = await supabase
    .from("payouts")
    .update({
      frozen: false,
      frozen_at: null,
      frozen_by: null,
      frozen_reason: null,
      status: "pending",
      updated_at: new Date().toISOString(),
    })
    .eq("id", payoutId);
  if (error) throw error;
}

export async function markPayoutPaid(payoutId: string) {
  const { error } = await supabase
    .from("payouts")
    .update({
      status: "paid",
      paid_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("id", payoutId);
  if (error) throw error;
}
