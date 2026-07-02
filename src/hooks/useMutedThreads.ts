import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/context/AuthContext";

// Shared singleton: one query + one realtime channel per signed-in user,
// fanned out to every consumer (AppShell + DesktopHeader + DM screens).
let currentUserId: string | null = null;
let currentMuted: Set<string> = new Set();
let inflight: Promise<void> | null = null;
let channel: ReturnType<typeof supabase.channel> | null = null;
const listeners = new Set<(m: Set<string>) => void>();

function emit() {
  for (const l of listeners) { try { l(currentMuted); } catch { /* noop */ } }
}

async function refresh(userId: string) {
  if (inflight) return inflight;
  inflight = (async () => {
    try {
      const { data } = await supabase
        .from("muted_dm_threads")
        .select("other_user_id")
        .eq("user_id", userId);
      currentMuted = new Set((data as any[] || []).map((r) => r.other_user_id));
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
  currentMuted = new Set();
  channel = supabase
    .channel(`muted-dm-${userId}-${crypto.randomUUID()}`)
    .on(
      "postgres_changes",
      { event: "*", schema: "public", table: "muted_dm_threads", filter: `user_id=eq.${userId}` },
      () => { refresh(userId); },
    )
    .subscribe();
  refresh(userId);
}

function teardownIfEmpty() {
  if (listeners.size === 0 && channel) {
    supabase.removeChannel(channel);
    channel = null;
    currentUserId = null;
    currentMuted = new Set();
  }
}

/**
 * Live set of `other_user_id`s the current user has muted in DMs.
 * Shared across consumers — only one query + one channel per user.
 */
export function useMutedThreads() {
  const { user } = useAuth();
  const [muted, setMuted] = useState<Set<string>>(currentMuted);

  useEffect(() => {
    if (!user) { setMuted(new Set()); return; }
    ensureSubscribed(user.id);
    setMuted(currentMuted);
    const listener = (m: Set<string>) => setMuted(m);
    listeners.add(listener);
    return () => { listeners.delete(listener); teardownIfEmpty(); };
  }, [user?.id]);

  return muted;
}
