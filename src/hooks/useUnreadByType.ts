import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/context/AuthContext";

export interface UnreadByType {
  reply: number;
  mention: number;
  dm: number;
  vote: number;
  follow: number;
  other: number;
  total: number;
}

const ZERO: UnreadByType = { reply: 0, mention: 0, dm: 0, vote: 0, follow: 0, other: 0, total: 0 };

// Shared singleton: a single subscription + a single in-flight RPC per
// signed-in user, fanned out to every useUnreadByType() consumer. This
// stops AppShell + DesktopHeader from each opening their own realtime
// channel and each issuing their own 1000-row scan.
let currentUserId: string | null = null;
let currentCounts: UnreadByType = ZERO;
let inflight: Promise<void> | null = null;
let channel: ReturnType<typeof supabase.channel> | null = null;
const listeners = new Set<(c: UnreadByType) => void>();

function emit() {
  for (const l of listeners) { try { l(currentCounts); } catch { /* noop */ } }
}

async function recalcShared(userId: string) {
  if (inflight) return inflight;
  inflight = (async () => {
    try {
      const { data, error } = await supabase.rpc("get_my_unread_notification_counts");
      if (error || !data) return;
      const obj = data as Record<string, number>;
      const reply = Number(obj.reply || 0);
      const mention = Number(obj.mention || 0);
      const dm = Number(obj.dm || 0);
      const vote = Number(obj.vote || 0);
      const follow = Number(obj.follow || 0);
      const other = Number(obj.other || 0);
      const total = reply + mention + dm + vote + follow + other;
      currentCounts = { reply, mention, dm, vote, follow, other, total };
      emit();
    } finally {
      inflight = null;
    }
  })();
  return inflight;
}

function ensureSubscribed(userId: string) {
  if (currentUserId === userId && channel) return;
  if (channel) { supabase.removeChannel(channel); channel = null; }
  currentUserId = userId;
  currentCounts = ZERO;
  channel = supabase
    .channel(`unread-notifs-${userId}`)
    .on(
      "postgres_changes",
      { event: "*", schema: "public", table: "notifications", filter: `user_id=eq.${userId}` },
      () => { recalcShared(userId); },
    )
    .subscribe();
  recalcShared(userId);
}

function teardownIfEmpty() {
  if (listeners.size === 0 && channel) {
    supabase.removeChannel(channel);
    channel = null;
    currentUserId = null;
    currentCounts = ZERO;
  }
}

/** Live unread notification counts grouped by category — shared across consumers. */
export function useUnreadByType() {
  const { user } = useAuth();
  const [counts, setCounts] = useState<UnreadByType>(currentCounts);

  useEffect(() => {
    if (!user) { setCounts(ZERO); return; }
    ensureSubscribed(user.id);
    setCounts(currentCounts);
    const listener = (c: UnreadByType) => setCounts(c);
    listeners.add(listener);
    return () => { listeners.delete(listener); teardownIfEmpty(); };
  }, [user?.id]);

  // Refresh on focus (covers stale tabs without polling).
  useEffect(() => {
    if (!user) return;
    const onFocus = () => {
      if (document.visibilityState === "visible") recalcShared(user.id);
    };
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onFocus);
    return () => {
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onFocus);
    };
  }, [user?.id]);

  return counts;
}
