// Live Battle chat — realtime comments with pagination, moderator hide, and reporting.
// Read/insert RLS gated on server. Hidden comments only visible to author + mods.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/context/AuthContext";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Send,
  MessageSquare,
  Loader2,
  Check,
  MoreHorizontal,
  Flag,
  EyeOff,
  Eye,
  ChevronUp,
  ArrowDown,
} from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { bodyMatchesKeyword } from "@/lib/battleModeration";

interface Row {
  id: string;
  battle_id: string;
  user_id: string;
  body: string;
  created_at: string;
  hidden_at?: string | null;
  username?: string | null;
  profile_photo_url?: string | null;
}

interface TypingUser {
  user_id: string;
  username: string | null;
  ts: number;
}

const MAX = 240;
const PAGE = 30;
const COOLDOWN_MS = 3000;
const TYPING_TTL_MS = 3500;
const TYPING_THROTTLE_MS = 1500;
const STICK_THRESHOLD_PX = 60;

function usePrefersReducedMotion() {
  const [reduced, setReduced] = useState(() => {
    if (typeof window === "undefined" || !window.matchMedia) return false;
    return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  });
  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) return;
    const mql = window.matchMedia("(prefers-reduced-motion: reduce)");
    const onChange = () => setReduced(mql.matches);
    mql.addEventListener?.("change", onChange);
    return () => mql.removeEventListener?.("change", onChange);
  }, []);
  return reduced;
}

export default function LiveBattleComments({
  battleId,
  isLive,
  overlay = false,
  keywordFilters = [],
  commentsLocked = false,
  slowModeSeconds = 0,
}: {
  battleId: string;
  isLive: boolean;
  overlay?: boolean;
  keywordFilters?: string[];
  commentsLocked?: boolean;
  slowModeSeconds?: number;
}) {
  const { user, isModerator } = useAuth();
  const reducedMotion = usePrefersReducedMotion();
  const [rows, setRows] = useState<Row[]>([]);
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [justSent, setJustSent] = useState(false);
  const [cooldownUntil, setCooldownUntil] = useState(0);
  const [cooldownLeft, setCooldownLeft] = useState(0);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [reportFor, setReportFor] = useState<Row | null>(null);
  const [unread, setUnread] = useState(0);
  const [isStuck, setIsStuck] = useState(true);
  const [typingUsers, setTypingUsers] = useState<TypingUser[]>([]);
  const [firstUnreadIndex, setFirstUnreadIndex] = useState<number | null>(null);
  const firstUnreadIndexRef = useRef<number | null>(null);
  const focusPendingRef = useRef(false);

  const listRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const stickToBottomRef = useRef(true);
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
  const lastTypingSentRef = useRef(0);
  // Reconnect-safe pagination: remember the `oldest` cursor for the last
  // successful older-page fetch AND the one currently in flight. If a fetch
  // fails (e.g. offline mid-pagination), we DO NOT bump the successful
  // cursor and DO NOT set hasMore=false — the loader stays retry-ready and
  // the next click / reconnect re-issues the same query. Duplicate rows
  // are also blocked at the reducer level by id-set diffing.
  const loadOlderCursorRef = useRef<string | null>(null);
  const loadOlderInflightRef = useRef<string | null>(null);
  const selfUsernameRef = useRef<string | null>(null);
  const restoredRef = useRef(false);
  const restoredAnchorIdRef = useRef<string | null>(null);
  const persistKey = `lbc:unread:${battleId}`;

  const virtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => listRef.current,
    estimateSize: () => 44,
    getItemKey: (index) => rows[index]?.id ?? index,
    overscan: 8,
  });


  const hydrate = useCallback(async (list: Row[]) => {
    const ids = Array.from(new Set(list.map((r) => r.user_id)));
    if (ids.length === 0) return;
    const { data } = await supabase
      .from("profiles")
      .select("id, username, profile_photo_url")
      .in("id", ids);
    const map = new Map<string, { username: string | null; profile_photo_url: string | null }>();
    for (const p of (data as any[]) || []) {
      map.set(p.id, { username: p.username, profile_photo_url: p.profile_photo_url });
    }
    for (const r of list) {
      const p = map.get(r.user_id);
      r.username = p?.username ?? null;
      r.profile_photo_url = p?.profile_photo_url ?? null;
      if (user && r.user_id === user.id && r.username) {
        selfUsernameRef.current = r.username;
      }
    }
  }, [user]);

  // Scroll to the newest message. Reduced-motion honors the user's OS setting.
  // When there are unread messages, we also move keyboard focus to the FIRST
  // unread row so keyboard/screen-reader users land at the right place instead
  // of the very bottom.
  const scrollToBottom = useCallback((smooth = true) => {
    const el = listRef.current;
    if (!el) return;
    const behavior: ScrollBehavior = smooth && !reducedMotion ? "smooth" : "auto";
    const focusIdx = firstUnreadIndexRef.current;
    if (rows.length > 0) {
      virtualizer.scrollToIndex(rows.length - 1, { align: "end", behavior });
    } else {
      el.scrollTo({ top: el.scrollHeight, behavior });
    }
    stickToBottomRef.current = true;
    setIsStuck(true);
    setUnread(0);
    // Focus the first-new row after the scroll settles + virtualizer measures.
    if (focusIdx !== null && focusIdx >= 0 && focusIdx < rows.length) {
      focusPendingRef.current = true;
      const attempt = (retriesLeft: number) => {
        const target = listRef.current?.querySelector<HTMLElement>(
          `[data-index="${focusIdx}"] [data-testid="live-battle-comment"]`,
        );
        if (target) {
          target.focus({ preventScroll: true });
          focusPendingRef.current = false;
          return;
        }
        if (retriesLeft > 0) requestAnimationFrame(() => attempt(retriesLeft - 1));
      };
      requestAnimationFrame(() => attempt(6));
    }
    firstUnreadIndexRef.current = null;
    setFirstUnreadIndex(null);
  }, [rows.length, virtualizer, reducedMotion]);



  // Initial load + realtime subscription (comments + typing broadcast).
  useEffect(() => {
    if (!battleId) return;
    let cancelled = false;

    (async () => {
      const { data } = await supabase
        .from("live_battle_comments")
        .select("id, battle_id, user_id, body, created_at, hidden_at")
        .eq("battle_id", battleId)
        .order("created_at", { ascending: false })
        .limit(PAGE);
      if (cancelled) return;
      const base = ((data as Row[]) || []).reverse();
      await hydrate(base);
      if (!cancelled) {
        setRows(base);
        setHasMore((data?.length ?? 0) === PAGE);
        // Restore persisted unread state (survives a full page refresh).
        // We stash the ANCHOR ID (not index) so re-ordering, dedupes, or
        // extra realtime tail rows since the last visit don't corrupt it.
        try {
          const raw = typeof window !== "undefined" ? window.localStorage.getItem(persistKey) : null;
          if (raw) {
            const saved = JSON.parse(raw) as { unread?: number; anchorId?: string; scrollTop?: number };
            if (saved.anchorId) {
              const idx = base.findIndex((r) => r.id === saved.anchorId);
              if (idx >= 0) {
                firstUnreadIndexRef.current = idx;
                setFirstUnreadIndex(idx);
                restoredAnchorIdRef.current = saved.anchorId;
              }
            }
            if (typeof saved.unread === "number" && saved.unread > 0) {
              setUnread(saved.unread);
              stickToBottomRef.current = false;
              setIsStuck(false);
            }
            if (typeof saved.scrollTop === "number") {
              // Defer to after first paint so the virtualizer has laid rows out.
              requestAnimationFrame(() => {
                requestAnimationFrame(() => {
                  if (listRef.current) listRef.current.scrollTop = saved.scrollTop!;
                });
              });
            }
          }
        } catch { /* corrupted persistence — ignore */ }
        restoredRef.current = true;
      }
    })();

    const ch = supabase
      .channel(`live-battle-comments:${battleId}`, { config: { broadcast: { self: false } } })
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "live_battle_comments", filter: `battle_id=eq.${battleId}` },
        async (payload) => {
          const row = payload.new as Row;
          await hydrate([row]);
          let becameFirstUnread = false;
          let didAppend = false;
          setRows((prev) => {
            if (prev.some((r) => r.id === row.id)) return prev;
            didAppend = true;
            const next = [...prev, row];
            if (!stickToBottomRef.current && (!user || row.user_id !== user.id)) {
              if (firstUnreadIndexRef.current === null) {
                firstUnreadIndexRef.current = next.length - 1;
                becameFirstUnread = true;
              }
            }
            return next;
          });
          if (didAppend && !stickToBottomRef.current && (!user || row.user_id !== user.id)) {
            setUnread((n) => n + 1);
            if (becameFirstUnread) setFirstUnreadIndex(firstUnreadIndexRef.current);
          }
          // Clear the sender from typing state once their message lands.
          setTypingUsers((prev) => prev.filter((t) => t.user_id !== row.user_id));
        },
      )

      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "live_battle_comments", filter: `battle_id=eq.${battleId}` },
        (payload) => {
          const updated = payload.new as Row;
          setRows((prev) => prev.map((r) => (r.id === updated.id ? { ...r, hidden_at: updated.hidden_at } : r)));
        },
      )
      .on("broadcast", { event: "typing" }, ({ payload }) => {
        const p = payload as { user_id?: string; username?: string | null };
        if (!p?.user_id || (user && p.user_id === user.id)) return;
        setTypingUsers((prev) => {
          const rest = prev.filter((t) => t.user_id !== p.user_id);
          return [...rest, { user_id: p.user_id!, username: p.username ?? null, ts: Date.now() }];
        });
      })
      .subscribe();

    channelRef.current = ch;

    return () => {
      cancelled = true;
      channelRef.current = null;
      supabase.removeChannel(ch);
    };
  }, [battleId, hydrate, user]);

  // Expire stale typing entries.
  useEffect(() => {
    if (typingUsers.length === 0) return;
    const t = window.setInterval(() => {
      const now = Date.now();
      setTypingUsers((prev) => prev.filter((u) => now - u.ts < TYPING_TTL_MS));
    }, 1000);
    return () => window.clearInterval(t);
  }, [typingUsers.length]);

  // Track scroll position so we don't yank users away when reading history.
  const onScroll = () => {
    const el = listRef.current;
    if (!el) return;
    const stuck = el.scrollHeight - el.scrollTop - el.clientHeight < STICK_THRESHOLD_PX;
    stickToBottomRef.current = stuck;
    setIsStuck((prev) => (prev !== stuck ? stuck : prev));
    if (stuck && unread !== 0) {
      setUnread(0);
      firstUnreadIndexRef.current = null;
      setFirstUnreadIndex(null);
    }
  };


  // Auto-scroll to newest when we're already pinned to the bottom.
  useEffect(() => {
    if (!stickToBottomRef.current || rows.length === 0) return;
    virtualizer.scrollToIndex(rows.length - 1, {
      align: "end",
      behavior: reducedMotion ? "auto" : "smooth",
    });
  }, [rows.length, virtualizer, reducedMotion]);

  // Persist unread + first-unread anchor id + scroll position to
  // localStorage so a full page refresh restores the "N new" pill and
  // the reader's exact place in history.
  useEffect(() => {
    if (!restoredRef.current || typeof window === "undefined") return;
    try {
      const anchorId =
        firstUnreadIndex !== null && rows[firstUnreadIndex] ? rows[firstUnreadIndex].id : null;
      const scrollTop = listRef.current?.scrollTop ?? 0;
      if (unread === 0 && !anchorId) {
        window.localStorage.removeItem(persistKey);
      } else {
        window.localStorage.setItem(
          persistKey,
          JSON.stringify({ unread, anchorId, scrollTop }),
        );
      }
    } catch { /* quota / private mode — ignore */ }
  }, [unread, firstUnreadIndex, rows, persistKey]);

  // Cooldown countdown for accessible feedback.
  useEffect(() => {
    if (cooldownUntil === 0) return;
    const tick = () => {
      const left = Math.max(0, cooldownUntil - Date.now());
      setCooldownLeft(left);
      if (left === 0) setCooldownUntil(0);
    };
    tick();
    const t = window.setInterval(tick, 250);
    return () => window.clearInterval(t);
  }, [cooldownUntil]);

  async function loadOlder() {
    if (loadingOlder || !hasMore || rows.length === 0) return;
    const anchor = rows[0]!;
    const anchorId = anchor.id;
    const oldest = anchor.created_at;
    // Reconnect-safety guards:
    //  - Skip if a fetch for the same cursor is already in flight (double-
    //    click, retry-storm after reconnect, etc).
    //  - Skip if we've already successfully loaded this cursor once — a
    //    subsequent same-cursor click would only re-fetch identical rows
    //    and race with realtime prepends. Duplicate prevention #2.
    if (loadOlderInflightRef.current === oldest) return;
    if (loadOlderCursorRef.current === oldest) return;
    loadOlderInflightRef.current = oldest;
    setLoadingOlder(true);
    // Anchor = the top-most currently-mounted row. Its id is stable across
    // prepends AND across concurrent tail arrivals; after we insert older
    // rows in front of it, the anchor's new index = olderUnique.length.
    // Comparing the anchor's pixel offset before/after gives us an EXACT
    // scroll delta — independent of virtualizer size estimates or realtime
    // tail additions that mutate `getTotalSize()` mid-flight.
    const el = listRef.current;
    const prevScroll = el?.scrollTop ?? 0;
    const anchorOffsetBefore =
      virtualizer.getOffsetForIndex?.(0, "start")?.[0] ?? 0;
    const delta0 = prevScroll - anchorOffsetBefore;

    let data: Row[] | null = null;
    let fetchError: unknown = null;
    try {
      const res = await supabase
        .from("live_battle_comments")
        .select("id, battle_id, user_id, body, created_at, hidden_at")
        .eq("battle_id", battleId)
        .lt("created_at", oldest)
        .order("created_at", { ascending: false })
        .limit(PAGE);
      if (res.error) throw res.error;
      data = (res.data as Row[]) ?? [];
    } catch (err) {
      fetchError = err;
    }

    // Offline / network-drop path: release the inflight lock but preserve
    // the successful cursor and hasMore. The next click retries the SAME
    // query — the id-set dedupe below still guarantees no duplicates even
    // if realtime backfilled rows we now re-fetch.
    if (fetchError || data === null) {
      loadOlderInflightRef.current = null;
      setLoadingOlder(false);
      return;
    }

    const olderRaw = data.slice().reverse();
    await hydrate(olderRaw);

    let prependedCount = 0;
    setRows((prev) => {
      const existing = new Set(prev.map((r) => r.id));
      const olderUnique = olderRaw.filter((r) => !existing.has(r.id));
      prependedCount = olderUnique.length;
      return [...olderUnique, ...prev];
    });
    setHasMore(data.length === PAGE);
    // Mark this cursor as successfully consumed so a same-cursor retry
    // (e.g. from a stale button press after reconnect) is a no-op.
    loadOlderCursorRef.current = oldest;
    loadOlderInflightRef.current = null;
    setLoadingOlder(false);

    // A first-unread index tracked from realtime arrivals must shift by the
    // same prepended count so keyboard focus still lands on the right row.
    if (firstUnreadIndexRef.current !== null && prependedCount > 0) {
      firstUnreadIndexRef.current += prependedCount;
      setFirstUnreadIndex(firstUnreadIndexRef.current);
    }

    // Restore the exact viewport by relocating our anchor row. Use two rAFs
    // so the virtualizer has measured the newly prepended rows first.
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        if (!el) return;
        const newIdx = prependedCount; // anchor now sits at this index
        const anchorOffsetAfter =
          virtualizer.getOffsetForIndex?.(newIdx, "start")?.[0] ?? null;
        if (anchorOffsetAfter !== null) {
          el.scrollTop = anchorOffsetAfter + delta0;
        } else {
          // Fallback: locate by DOM if virtualizer API isn't available.
          const node = el.querySelector<HTMLElement>(
            `[data-anchor-id="${CSS.escape(anchorId)}"]`,
          );
          if (node) el.scrollTop = node.offsetTop + delta0;
        }
      });
    });
  }




  async function broadcastTyping() {
    if (!channelRef.current || !user) return;
    const now = Date.now();
    // Client-side pre-throttle avoids hammering the RPC. Server enforces
    // the authoritative rate limit regardless of what any client does.
    if (now - lastTypingSentRef.current < TYPING_THROTTLE_MS) {
      if (typeof window !== "undefined") {
        (window as any).__lbcTypingThrottled = ((window as any).__lbcTypingThrottled ?? 0) + 1;
      }
      return;
    }
    lastTypingSentRef.current = now;
    if (typeof window !== "undefined") {
      (window as any).__lbcTypingSent = ((window as any).__lbcTypingSent ?? 0) + 1;
    }
    // Server-side rate-limited broadcast. Silently returns false if the
    // server throttles us — we don't surface that to the user.
    try {
      await supabase.rpc("broadcast_live_battle_typing", { _battle_id: battleId });
    } catch {
      /* ignore — typing indicator is best-effort */
    }
  }



  async function submit() {
    if (!user) {
      toast({ title: "Sign in to join the chat.", variant: "destructive" });
      return;
    }
    const body = text.trim();
    if (!body || sending || !isLive) return;
    if (Date.now() < cooldownUntil) return;
    setSending(true);
    const optimistic: Row = {
      id: `opt-${crypto.randomUUID()}`,
      battle_id: battleId,
      user_id: user.id,
      body,
      created_at: new Date().toISOString(),
    };
    await hydrate([optimistic]);
    setRows((prev) => [...prev, optimistic]);
    setText("");
    stickToBottomRef.current = true;
    setIsStuck(true);
    setUnread(0);
    try {
      const { error } = await supabase
        .from("live_battle_comments")
        .insert({ battle_id: battleId, user_id: user.id, body });
      if (error) throw error;
      setJustSent(true);
      window.setTimeout(() => setJustSent(false), 900);
      setCooldownUntil(Date.now() + COOLDOWN_MS);
    } catch (e: any) {
      setRows((prev) => prev.filter((r) => r.id !== optimistic.id));
      toast({
        title: "Couldn't send your comment.",
        description: /policy|denied/i.test(e?.message || "") ? "This battle isn't live anymore." : "Please try again.",
        variant: "destructive",
      });
    } finally {
      setSending(false);
      inputRef.current?.focus();
    }
  }

  async function hideComment(row: Row, hide: boolean) {
    try {
      const { error } = await supabase.rpc("admin_hide_live_battle_comment", {
        _comment_id: row.id,
        _hide: hide,
        _reason: null,
      });
      if (error) throw error;
      setRows((prev) => prev.map((r) => (r.id === row.id ? { ...r, hidden_at: hide ? new Date().toISOString() : null } : r)));
      toast({ title: hide ? "Comment hidden" : "Comment restored" });
    } catch (e: any) {
      toast({ title: "Moderation action failed", description: "Please try again.", variant: "destructive" });
    }
  }

  const cooldownSeconds = Math.ceil(cooldownLeft / 1000);
  const canSend = !!user && isLive && !sending && text.trim().length > 0 && cooldownLeft === 0;
  const remaining = MAX - text.length;

  const typingLabel = useMemo(() => {
    if (typingUsers.length === 0) return "";
    const names = typingUsers
      .map((t) => (t.username ? `@${t.username}` : "Someone"))
      .slice(0, 2);
    if (typingUsers.length === 1) return `${names[0]} is typing…`;
    if (typingUsers.length === 2) return `${names[0]} and ${names[1]} are typing…`;
    return `${names[0]}, ${names[1]} and ${typingUsers.length - 2} more are typing…`;
  }, [typingUsers]);

  const virtualItems = virtualizer.getVirtualItems();
  const totalSize = virtualizer.getTotalSize();

  return (
    <section
      className={
        overlay
          ? "absolute inset-x-0 bottom-0 z-20 flex flex-col pointer-events-none"
          : "border-t border-border bg-card/60"
      }
      data-testid="live-battle-comments"
      aria-label="Live battle chat"
    >
      {!overlay && (
        <header className="flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
          <MessageSquare className="w-3.5 h-3.5" aria-hidden /> Live chat
          <span className="text-[10px] text-muted-foreground/70 normal-case ml-auto">
            {rows.length} {rows.length === 1 ? "comment" : "comments"}
          </span>
        </header>
      )}

      <div className="relative">
        <div
          ref={listRef}
          onScroll={onScroll}
          className={
            overlay
              ? "pointer-events-auto max-h-[45vh] min-h-[6rem] overflow-y-auto overscroll-contain px-3 pb-2 pt-8 [mask-image:linear-gradient(to_bottom,transparent,black_25%,black)]"
              : "max-h-52 min-h-[6rem] overflow-y-auto overscroll-contain px-3 pb-2"
          }
          data-testid="live-battle-comments-list"
          role="log"
          aria-live="polite"
          aria-relevant="additions"
          aria-label="Live battle chat messages"
          tabIndex={0}
        >
          {hasMore && rows.length >= PAGE && (
            <div className="flex justify-center py-1">
              <Button
                size="sm"
                variant="ghost"
                onClick={loadOlder}
                disabled={loadingOlder}
                aria-label="Load older comments"
                data-testid="live-battle-comments-load-older"
                className="h-7 text-[11px]"
              >
                {loadingOlder ? (
                  <><Loader2 className="w-3 h-3 mr-1 animate-spin" aria-hidden /> Loading…</>
                ) : (
                  <><ChevronUp className="w-3 h-3 mr-1" aria-hidden /> Load older</>
                )}
              </Button>
            </div>
          )}

          {rows.length === 0 ? (
            <p className={`text-xs text-center py-4 ${overlay ? "text-white/70 [text-shadow:0_1px_2px_rgba(0,0,0,0.6)]" : "text-muted-foreground"}`} role="status">
              {isLive ? "Be the first to say something." : "Chat opens when the battle goes live."}
            </p>
          ) : (
            <div style={{ height: totalSize, position: "relative", width: "100%" }}>
              {virtualItems.map((vi) => {
                const r = rows[vi.index];
                if (!r) return null;
                const isHidden = !!r.hidden_at;
                const canReport = !!user && user.id !== r.user_id && !r.id.startsWith("opt-");
                const canModerate = isModerator && !r.id.startsWith("opt-");
                return (
                  <div
                    key={vi.key}
                    ref={virtualizer.measureElement}
                    data-index={vi.index}
                    data-anchor-id={r.id}
                    style={{
                      position: "absolute",
                      top: 0,
                      left: 0,
                      width: "100%",
                      transform: `translateY(${vi.start}px)`,
                      paddingBottom: 6,
                    }}
                  >
                    <div
                      className={`flex items-start gap-2 group outline-none focus-visible:ring-2 focus-visible:ring-primary/60 rounded-md ${
                        reducedMotion ? "" : "animate-in fade-in slide-in-from-bottom-1 duration-200"
                      } ${isHidden ? "opacity-50" : ""} ${
                        overlay ? "rounded-full bg-black/40 backdrop-blur-sm pl-1 pr-3 py-1 w-fit max-w-[85%] [text-shadow:0_1px_2px_rgba(0,0,0,0.6)]" : ""
                      }`}
                      data-testid="live-battle-comment"
                      data-hidden={isHidden ? "true" : "false"}
                      data-first-unread={firstUnreadIndex === vi.index ? "true" : "false"}
                      tabIndex={-1}
                    >


                      {r.profile_photo_url ? (
                        <img src={r.profile_photo_url} alt="" className="w-6 h-6 rounded-full object-cover shrink-0" />
                      ) : (
                        <div className="w-6 h-6 rounded-full bg-muted shrink-0" aria-hidden />
                      )}
                      <div className="min-w-0 flex-1 text-sm leading-snug">
                        <span className={`font-semibold mr-1.5 ${overlay ? "text-white" : "text-foreground/90"}`}>
                          @{r.username ?? r.user_id.slice(0, 6)}
                        </span>
                        {isHidden ? (
                          <span className={`italic text-xs ${overlay ? "text-white/60" : "text-muted-foreground"}`}>
                            [hidden by moderator]
                          </span>
                        ) : (
                          <span className={`break-words ${overlay ? "text-white/95" : "text-foreground/80"}`}>{r.body}</span>
                        )}
                      </div>
                      {(canReport || canModerate) && (
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <button
                              type="button"
                              aria-label={`Comment options for @${r.username ?? "user"}`}
                              className="opacity-0 group-hover:opacity-100 focus:opacity-100 text-muted-foreground hover:text-foreground shrink-0 p-1 rounded"
                              data-testid="live-battle-comment-menu"
                            >
                              <MoreHorizontal className="w-4 h-4" aria-hidden />
                            </button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            {canReport && (
                              <DropdownMenuItem onClick={() => setReportFor(r)}>
                                <Flag className="w-3.5 h-3.5 mr-2" aria-hidden /> Report
                              </DropdownMenuItem>
                            )}
                            {canModerate && !isHidden && (
                              <DropdownMenuItem onClick={() => hideComment(r, true)}>
                                <EyeOff className="w-3.5 h-3.5 mr-2" aria-hidden /> Hide comment
                              </DropdownMenuItem>
                            )}
                            {canModerate && isHidden && (
                              <DropdownMenuItem onClick={() => hideComment(r, false)}>
                                <Eye className="w-3.5 h-3.5 mr-2" aria-hidden /> Unhide
                              </DropdownMenuItem>
                            )}
                          </DropdownMenuContent>
                        </DropdownMenu>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Jump-to-latest pill floats above the composer when the user has scrolled up. */}
        {!isStuck && rows.length > 0 && (
          <div className="pointer-events-none absolute inset-x-0 -top-2 flex justify-center -translate-y-full">
            <Button
              type="button"
              size="sm"
              onClick={() => scrollToBottom(true)}
              aria-label={
                unread > 0
                  ? `Jump to latest — ${unread} new ${unread === 1 ? "message" : "messages"}`
                  : "Jump to latest messages"
              }
              data-testid="live-battle-comments-jump-latest"
              data-reduced-motion={reducedMotion ? "true" : "false"}
              className={`pointer-events-auto h-7 rounded-full bg-primary text-primary-foreground shadow-lg text-[11px] px-3 ${
                reducedMotion ? "" : "animate-in fade-in slide-in-from-bottom-2"
              }`}
            >
              <ArrowDown className="w-3 h-3 mr-1" aria-hidden />
              {unread > 0 ? `${unread} new` : "Jump to latest"}
            </Button>
          </div>
        )}
      </div>


      {/* Typing indicator — announced politely for assistive tech. */}
      <div
        className={`px-3 pt-1 text-[11px] italic ${overlay ? "text-white/80 [text-shadow:0_1px_2px_rgba(0,0,0,0.6)]" : "text-muted-foreground"} min-h-[1.25em]`}
        role="status"
        aria-live="polite"
        aria-atomic="true"
        data-testid="live-battle-comments-typing"
      >
        {typingLabel && (
          <span className="inline-flex items-center gap-1">
            <span className="inline-flex gap-0.5" aria-hidden data-reduced-motion={reducedMotion ? "true" : "false"}>
              <span className={`w-1 h-1 rounded-full bg-current ${reducedMotion ? "opacity-70" : "animate-bounce [animation-delay:-0.2s]"}`} />
              <span className={`w-1 h-1 rounded-full bg-current ${reducedMotion ? "opacity-70" : "animate-bounce [animation-delay:-0.1s]"}`} />
              <span className={`w-1 h-1 rounded-full bg-current ${reducedMotion ? "opacity-70" : "animate-bounce"}`} />
            </span>
            {typingLabel}
          </span>
        )}

      </div>

      <form
        className={
          overlay
            ? "pointer-events-auto flex flex-col gap-1 px-3 py-2"
            : "flex flex-col gap-1 border-t border-border/60 px-3 py-2"
        }
        onSubmit={(e) => { e.preventDefault(); submit(); }}
      >
        <div className="flex items-center gap-2">
          <label htmlFor={`lbc-input-${battleId}`} className="sr-only">
            Live battle chat message
          </label>
          <Input
            id={`lbc-input-${battleId}`}
            ref={inputRef}
            value={text}
            onChange={(e) => {
              setText(e.target.value.slice(0, MAX));
              if (e.target.value.trim().length > 0) broadcastTyping();
            }}
            placeholder={isLive ? "Say something…" : "Chat is closed"}
            disabled={!isLive || sending || !user}
            maxLength={MAX}
            data-testid="live-battle-comment-input"
            aria-label="Live battle chat message"
            aria-describedby={`lbc-status-${battleId} lbc-count-${battleId}`}
            aria-invalid={remaining < 0 ? "true" : undefined}
            autoComplete="off"
            className={overlay ? "rounded-full bg-black/40 backdrop-blur-sm border-white/20 text-white placeholder:text-white/60" : undefined}
          />
          <Button
            type="submit"
            size="icon"
            disabled={!canSend}
            aria-label={
              sending ? "Sending comment" :
              justSent ? "Comment sent" :
              cooldownLeft > 0 ? `Wait ${cooldownSeconds} seconds before sending again` :
              "Send comment"
            }
            data-testid="live-battle-comment-send"
            className="transition-transform active:scale-95"
          >
            {sending ? (
              <Loader2 className="w-4 h-4 animate-spin" aria-hidden />
            ) : justSent ? (
              <Check className="w-4 h-4 animate-in zoom-in-50 duration-200" aria-hidden />
            ) : (
              <Send className="w-4 h-4" aria-hidden />
            )}
          </Button>
        </div>
        <div className="flex items-center justify-between text-[10px] text-muted-foreground px-0.5">
          <span
            id={`lbc-status-${battleId}`}
            role="status"
            aria-live="polite"
            className="min-h-[1em]"
            data-testid="live-battle-comment-status"
          >
            {sending && "Sending…"}
            {!sending && justSent && "Sent"}
            {!sending && !justSent && cooldownLeft > 0 && `Slow down — you can chat again in ${cooldownSeconds}s`}
          </span>
          <span
            id={`lbc-count-${battleId}`}
            className={remaining <= 20 ? "text-primary" : ""}
            aria-live="off"
          >
            {text.length}/{MAX}
          </span>
        </div>
      </form>

      <ReportCommentDialog
        row={reportFor}
        battleId={battleId}
        onClose={() => setReportFor(null)}
      />
    </section>
  );
}

function ReportCommentDialog({
  row,
  battleId,
  onClose,
}: {
  row: Row | null;
  battleId: string;
  onClose: () => void;
}) {
  const { user } = useAuth();
  const [reason, setReason] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!row) setReason("");
  }, [row]);

  async function submit() {
    if (!row || !user) return;
    const trimmed = reason.trim();
    if (!trimmed) {
      toast({ title: "Add a short reason.", variant: "destructive" });
      return;
    }
    setSubmitting(true);
    try {
      const { error } = await supabase.from("live_battle_comment_reports").insert({
        comment_id: row.id,
        battle_id: battleId,
        reporter_id: user.id,
        reason: trimmed,
      });
      if (error) {
        // Duplicate report → treat as already-reported.
        if (/duplicate|unique/i.test(error.message)) {
          toast({ title: "You've already reported this comment." });
        } else {
          throw error;
        }
      } else {
        toast({ title: "Thanks — report submitted." });
      }
      onClose();
    } catch (e) {
      toast({ title: "Couldn't submit report. Please try again.", variant: "destructive" });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog open={!!row} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Report comment</DialogTitle>
          <DialogDescription>
            Tell us what's wrong. Moderators review reports and can hide abusive comments.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-2">
          <label htmlFor="lbc-report-reason" className="text-xs font-medium text-muted-foreground">
            Reason
          </label>
          <Textarea
            id="lbc-report-reason"
            value={reason}
            onChange={(e) => setReason(e.target.value.slice(0, 500))}
            placeholder="Harassment, hate speech, spam…"
            maxLength={500}
            className="min-h-24"
            autoFocus
          />
          <div className="text-[10px] text-muted-foreground text-right">{reason.length}/500</div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose} disabled={submitting}>Cancel</Button>
          <Button onClick={submit} disabled={submitting || !reason.trim()}>
            {submitting ? <Loader2 className="w-4 h-4 mr-2 animate-spin" aria-hidden /> : <Flag className="w-4 h-4 mr-2" aria-hidden />}
            Submit report
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
