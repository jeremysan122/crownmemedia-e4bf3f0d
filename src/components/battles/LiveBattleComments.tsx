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
}: {
  battleId: string;
  isLive: boolean;
  overlay?: boolean;
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
  const selfUsernameRef = useRef<string | null>(null);

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
    setLoadingOlder(true);
    const oldest = rows[0]!.created_at;
    const el = listRef.current;
    const prevTotal = virtualizer.getTotalSize();
    const prevScroll = el?.scrollTop ?? 0;
    const { data } = await supabase
      .from("live_battle_comments")
      .select("id, battle_id, user_id, body, created_at, hidden_at")
      .eq("battle_id", battleId)
      .lt("created_at", oldest)
      .order("created_at", { ascending: false })
      .limit(PAGE);
    const olderRaw = ((data as Row[]) || []).reverse();
    await hydrate(olderRaw);
    // Dedup against current rows so any comment that arrived via realtime
    // during the fetch (or overlaps the boundary) never appears twice.
    setRows((prev) => {
      const existing = new Set(prev.map((r) => r.id));
      const olderUnique = olderRaw.filter((r) => !existing.has(r.id));
      return [...olderUnique, ...prev];
    });
    setHasMore((data?.length ?? 0) === PAGE);
    setLoadingOlder(false);
    // Preserve scroll offset so newly prepended rows don't jump the view.
    // Use rAF twice so the virtualizer has re-measured before we compute the delta.
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        if (!el) return;
        const diff = virtualizer.getTotalSize() - prevTotal;
        el.scrollTop = prevScroll + diff;
      });
    });
  }


  function broadcastTyping() {
    if (!channelRef.current || !user) return;
    const now = Date.now();
    if (now - lastTypingSentRef.current < TYPING_THROTTLE_MS) return;
    lastTypingSentRef.current = now;
    channelRef.current.send({
      type: "broadcast",
      event: "typing",
      payload: { user_id: user.id, username: selfUsernameRef.current },
    });
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
                      className={`flex items-start gap-2 group ${
                        reducedMotion ? "" : "animate-in fade-in slide-in-from-bottom-1 duration-200"
                      } ${isHidden ? "opacity-50" : ""} ${
                        overlay ? "rounded-full bg-black/40 backdrop-blur-sm pl-1 pr-3 py-1 w-fit max-w-[85%] [text-shadow:0_1px_2px_rgba(0,0,0,0.6)]" : ""
                      }`}
                      data-testid="live-battle-comment"
                      data-hidden={isHidden ? "true" : "false"}
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
