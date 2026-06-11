import { useEffect, useMemo, useRef, useState, useCallback } from "react";
import { Link, useParams } from "react-router-dom";
import AppShell from "@/components/AppShell";
import { useSeoMeta } from "@/hooks/useSeoMeta";
import { trackUsage, trackUsageEvent } from "@/lib/usageTrack";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/context/AuthContext";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Send, Check, CheckCheck, Clock, Paperclip, X, Search, BellOff, Bell, RotateCw, Loader2, Trash2, MailOpen, Mail, CheckSquare, Pin, PinOff, MoreVertical, Flag, Ban, RefreshCw } from "lucide-react";
import {
  DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { usePinnedThreads } from "@/hooks/usePinnedThreads";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { timeAgo } from "@/lib/crown";
import { useRealtimeChannel } from "@/hooks/useRealtimeChannel";
import { useThreadUnread } from "@/hooks/useThreadUnread";
import { useTypingIndicator } from "@/hooks/useTypingIndicator";
import { useDmMute } from "@/hooks/useDmMute";
import { dmPairFolder, formatBytes } from "@/lib/dm";
import { computeReactionTotalsForMessages } from "@/lib/reactionTotals";
import MessageReactions from "@/components/messages/MessageReactions";
import DmAttachment from "@/components/messages/DmAttachment";
import { toast } from "@/hooks/use-toast";
import GiftReceiptCard from "@/components/messages/GiftReceiptCard";

type Msg = {
  id: string;
  sender_id: string;
  receiver_id: string;
  body: string | null;
  created_at: string;
  read: boolean;
  delivered_at: string | null;
  attachment_path: string | null;
  attachment_name: string | null;
  attachment_size: number | null;
  attachment_type: string | null;
  kind?: string | null;
  gift_transaction_id?: string | null;
  gift_seen_at?: string | null;
  _pending?: boolean;
  _failed?: boolean;
};

type Reaction = { id: string; message_id: string; user_id: string; emoji: string };

const PAGE_SIZE = 30;
const MAX_FILE_BYTES = 10 * 1024 * 1024;

function MessageStatus({ m, mine }: { m: Msg; mine: boolean }) {
  if (!mine) return null;
  if (m._failed) return <span className="text-[10px] text-destructive ml-1">Failed</span>;
  if (m._pending) return <Clock size={12} className="opacity-60 ml-1" />;
  if (m.read) return <CheckCheck size={12} className="text-primary ml-1" />;
  if (m.delivered_at) return <CheckCheck size={12} className="opacity-70 ml-1" />;
  return <Check size={12} className="opacity-60 ml-1" />;
}

function highlight(body: string | null, query: string) {
  if (!body || !query.trim()) return body;
  const q = query.trim();
  const i = body.toLowerCase().indexOf(q.toLowerCase());
  if (i < 0) return body;
  return (
    <>
      {body.slice(0, i)}
      <mark className="bg-primary/40 text-foreground rounded px-0.5">{body.slice(i, i + q.length)}</mark>
      {body.slice(i + q.length)}
    </>
  );
}

type UploadResult = { ok: true; error?: undefined } | { ok: false; error: string };

/** Upload a Blob to Storage with progress via XHR. Returns the storage path on success. */
function uploadWithProgress(
  publicUploadUrl: string,
  token: string,
  file: File,
  onProgress: (p: number) => void,
): Promise<UploadResult> {
  return new Promise<UploadResult>((resolve) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", publicUploadUrl);
    xhr.setRequestHeader("Authorization", `Bearer ${token}`);
    xhr.setRequestHeader("x-upsert", "false");
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) onProgress(Math.round((e.loaded / e.total) * 100));
    };
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) resolve({ ok: true });
      else resolve({ ok: false, error: `HTTP ${xhr.status}: ${xhr.responseText || "Upload failed"}` });
    };
    xhr.onerror = () => resolve({ ok: false, error: "Network error during upload" });
    xhr.onabort = () => resolve({ ok: false, error: "Upload aborted" });
    const fd = new FormData();
    fd.append("", file, file.name);
    xhr.send(fd);
  });
}

/** Animated chip that pops briefly whenever its count changes. */
function EmojiTotalChip({ emoji, count }: { emoji: string; count: number }) {
  const [pulse, setPulse] = useState(0);
  const prev = useRef(count);
  useEffect(() => {
    if (prev.current !== count) {
      prev.current = count;
      setPulse((p) => p + 1);
    }
  }, [count]);
  return (
    <span className="text-xs px-1.5 h-5 rounded-full border border-border bg-background/50 flex items-center gap-1 tabular-nums shrink-0">
      <span key={`e-${pulse}`} className="inline-block animate-vote-burst">{emoji}</span>
      <span key={`n-${pulse}`} className="inline-block animate-vote-burst">{count}</span>
    </span>
  );
}

export default function Messages() {
  useSeoMeta({ title: "Messages · CrownMe", noIndex: true });
  const { otherId } = useParams();
  const { user } = useAuth();
  useEffect(() => { trackUsage("dm_opened", otherId ?? "inbox"); }, [otherId]);
  const [threads, setThreads] = useState<any[]>([]);
  const [messages, setMessages] = useState<Msg[]>([]);
  const messagesRef = useRef<Msg[]>([]);
  const [reactions, setReactions] = useState<Reaction[]>([]);
  const [text, setText] = useState("");
  const [other, setOther] = useState<any>(null);
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [uploadProgress, setUploadProgress] = useState<number | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [hasMore, setHasMore] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const topSentinelRef = useRef<HTMLDivElement>(null);
  const oldestRef = useRef<string | null>(null);
  const skipNextAutoScroll = useRef(false);

  const unreadByThread = useThreadUnread();
  const { otherTyping, ping: pingTyping } = useTypingIndicator(user?.id, otherId);
  const { muted, toggle: toggleMute, loading: muteLoading } = useDmMute(otherId);

  // ---------- INBOX (paginated, 50 messages per page) ----------
  const INBOX_PAGE = 50;
  const inboxOldestRef = useRef<string | null>(null);
  const [inboxHasMore, setInboxHasMore] = useState(true);
  const [inboxLoading, setInboxLoading] = useState(false);

  const mergeIntoThreads = useCallback((rows: any[], reset: boolean) => {
    if (!user) return;
    setThreads((prev) => {
      const map = new Map<string, any>();
      if (!reset) prev.forEach((t) => map.set(t.otherId, t));
      rows.forEach((m: any) => {
        const oid = m.sender_id === user.id ? m.receiver_id : m.sender_id;
        const existing = map.get(oid);
        // Keep the newest message per thread.
        if (!existing || new Date(m.created_at) > new Date(existing.created_at)) {
          map.set(oid, { ...m, otherId: oid, other: m.sender_id === user.id ? m.receiver : m.sender });
        }
      });
      return Array.from(map.values()).sort(
        (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
      );
    });
  }, [user?.id]);

  const loadInboxPage = useCallback(async (reset: boolean) => {
    if (!user) return;
    setInboxLoading(true);
    let q = supabase
      .from("messages")
      .select("*, sender:profiles!messages_sender_id_fkey(username, profile_photo_url), receiver:profiles!messages_receiver_id_fkey(username, profile_photo_url)")
      .or(`sender_id.eq.${user.id},receiver_id.eq.${user.id}`)
      .order("created_at", { ascending: false })
      .limit(INBOX_PAGE);
    const before = reset ? null : inboxOldestRef.current;
    if (before) q = q.lt("created_at", before);
    const { data } = await q;
    const rows = (data || []) as any[];
    if (reset) inboxOldestRef.current = null;
    mergeIntoThreads(rows, reset);
    if (rows.length) inboxOldestRef.current = rows[rows.length - 1].created_at;
    setInboxHasMore(rows.length === INBOX_PAGE);
    setInboxLoading(false);
  }, [user?.id, mergeIntoThreads]);

  // Back-compat shim used by realtime + send flows.
  const loadInbox = useCallback(() => loadInboxPage(true), [loadInboxPage]);

  useEffect(() => { if (!otherId) loadInboxPage(true); }, [otherId, loadInboxPage]);


  // ---------- THREAD (paginated) ----------
  const fetchPage = useCallback(async (before: string | null) => {
    if (!user || !otherId) return [] as Msg[];
    let q = supabase
      .from("messages")
      .select("*")
      .or(`and(sender_id.eq.${user.id},receiver_id.eq.${otherId}),and(sender_id.eq.${otherId},receiver_id.eq.${user.id})`)
      .order("created_at", { ascending: false })
      .limit(PAGE_SIZE);
    if (before) q = q.lt("created_at", before);
    const { data } = await q;
    return ((data as Msg[]) || []).reverse();
  }, [user?.id, otherId]);

  const loadReactionsFor = useCallback(async (ids: string[]) => {
    if (!ids.length) return [] as Reaction[];
    const { data } = await supabase.from("message_reactions").select("*").in("message_id", ids);
    return (data as Reaction[]) || [];
  }, []);

  const loadInitialThread = useCallback(async () => {
    if (!user || !otherId) return;
    const page = await fetchPage(null);
    // Atomic load: fetch reactions for the page BEFORE committing to state
    // so realtime patches always layer on an authoritative snapshot.
    const rx = await loadReactionsFor(page.map((m) => m.id));
    setMessages(page);
    setReactions(rx);
    oldestRef.current = page[0]?.created_at ?? null;
    setHasMore(page.length === PAGE_SIZE);
  }, [user?.id, otherId, fetchPage, loadReactionsFor]);

  const loadMore = useCallback(async () => {
    if (!hasMore || loadingMore || !oldestRef.current) return;
    setLoadingMore(true);
    const container = scrollRef.current;
    const prevHeight = container?.scrollHeight ?? 0;
    const prevTop = container?.scrollTop ?? 0;

    // Fetch older messages, then their reactions, as a single authoritative
    // batch. Both pieces are committed together so realtime events can never
    // be applied between message append and reaction merge.
    const older = await fetchPage(oldestRef.current);
    if (older.length) {
      const olderIds = older.map((m) => m.id);
      const olderRx = await loadReactionsFor(olderIds);
      skipNextAutoScroll.current = true;
      setMessages((prev) => {
        const existing = new Set(prev.map((m) => m.id));
        const fresh = older.filter((m) => !existing.has(m.id));
        return [...fresh, ...prev];
      });
      oldestRef.current = older[0].created_at;
      // Replace any locally-known reactions for these message ids with the
      // authoritative server snapshot to prevent duplicate counts.
      setReactions((prev) => {
        const idsSet = new Set(olderIds);
        const kept = prev.filter((r) => !idsSet.has(r.message_id));
        const seen = new Set(kept.map((r) => r.id));
        return [...kept, ...olderRx.filter((r) => !seen.has(r.id))];
      });
      requestAnimationFrame(() => {
        if (container) {
          const newHeight = container.scrollHeight;
          container.scrollTop = prevTop + (newHeight - prevHeight);
        }
      });
    }
    if (older.length < PAGE_SIZE) setHasMore(false);
    setLoadingMore(false);
  }, [hasMore, loadingMore, fetchPage, loadReactionsFor]);

  // Keep ref current so the resync interval always sees latest messages
  // without being recreated on every new message (which would reset the 30s timer).
  useEffect(() => { messagesRef.current = messages; }, [messages]);

  // Periodic authoritative resync of reaction snapshot for currently-loaded
  // messages — guards against drift from missed realtime events.
  useEffect(() => {
    if (!user || !otherId) return;
    const id = window.setInterval(async () => {
      const ids = messagesRef.current.map((m) => m.id);
      if (!ids.length) return;
      const fresh = await loadReactionsFor(ids);
      setReactions((prev) => {
        const idsSet = new Set(ids);
        const kept = prev.filter((r) => !idsSet.has(r.message_id));
        return [...kept, ...fresh];
      });
    }, 30_000);
    return () => window.clearInterval(id);
  }, [user?.id, otherId, loadReactionsFor]);

  useEffect(() => {
    if (!user || !otherId) return;
    setMessages([]);
    setReactions([]);
    setSearch("");
    setHasMore(true);
    oldestRef.current = null;
    supabase.from("profiles").select("id, username, profile_photo_url").eq("id", otherId).maybeSingle().then(({ data }) => setOther(data));
    loadInitialThread();
  }, [user?.id, otherId, loadInitialThread]);

  // Auto-scroll to bottom on new messages, but NOT after prepending older ones
  useEffect(() => {
    if (skipNextAutoScroll.current) {
      skipNextAutoScroll.current = false;
      return;
    }
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages.length]);

  // Infinite-scroll: trigger load when sentinel is visible
  useEffect(() => {
    const sentinel = topSentinelRef.current;
    const container = scrollRef.current;
    if (!sentinel || !container) return;
    const io = new IntersectionObserver(
      (entries) => { if (entries[0].isIntersecting) loadMore(); },
      { root: container, rootMargin: "120px 0px 0px 0px", threshold: 0 },
    );
    io.observe(sentinel);
    return () => io.disconnect();
  }, [loadMore]);

  // Mark received messages delivered + read
  useEffect(() => {
    if (!user || !otherId || !messages.length) return;
    const unread = messages.filter((m) => m.receiver_id === user.id && (!m.read || !m.delivered_at));
    if (!unread.length) return;
    const ids = unread.map((m) => m.id);
    supabase.from("messages").update({ read: true, delivered_at: new Date().toISOString() }).in("id", ids).then(() => {});
  }, [messages, user?.id, otherId]);

  // ---------- REALTIME (own user channel) ----------
  useRealtimeChannel(
    user?.id ?? null,
    (ch) =>
      ch
        .on(
          "postgres_changes",
          { event: "INSERT", schema: "public", table: "messages", filter: `receiver_id=eq.${user?.id}` },
          (payload) => {
            const m = payload.new as Msg;
            if (otherId && m.sender_id === otherId) {
              setMessages((prev) => (prev.find((x) => x.id === m.id) ? prev : [...prev, m]));
            } else {
              loadInbox();
            }
          },
        )
        .on(
          "postgres_changes",
          { event: "UPDATE", schema: "public", table: "messages", filter: `sender_id=eq.${user?.id}` },
          (payload) => {
            const m = payload.new as Msg;
            setMessages((prev) => prev.map((x) => (x.id === m.id ? { ...x, ...m } : x)));
            if (!otherId) loadInbox();
          },
        )
        // Inbox: outgoing messages should appear as a thread preview instantly.
        .on(
          "postgres_changes",
          { event: "INSERT", schema: "public", table: "messages", filter: `sender_id=eq.${user?.id}` },
          () => { if (!otherId) loadInbox(); },
        )
        // Inbox: read-state changes on messages I received update unread badges.
        .on(
          "postgres_changes",
          { event: "UPDATE", schema: "public", table: "messages", filter: `receiver_id=eq.${user?.id}` },
          () => { if (!otherId) loadInbox(); },
        )
        // Thread/inbox cleanup when either side deletes messages.
        .on(
          "postgres_changes",
          { event: "DELETE", schema: "public", table: "messages" },
          (payload) => {
            const m = payload.old as Msg;
            if (m.sender_id !== user?.id && m.receiver_id !== user?.id) return;
            setMessages((prev) => prev.filter((x) => x.id !== m.id));
            if (!otherId) loadInbox();
          },
        )
        // Live reactions: only patch state for messages currently in the thread
        .on(
          "postgres_changes",
          { event: "INSERT", schema: "public", table: "message_reactions" },
          (payload) => {
            const r = payload.new as Reaction;
            setMessages((curMsgs) => {
              const inThread = curMsgs.some((m) => m.id === r.message_id);
              if (inThread) {
                setReactions((prev) => (prev.find((x) => x.id === r.id) ? prev : [...prev, r]));
              }
              return curMsgs;
            });
          },
        )
        .on(
          "postgres_changes",
          { event: "DELETE", schema: "public", table: "message_reactions" },
          (payload) => {
            const r = payload.old as Reaction;
            setReactions((prev) => prev.filter((x) => x.id !== r.id));
          },
        ),
    () => {
      if (otherId) loadInitialThread();
      else loadInbox();
    },
    [user?.id, otherId],
  );

  // ---------- ATTACHMENTS ----------
  const onPickFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    if (f.size > MAX_FILE_BYTES) {
      toast({ title: "File too large", description: "Max 10MB.", variant: "destructive" });
      return;
    }
    setPendingFile(f);
    setUploadError(null);
    setUploadProgress(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const doUpload = async (file: File): Promise<{ path: string; name: string; size: number; type: string } | null> => {
    if (!user || !otherId) return null;
    const folder = dmPairFolder(user.id, otherId);
    const ext = file.name.includes(".") ? file.name.split(".").pop() : "bin";
    const path = `${folder}/${user.id}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
    const { data: sess } = await supabase.auth.getSession();
    const token = sess.session?.access_token;
    const url = `${import.meta.env.VITE_SUPABASE_URL}/storage/v1/object/dm-attachments/${path}`;
    setUploadProgress(0);
    setUploadError(null);
    if (!token) {
      setUploadError("Not signed in");
      return null;
    }
    const res = await uploadWithProgress(url, token, file, (p) => setUploadProgress(p));
    if (!res.ok) {
      setUploadError(res.error);
      return null;
    }
    setUploadProgress(100);
    return { path, name: file.name, size: file.size, type: file.type || "application/octet-stream" };
  };

  const retryUpload = async () => {
    if (!pendingFile) return;
    await doUpload(pendingFile);
  };

  // ---------- SEND ----------
  const send = async () => {
    if (!user || !otherId) return;
    const body = text.trim().slice(0, 1000);
    if (!body && !pendingFile) return;

    let uploaded: Awaited<ReturnType<typeof doUpload>> = null;
    if (pendingFile) {
      uploaded = await doUpload(pendingFile);
      if (!uploaded) return; // keep file + error visible so user can retry
    }

    const tempId = `tmp-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    const optimistic: Msg = {
      id: tempId,
      sender_id: user.id,
      receiver_id: otherId,
      body: body || null,
      created_at: new Date().toISOString(),
      read: false,
      delivered_at: null,
      attachment_path: uploaded?.path ?? null,
      attachment_name: uploaded?.name ?? null,
      attachment_size: uploaded?.size ?? null,
      attachment_type: uploaded?.type ?? null,
      _pending: true,
    };
    setMessages((prev) => [...prev, optimistic]);
    setText("");
    setPendingFile(null);
    setUploadProgress(null);
    setUploadError(null);

    const { data, error } = await supabase
      .from("messages")
      .insert({
        sender_id: user.id,
        receiver_id: otherId,
        body: body || null,
        attachment_path: uploaded?.path ?? null,
        attachment_name: uploaded?.name ?? null,
        attachment_size: uploaded?.size ?? null,
        attachment_type: uploaded?.type ?? null,
      })
      .select("*")
      .maybeSingle();

    if (error || !data) {
      setMessages((prev) => prev.map((m) => (m.id === tempId ? { ...m, _pending: false, _failed: true } : m)));
      return;
    }
    const saved = data as Msg;
    // Privacy: never tracks message body. Only flags whether an attachment was
    // included and its byte size for bandwidth attribution.
    trackUsageEvent("dm_sent", {
      metadata: {
        has_attachment: !!uploaded,
        attachment_bytes: uploaded?.size ?? 0,
      },
    });
    setMessages((prev) => {
      const withoutTemp = prev.filter((m) => m.id !== tempId);
      if (withoutTemp.find((m) => m.id === saved.id)) return withoutTemp;
      return [...withoutTemp, saved];
    });
  };

  // ---------- SEARCH + REACTION TOTALS ----------
  const filteredMessages = useMemo(() => {
    if (!search.trim()) return messages;
    const q = search.toLowerCase();
    return messages.filter((m) => (m.body || "").toLowerCase().includes(q) || (m.attachment_name || "").toLowerCase().includes(q));
  }, [messages, search]);

  // Per-thread emoji totals across all currently-loaded messages — uses the
  // shared, unit-tested helper so totals can never drift between UI and tests.
  const threadEmojiTotals = useMemo(
    () => computeReactionTotalsForMessages(reactions, messages.map((m) => m.id)),
    [reactions, messages],
  );

  // ---------- INBOX VIEW ----------
  if (!otherId) {
    return (
      <Inbox
        threads={threads}
        unreadByThread={unreadByThread}
        userId={user?.id ?? null}
        reload={loadInbox}
        setThreads={setThreads}
        loadMore={() => loadInboxPage(false)}
        hasMore={inboxHasMore}
        loading={inboxLoading}
      />
    );
  }

  // ---------- THREAD VIEW ----------
  return (
    <AppShell title={other ? `@${other.username}` : "Chat"}>
      <div className="flex flex-col h-[calc(100vh-180px)]">
        {/* Header bar */}
        <div className="px-3 py-2 border-b border-border flex items-center gap-2">
          <div className="relative flex-1">
            <Search size={14} className="absolute left-2 top-1/2 -translate-y-1/2 opacity-50" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search this thread..."
              className="h-8 pl-7 text-xs bg-input"
            />
          </div>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={toggleMute}
            disabled={muteLoading}
            aria-label={muted ? "Unmute conversation" : "Mute conversation"}
            className="h-8 px-2"
          >
            {muted ? <BellOff size={16} className="text-muted-foreground" /> : <Bell size={16} />}
          </Button>
        </div>

        {/* Per-thread emoji totals */}
        {threadEmojiTotals.length > 0 && (
          <div className="px-3 py-1.5 border-b border-border flex items-center gap-2 overflow-x-auto no-scrollbar">
            <span className="text-[10px] uppercase tracking-wide text-muted-foreground shrink-0">Reactions</span>
            {threadEmojiTotals.map(([emoji, n]) => (
              <EmojiTotalChip key={emoji} emoji={emoji} count={n} />

            ))}
          </div>
        )}

        <div ref={scrollRef} className="flex-1 overflow-y-auto px-3 py-3 space-y-2">
          {/* Top sentinel for infinite scroll */}
          <div ref={topSentinelRef} />
          {hasMore && (
            <div className="flex justify-center py-1">
              {loadingMore ? (
                <Loader2 size={14} className="animate-spin opacity-60" />
              ) : (
                <button onClick={loadMore} className="text-[10px] text-muted-foreground hover:text-foreground">
                  Load older messages
                </button>
              )}
            </div>
          )}

          {filteredMessages.map((m) => {
            const mine = m.sender_id === user?.id;
            const myReactions = reactions.filter((r) => r.message_id === m.id);
            return (
              <div key={m.id} className={`flex flex-col ${mine ? "items-end" : "items-start"}`}>
                <div
                  className={`max-w-[75%] rounded-2xl px-3 py-2 text-sm flex items-end gap-1 ${
                    mine ? "bg-gradient-gold text-primary-foreground" : "bg-muted"
                  } ${m._pending ? "opacity-70" : ""}`}
                >
                  <div className="flex flex-col gap-1 min-w-0">
                    {m.attachment_path && (
                      <DmAttachment
                        path={m.attachment_path}
                        name={m.attachment_name}
                        type={m.attachment_type}
                        size={m.attachment_size}
                      />
                    )}
                    {m.body && <span className="break-words">{highlight(m.body, search)}</span>}
                  </div>
                  <MessageStatus m={m} mine={mine} />
                </div>
                {!m._pending && (
                  <MessageReactions messageId={m.id} reactions={myReactions} onChange={() => { /* realtime keeps it fresh */ }} />
                )}
              </div>
            );
          })}
          {search && !filteredMessages.length && (
            <p className="text-center text-xs text-muted-foreground py-6">No matches in this thread.</p>
          )}
          {otherTyping && (
            <div className="flex items-center gap-1 text-xs text-muted-foreground italic px-1">
              <span className="inline-flex gap-0.5">
                <span className="w-1.5 h-1.5 bg-muted-foreground rounded-full animate-bounce" />
                <span className="w-1.5 h-1.5 bg-muted-foreground rounded-full animate-bounce [animation-delay:0.15s]" />
                <span className="w-1.5 h-1.5 bg-muted-foreground rounded-full animate-bounce [animation-delay:0.3s]" />
              </span>
              @{other?.username} is typing…
            </div>
          )}
        </div>

        {/* Pending attachment preview with progress + retry */}
        {pendingFile && (
          <div className="px-3 py-2 border-t border-border space-y-1.5">
            <div className="flex items-center gap-2 text-xs">
              <Paperclip size={14} />
              <span className="truncate flex-1">{pendingFile.name}</span>
              <span className="text-muted-foreground tabular-nums">{formatBytes(pendingFile.size)}</span>
              <button
                onClick={() => { setPendingFile(null); setUploadProgress(null); setUploadError(null); }}
                aria-label="Remove attachment"
              >
                <X size={14} />
              </button>
            </div>
            {uploadProgress !== null && uploadProgress < 100 && !uploadError && (
              <div className="h-1.5 w-full rounded-full bg-muted overflow-hidden">
                <div
                  className="h-full bg-gradient-gold transition-all"
                  style={{ width: `${uploadProgress}%` }}
                />
              </div>
            )}
            {uploadProgress !== null && uploadProgress < 100 && !uploadError && (
              <p className="text-[10px] text-muted-foreground tabular-nums">Uploading… {uploadProgress}%</p>
            )}
            {uploadError && (
              <div className="flex items-center justify-between gap-2 text-[11px] text-destructive">
                <span className="truncate">Upload failed: {uploadError}</span>
                <Button size="sm" variant="outline" className="h-6 px-2" onClick={retryUpload}>
                  <RotateCw size={12} className="mr-1" /> Retry
                </Button>
              </div>
            )}
          </div>
        )}

        <div className="p-3 border-t border-border flex gap-2 items-center">
          <input
            ref={fileInputRef}
            type="file"
            className="hidden"
            onChange={onPickFile}
            accept="image/*,application/pdf,.doc,.docx,.txt,.zip"
          />
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-9 px-2"
            onClick={() => fileInputRef.current?.click()}
            disabled={uploadProgress !== null && uploadProgress < 100}
            aria-label="Attach file"
          >
            <Paperclip size={16} />
          </Button>
          <Input
            value={text}
            onChange={(e) => { setText(e.target.value); pingTyping(); }}
            placeholder={uploadProgress !== null && uploadProgress < 100 ? "Uploading..." : "Message..."}
            className="bg-input"
            disabled={uploadProgress !== null && uploadProgress < 100}
            onKeyDown={(e) => e.key === "Enter" && send()}
          />
          <Button
            onClick={send}
            disabled={uploadProgress !== null && uploadProgress < 100}
            className="bg-gradient-gold text-primary-foreground"
          >
            <Send size={16} />
          </Button>
        </div>
      </div>
    </AppShell>
  );
}

// =====================================================================
// INBOX COMPONENT — search, filter, bulk select, confirm-delete
// =====================================================================
type InboxProps = {
  threads: any[];
  unreadByThread: Record<string, number>;
  userId: string | null;
  reload: () => Promise<void> | void;
  setThreads: React.Dispatch<React.SetStateAction<any[]>>;
  loadMore: () => Promise<void> | void;
  hasMore: boolean;
  loading: boolean;
};

type InboxFilter = "all" | "unread" | "read";

function Inbox({ threads, unreadByThread, userId, reload, setThreads, loadMore, hasMore, loading }: InboxProps) {
  const sentinelRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Infinite scroll: trigger loadMore when bottom sentinel becomes visible.
  useEffect(() => {
    const el = sentinelRef.current;
    if (!el || !hasMore) return;
    const io = new IntersectionObserver((entries) => {
      if (entries[0].isIntersecting && !loading) loadMore();
    }, { rootMargin: "240px 0px 0px 0px" });
    io.observe(el);
    return () => io.disconnect();
  }, [hasMore, loading, loadMore]);

  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<InboxFilter>("all");
  const [selectMode, setSelectMode] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [confirm, setConfirm] = useState<{ kind: "single" | "bulk"; ids: string[]; label: string } | null>(null);
  const [reportTarget, setReportTarget] = useState<{ otherId: string; username?: string } | null>(null);
  const [reportReasonCode, setReportReasonCode] = useState("harassment");
  const [reportNote, setReportNote] = useState("");
  const [reportSubmitting, setReportSubmitting] = useState(false);
  const [mutedSet, setMutedSet] = useState<Set<string>>(new Set());

  const { pinned, toggle: togglePin } = usePinnedThreads();

  // Load this user's muted DM threads + keep them synced via realtime so badges
  // stay accurate across devices/sessions.
  useEffect(() => {
    if (!userId) return;
    let alive = true;
    const refresh = async () => {
      const { data } = await supabase.from("muted_dm_threads").select("other_user_id").eq("user_id", userId);
      if (!alive) return;
      setMutedSet(new Set((data as any[] || []).map((r) => r.other_user_id)));
    };
    refresh();
    const ch = supabase
      .channel(`muted-dm-${userId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "muted_dm_threads", filter: `user_id=eq.${userId}` }, refresh)
      .subscribe();
    return () => { alive = false; supabase.removeChannel(ch); };
  }, [userId]);

  const toggleMuteThread = async (oid: string) => {
    if (!userId) return;
    const isMuted = mutedSet.has(oid);
    setMutedSet((prev) => {
      const n = new Set(prev);
      if (isMuted) n.delete(oid); else n.add(oid);
      return n;
    });
    if (isMuted) {
      await supabase.from("muted_dm_threads").delete().eq("user_id", userId).eq("other_user_id", oid);
      toast({ title: "Notifications on for this conversation" });
    } else {
      await supabase.from("muted_dm_threads").insert({ user_id: userId, other_user_id: oid });
      toast({ title: "Conversation muted" });
    }
  };

  // ---------- Pull-to-refresh (touch only) ----------
  const [pullY, setPullY] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const touchStartY = useRef<number | null>(null);
  const PULL_THRESHOLD = 70;

  const onTouchStart = (e: React.TouchEvent) => {
    const sc = scrollRef.current;
    if (!sc || sc.scrollTop > 0) return;
    touchStartY.current = e.touches[0].clientY;
  };
  const onTouchMove = (e: React.TouchEvent) => {
    if (touchStartY.current === null) return;
    const dy = e.touches[0].clientY - touchStartY.current;
    if (dy > 0) setPullY(Math.min(dy * 0.5, 100));
  };
  const onTouchEnd = async () => {
    const triggered = pullY >= PULL_THRESHOLD;
    touchStartY.current = null;
    setPullY(0);
    if (triggered && !refreshing) {
      setRefreshing(true);
      try { await reload(); } finally { setRefreshing(false); }
    }
  };

  const manualRefresh = async () => {
    if (refreshing) return;
    setRefreshing(true);
    try { await reload(); } finally { setRefreshing(false); }
  };

  // ---------- Filter + sort (pinned first) ----------
  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    const filtered = threads.filter((t) => {
      const unread = unreadByThread[t.otherId] || 0;
      if (filter === "unread" && unread === 0) return false;
      if (filter === "read" && unread > 0) return false;
      if (!q) return true;
      const uname = (t.other?.username || "").toLowerCase();
      const body = (t.body || "").toLowerCase();
      return uname.includes(q) || body.includes(q);
    });
    return filtered.sort((a, b) => {
      const ap = pinned.has(a.otherId) ? 1 : 0;
      const bp = pinned.has(b.otherId) ? 1 : 0;
      if (ap !== bp) return bp - ap;
      return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
    });
  }, [threads, unreadByThread, query, filter, pinned]);

  const allChecked = visible.length > 0 && visible.every((t) => selected.has(t.otherId));
  const toggleAll = () => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (allChecked) visible.forEach((t) => next.delete(t.otherId));
      else visible.forEach((t) => next.add(t.otherId));
      return next;
    });
  };
  const toggleOne = (oid: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(oid)) next.delete(oid); else next.add(oid);
      return next;
    });
  };
  const exitSelect = () => { setSelectMode(false); setSelected(new Set()); };

  const markRead = async (otherIds: string[], read: boolean) => {
    if (!userId || !otherIds.length) return;
    await supabase.from("messages")
      .update({ read })
      .in("sender_id", otherIds)
      .eq("receiver_id", userId);
    await reload();
    exitSelect();
  };

  const deleteThreads = async (otherIds: string[]) => {
    if (!userId || !otherIds.length) return;
    const ors = otherIds.flatMap((oid) => [
      `and(sender_id.eq.${userId},receiver_id.eq.${oid})`,
      `and(sender_id.eq.${oid},receiver_id.eq.${userId})`,
    ]).join(",");
    await supabase.from("messages").delete().or(ors);
    setThreads((prev) => prev.filter((x) => !otherIds.includes(x.otherId)));
    exitSelect();
  };

  const askDelete = (ids: string[], label: string) =>
    setConfirm({ kind: ids.length === 1 ? "single" : "bulk", ids, label });

  const blockUser = async (otherId: string, username?: string) => {
    if (!userId) return;
    const { error } = await supabase.from("blocks").insert({ blocker_id: userId, blocked_id: otherId });
    if (error && !/duplicate/i.test(error.message)) {
      toast({ title: "Couldn't block", description: error.message, variant: "destructive" });
      return;
    }
    toast({ title: `Blocked @${username ?? "user"}`, description: "They can no longer message you." });
    setThreads((prev) => prev.filter((x) => x.otherId !== otherId));
  };

  const REPORT_REASONS: { code: string; label: string }[] = [
    { code: "harassment", label: "Harassment or hate speech" },
    { code: "spam", label: "Spam or scam" },
    { code: "nudity", label: "Nudity / sexual content" },
    { code: "violence", label: "Violence or threats" },
    { code: "minor_safety", label: "Child safety / CSAE (urgent)" },
    { code: "impersonation", label: "Impersonation" },
    { code: "other", label: "Other" },
  ];

  const submitReport = async () => {
    if (!userId || !reportTarget) return;
    const label = REPORT_REASONS.find((r) => r.code === reportReasonCode)?.label ?? reportReasonCode;
    const note = reportNote.trim().slice(0, 500);
    setReportSubmitting(true);
    const { error } = await supabase.from("reports").insert({
      reporter_id: userId,
      reported_user_id: reportTarget.otherId,
      reason: label,
      reason_code: reportReasonCode,
      mod_notes: note || null,
    });
    setReportSubmitting(false);
    if (error) {
      toast({ title: "Couldn't send report", description: error.message, variant: "destructive" });
      return;
    }
    toast({ title: "Report sent", description: "Our moderators will review this." });
    setReportTarget(null);
    setReportReasonCode("harassment");
    setReportNote("");
  };

  const totalUnread = Object.entries(unreadByThread).reduce(
    (a, [oid, n]) => a + (mutedSet.has(oid) ? 0 : (n || 0)),
    0,
  );

  // ---------- Preview helper ----------
  const previewOf = (t: any): string => {
    if (t.body) return t.body;
    if (t.attachment_path) return `📎 ${t.attachment_name || "Attachment"}`;
    if (t.shared_post_id) return "↗ Shared post";
    if (t.shared_profile_id) return "↗ Shared profile";
    return "New conversation";
  };

  return (
    <AppShell title="MESSAGES">
      <div
        ref={scrollRef}
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={onTouchEnd}
        className="px-4 py-3 space-y-2 overflow-y-auto h-[calc(100vh-140px)]"
      >
        {/* Pull-to-refresh indicator */}
        <div
          className="flex justify-center items-center -mt-2 transition-all overflow-hidden"
          style={{ height: refreshing ? 32 : pullY, opacity: refreshing ? 1 : Math.min(pullY / PULL_THRESHOLD, 1) }}
        >
          <RefreshCw size={16} className={`text-muted-foreground ${refreshing ? "animate-spin" : ""}`} style={{ transform: `rotate(${pullY * 4}deg)` }} />
        </div>

        <div className="flex items-center justify-between mb-1 gap-2 flex-wrap">
          <h1 className="font-display text-xl text-gold">
            Inbox{" "}
            {totalUnread > 0 && (
              <span className="text-xs text-muted-foreground font-normal">({totalUnread} unread)</span>
            )}
          </h1>
          <div className="flex items-center gap-1.5">
            <Link to="/blocked" className="text-[11px] text-muted-foreground hover:text-foreground inline-flex items-center gap-1 px-2 h-8" aria-label="Manage blocked accounts">
              <Ban size={12} /> Blocked
            </Link>
            <Button size="sm" variant="ghost" className="h-8 px-2" onClick={manualRefresh} disabled={refreshing} aria-label="Refresh inbox">
              <RefreshCw size={14} className={refreshing ? "animate-spin" : ""} />
            </Button>
            {selectMode ? (
              <>
                <Button size="sm" variant="ghost" className="h-8 px-2 text-xs" onClick={() => markRead(Array.from(selected), true)} disabled={!selected.size}>
                  <MailOpen size={14} className="mr-1" /> Read
                </Button>
                <Button size="sm" variant="ghost" className="h-8 px-2 text-xs" onClick={() => markRead(Array.from(selected), false)} disabled={!selected.size}>
                  <Mail size={14} className="mr-1" /> Unread
                </Button>
                <Button size="sm" variant="ghost" className="h-8 px-2 text-xs text-destructive" onClick={() => askDelete(Array.from(selected), `${selected.size} conversation${selected.size === 1 ? "" : "s"}`)} disabled={!selected.size}>
                  <Trash2 size={14} className="mr-1" /> Delete
                </Button>
                <Button size="sm" variant="outline" className="h-8 px-2 text-xs" onClick={exitSelect}>Done</Button>
              </>
            ) : (
              <>
                {totalUnread > 0 && (
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-8 px-2 text-xs"
                    onClick={async () => {
                      const { error } = await supabase.rpc("mark_all_messages_read");
                      if (error) {
                        toast({ title: "Couldn't mark all read", description: error.message, variant: "destructive" });
                      } else {
                        toast({ title: "All messages marked as read" });
                        await reload();
                      }
                    }}
                  >
                    <MailOpen size={14} className="mr-1" /> Mark all read
                  </Button>
                )}
                <Button size="sm" variant="outline" className="h-8 px-2 text-xs" onClick={() => setSelectMode(true)} disabled={!threads.length}>
                  <CheckSquare size={14} className="mr-1" /> Select
                </Button>
              </>
            )}
          </div>
        </div>

        <div className="flex items-center gap-2">
          <div className="relative flex-1">
            <Search size={14} className="absolute left-2 top-1/2 -translate-y-1/2 opacity-50" />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search by user or message..."
              className="h-9 pl-7 text-sm bg-input"
            />
          </div>
          <Select value={filter} onValueChange={(v) => setFilter(v as InboxFilter)}>
            <SelectTrigger className="w-[110px] h-9 text-xs bg-input"><SelectValue /></SelectTrigger>
            <SelectContent className="z-50">
              <SelectItem value="all">All</SelectItem>
              <SelectItem value="unread">Unread</SelectItem>
              <SelectItem value="read">Read</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {selectMode && visible.length > 0 && (
          <button
            type="button"
            onClick={toggleAll}
            className="flex items-center gap-2 text-[11px] text-muted-foreground hover:text-foreground py-1"
          >
            <Checkbox checked={allChecked} onCheckedChange={toggleAll} />
            <span>{allChecked ? "Unselect" : "Select"} all visible ({visible.length})</span>
          </button>
        )}

        {visible.map((t) => {
          const isMuted = mutedSet.has(t.otherId);
          const rawUnread = unreadByThread[t.otherId] || 0;
          const unread = isMuted ? 0 : rawUnread;
          const isSelected = selected.has(t.otherId);
          const isPinned = pinned.has(t.otherId);
          const markThreadUnread = async () => {
            if (!userId) return;
            await supabase.from("messages").update({ read: false })
              .eq("sender_id", t.otherId).eq("receiver_id", userId);
            reload();
          };
          return (
            <div key={t.otherId} className={`royal-card flex items-stretch group ${isSelected ? "ring-1 ring-primary" : ""} ${isPinned ? "border-primary/40" : ""}`}>
              {selectMode && (
                <button
                  type="button"
                  onClick={() => toggleOne(t.otherId)}
                  className="px-3 flex items-center"
                  aria-label="Select thread"
                >
                  <Checkbox checked={isSelected} onCheckedChange={() => toggleOne(t.otherId)} />
                </button>
              )}
              <Link
                to={selectMode ? "#" : `/messages/${t.otherId}`}
                onClick={(e) => { if (selectMode) { e.preventDefault(); toggleOne(t.otherId); } }}
                className="flex-1 p-3 flex items-center gap-3 min-w-0"
              >
                <div className="size-10 rounded-full bg-muted overflow-hidden shrink-0">
                  {t.other?.profile_photo_url && <img loading="lazy" src={t.other.profile_photo_url} alt={t.other?.username ?? "User avatar"} className="w-full h-full object-cover" />}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-bold flex items-center gap-2">
                    {isPinned && <Pin size={11} className="text-primary fill-primary" />}
                    @{t.other?.username}
                    <button
                      type="button"
                      onClick={(e) => { e.preventDefault(); e.stopPropagation(); toggleMuteThread(t.otherId); }}
                      className={`inline-flex items-center justify-center size-5 rounded-full hover:bg-muted/60 ${isMuted ? "text-muted-foreground" : "text-muted-foreground/50 opacity-0 group-hover:opacity-100"}`}
                      aria-label={isMuted ? "Unmute conversation" : "Mute conversation"}
                      aria-pressed={isMuted}
                      title={isMuted ? "Muted — tap to unmute" : "Mute conversation"}
                    >
                      {isMuted ? <BellOff size={11} /> : <Bell size={11} />}
                    </button>
                    {unread > 0 && (
                      <span className="inline-flex items-center justify-center min-w-5 h-5 px-1.5 rounded-full bg-primary text-primary-foreground text-[10px] font-bold tabular-nums">
                        {unread > 99 ? "99+" : unread}
                      </span>
                    )}
                    {isMuted && rawUnread > 0 && (
                      <span className="text-[10px] text-muted-foreground tabular-nums" title="Unread but muted">
                        {rawUnread > 99 ? "99+" : rawUnread}
                      </span>
                    )}
                  </p>
                  <p className={`text-xs truncate ${unread > 0 ? "text-foreground font-medium" : "text-muted-foreground"}`}>
                    {isMuted && (
                      <span className="inline-flex items-center gap-1 mr-1.5 px-1.5 py-0.5 rounded-full bg-muted/60 text-[9px] uppercase tracking-wide text-muted-foreground align-middle">
                        <BellOff size={9} /> Muted
                      </span>
                    )}
                    {previewOf(t)}
                  </p>
                </div>
                <span className="text-[10px] text-muted-foreground shrink-0">{timeAgo(t.created_at)}</span>
              </Link>
              {!selectMode && (
                <div className="flex items-center px-1.5 border-l border-border/40">
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <button
                        type="button"
                        className="size-8 rounded-full hover:bg-muted/60 flex items-center justify-center text-muted-foreground"
                        aria-label="Thread actions"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <MoreVertical size={16} />
                      </button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="z-50">
                      <DropdownMenuItem onClick={() => togglePin(t.otherId)}>
                        {isPinned ? <><PinOff size={14} className="mr-2" /> Unpin</> : <><Pin size={14} className="mr-2" /> Pin to top</>}
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => toggleMuteThread(t.otherId)}>
                        {mutedSet.has(t.otherId)
                          ? <><Bell size={14} className="mr-2" /> Unmute notifications</>
                          : <><BellOff size={14} className="mr-2" /> Mute notifications</>}
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={markThreadUnread}>
                        <Mail size={14} className="mr-2" /> Mark unread
                      </DropdownMenuItem>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem onClick={() => setReportTarget({ otherId: t.otherId, username: t.other?.username })}>
                        <Flag size={14} className="mr-2" /> Report user
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => blockUser(t.otherId, t.other?.username)}>
                        <Ban size={14} className="mr-2" /> Block user
                      </DropdownMenuItem>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem
                        className="text-destructive focus:text-destructive"
                        onClick={() => askDelete([t.otherId], `your conversation with @${t.other?.username}`)}
                      >
                        <Trash2 size={14} className="mr-2" /> Delete conversation
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              )}
            </div>
          );
        })}
        {!threads.length && <p className="text-center text-sm text-muted-foreground py-8">No messages yet.</p>}
        {threads.length > 0 && !visible.length && (
          <p className="text-center text-xs text-muted-foreground py-6">
            No conversations match your search or filter.
          </p>
        )}

        {/* Infinite scroll sentinel + status row */}
        {threads.length > 0 && (
          <div ref={sentinelRef} className="py-3 flex justify-center">
            {loading ? (
              <Loader2 size={14} className="animate-spin opacity-60" />
            ) : hasMore ? (
              <button onClick={() => loadMore()} className="text-[10px] text-muted-foreground hover:text-foreground">
                Load more
              </button>
            ) : (
              <span className="text-[10px] text-muted-foreground/60">End of inbox</span>
            )}
          </div>
        )}
      </div>

      <AlertDialog open={!!confirm} onOpenChange={(o) => { if (!o) setConfirm(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {confirm?.label}?</AlertDialogTitle>
            <AlertDialogDescription>
              This permanently removes the messages from your inbox. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={async () => {
                const ids = confirm?.ids ?? [];
                setConfirm(null);
                await deleteThreads(ids);
              }}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Report user dialog */}
      <Dialog open={!!reportTarget} onOpenChange={(o) => { if (!o) { setReportTarget(null); setReportReasonCode("harassment"); setReportNote(""); } }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Report @{reportTarget?.username ?? "user"}</DialogTitle>
            <DialogDescription>
              Choose a reason. Add a short note if you want to give moderators more context.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <Select value={reportReasonCode} onValueChange={setReportReasonCode}>
              <SelectTrigger className="bg-input"><SelectValue /></SelectTrigger>
              <SelectContent className="z-50">
                {REPORT_REASONS.map((r) => (
                  <SelectItem key={r.code} value={r.code}>{r.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Textarea
              value={reportNote}
              onChange={(e) => setReportNote(e.target.value)}
              placeholder="Optional note for moderators…"
              maxLength={500}
              rows={3}
              className="bg-input"
            />
            <div className="text-right text-[10px] text-muted-foreground tabular-nums">{reportNote.length}/500</div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setReportTarget(null); setReportReasonCode("harassment"); setReportNote(""); }}>Cancel</Button>
            <Button onClick={submitReport} disabled={reportSubmitting}>
              {reportSubmitting ? <Loader2 size={14} className="animate-spin mr-1" /> : <Flag size={14} className="mr-1" />}
              Send report
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AppShell>
  );
}

