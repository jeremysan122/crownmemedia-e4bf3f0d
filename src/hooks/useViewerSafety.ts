// Wave 7 — viewer-level safety in Live Battles.
//
// Loads the current viewer's blocklist + muted words once per session and
// exposes helpers to mutate them (block, unblock, mute a word). Consumed
// by LiveBattleComments and LiveBattleGiftsOverlay to hide unwanted
// content client-side; the underlying tables are RLS-scoped to
// auth.uid() = user_id / blocker_id, so this is defense-in-depth on top
// of the same rules the Feed already relies on (see useFeedFilters).
import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/context/AuthContext";

export interface ViewerSafety {
  blockedIds: Set<string>;
  mutedWords: string[]; // lowercased, trimmed, non-empty
  ready: boolean;
  isBlocked: (userId: string | null | undefined) => boolean;
  matchesMutedWord: (body: string | null | undefined) => boolean;
  blockUser: (userId: string) => Promise<{ error?: string }>;
  unblockUser: (userId: string) => Promise<{ error?: string }>;
  muteWord: (word: string) => Promise<{ error?: string }>;
}

export function useViewerSafety(): ViewerSafety {
  const { user } = useAuth();
  const [blockedIds, setBlockedIds] = useState<Set<string>>(new Set());
  const [mutedWords, setMutedWords] = useState<string[]>([]);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (!user) { setBlockedIds(new Set()); setMutedWords([]); setReady(true); return; }
    let cancelled = false;
    (async () => {
      const [{ data: blocks }, { data: words }] = await Promise.all([
        supabase.from("blocks").select("blocked_id").eq("blocker_id", user.id),
        supabase.from("muted_words" as any).select("word").eq("user_id", user.id),
      ]);
      if (cancelled) return;
      setBlockedIds(new Set(((blocks ?? []) as any[]).map((b) => b.blocked_id).filter(Boolean)));
      setMutedWords(((words as any[] | null) ?? [])
        .map((w) => String(w?.word ?? "").trim().toLowerCase())
        .filter((w) => w.length > 0));
      setReady(true);
    })();
    return () => { cancelled = true; };
  }, [user?.id]);

  const isBlocked = useCallback((id: string | null | undefined) =>
    !!id && blockedIds.has(id), [blockedIds]);

  const matchesMutedWord = useCallback((body: string | null | undefined) => {
    if (!body || mutedWords.length === 0) return false;
    const hay = body.toLowerCase();
    for (const w of mutedWords) if (w && hay.includes(w)) return true;
    return false;
  }, [mutedWords]);

  const blockUser = useCallback(async (targetId: string) => {
    if (!user) return { error: "not_authenticated" };
    if (targetId === user.id) return { error: "cannot_block_self" };
    const { error } = await supabase.from("blocks").insert({ blocker_id: user.id, blocked_id: targetId });
    if (error && !/duplicate|unique/i.test(error.message)) return { error: error.message };
    setBlockedIds((prev) => { const next = new Set(prev); next.add(targetId); return next; });
    return {};
  }, [user?.id]);

  const unblockUser = useCallback(async (targetId: string) => {
    if (!user) return { error: "not_authenticated" };
    const { error } = await supabase.from("blocks").delete()
      .eq("blocker_id", user.id).eq("blocked_id", targetId);
    if (error) return { error: error.message };
    setBlockedIds((prev) => { const next = new Set(prev); next.delete(targetId); return next; });
    return {};
  }, [user?.id]);

  const muteWord = useCallback(async (raw: string) => {
    if (!user) return { error: "not_authenticated" };
    const word = raw.trim().toLowerCase().slice(0, 64);
    if (!word) return { error: "empty" };
    const { error } = await supabase.from("muted_words" as any)
      .insert({ user_id: user.id, word });
    if (error && !/duplicate|unique/i.test(error.message)) return { error: error.message };
    setMutedWords((prev) => prev.includes(word) ? prev : [...prev, word]);
    return {};
  }, [user?.id]);

  return { blockedIds, mutedWords, ready, isBlocked, matchesMutedWord, blockUser, unblockUser, muteWord };
}
