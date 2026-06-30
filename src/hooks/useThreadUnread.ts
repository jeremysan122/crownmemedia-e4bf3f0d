import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/context/AuthContext";

type Counts = Record<string, number>;

// Shared singleton (see useUnreadByType for rationale): one channel + one
// RPC per user, fanned out to every consumer. Replaces the per-mount
// .limit(1000) message scan with a server-grouped count.
let currentUserId: string | null = null;
let currentCounts: Counts = {};
let inflight: Promise<void> | null = null;
let channel: ReturnType<typeof supabase.channel> | null = null;
const listeners = new Set<(c: Counts) => void>();

function emit() {
  for (const l of listeners) { try { l(currentCounts); } catch { /* noop */ } }
}

async function recalc() {
  if (inflight) return inflight;
  inflight = (async () => {
    try {
      const { data, error } = await supabase.rpc("get_my_unread_dm_counts");
      if (error || !data) return;
      const obj = data as Record<string, number>;
      const next: Counts = {};
      for (const [k, v] of Object.entries(obj)) next[k] = Number(v) || 0;
      currentCounts = next;
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
  currentCounts = {};
  channel = supabase
    .channel(`unread-dms-${userId}`)
    .on(
      "postgres_changes",
      { event: "*", schema: "public", table: "messages", filter: `receiver_id=eq.${userId}` },
      () => { recalc(); },
    )
    .subscribe();
  recalc();
}

function teardownIfEmpty() {
  if (listeners.size === 0 && channel) {
    supabase.removeChannel(channel);
    channel = null;
    currentUserId = null;
    currentCounts = {};
  }
}

/** Live unread DM counts grouped by other-participant id — shared across consumers. */
export function useThreadUnread() {
  const { user } = useAuth();
  const [counts, setCounts] = useState<Counts>(currentCounts);

  useEffect(() => {
    if (!user) { setCounts({}); return; }
    ensureSubscribed(user.id);
    setCounts(currentCounts);
    const listener = (c: Counts) => setCounts(c);
    listeners.add(listener);
    return () => { listeners.delete(listener); teardownIfEmpty(); };
  }, [user?.id]);

  useEffect(() => {
    if (!user) return;
    const onFocus = () => { if (document.visibilityState === "visible") recalc(); };
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onFocus);
    return () => {
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onFocus);
    };
  }, [user?.id]);

  return counts;
}
