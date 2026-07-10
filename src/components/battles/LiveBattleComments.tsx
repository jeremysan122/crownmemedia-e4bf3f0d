// Live Battle chat — realtime comments visible only while the battle is live.
// Inserts are RLS-gated on server (status = 'live' AND user_id = auth.uid()).

import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/context/AuthContext";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Send, MessageSquare } from "lucide-react";
import { toast } from "@/hooks/use-toast";

interface Row {
  id: string;
  battle_id: string;
  user_id: string;
  body: string;
  created_at: string;
  username?: string | null;
  profile_photo_url?: string | null;
}

const MAX = 240;

export default function LiveBattleComments({
  battleId,
  isLive,
}: {
  battleId: string;
  isLive: boolean;
}) {
  const { user } = useAuth();
  const [rows, setRows] = useState<Row[]>([]);
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);

  // Initial load + realtime subscription.
  useEffect(() => {
    if (!battleId) return;
    let cancelled = false;

    (async () => {
      const { data } = await supabase
        .from("live_battle_comments")
        .select("id, battle_id, user_id, body, created_at")
        .eq("battle_id", battleId)
        .order("created_at", { ascending: false })
        .limit(50);
      if (cancelled) return;
      const base = ((data as Row[]) || []).reverse();
      await hydrate(base);
      if (!cancelled) setRows(base);
    })();

    const ch = supabase
      .channel(`live-battle-comments:${battleId}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "live_battle_comments", filter: `battle_id=eq.${battleId}` },
        async (payload) => {
          const row = payload.new as Row;
          await hydrate([row]);
          setRows((prev) => [...prev.slice(-99), row]);
        },
      )
      .subscribe();

    return () => {
      cancelled = true;
      supabase.removeChannel(ch);
    };
  }, [battleId]);

  // Scroll to bottom when new rows arrive.
  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: "smooth" });
  }, [rows.length]);

  async function hydrate(list: Row[]) {
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
    }
  }

  async function submit() {
    if (!user) {
      toast({ title: "Sign in to join the chat.", variant: "destructive" });
      return;
    }
    const body = text.trim();
    if (!body || sending || !isLive) return;
    setSending(true);
    // Optimistic append.
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
    try {
      const { error } = await supabase
        .from("live_battle_comments")
        .insert({ battle_id: battleId, user_id: user.id, body });
      if (error) throw error;
    } catch (e: any) {
      // Roll back optimistic row on failure.
      setRows((prev) => prev.filter((r) => r.id !== optimistic.id));
      toast({
        title: "Couldn't send your comment.",
        description: /policy|denied/i.test(e?.message || "") ? "This battle isn't live anymore." : "Please try again.",
        variant: "destructive",
      });
    } finally {
      setSending(false);
    }
  }

  return (
    <section
      className="border-t border-border bg-card/60"
      data-testid="live-battle-comments"
      aria-label="Live battle chat"
    >
      <header className="flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
        <MessageSquare className="w-3.5 h-3.5" /> Live chat
        <span className="text-[10px] text-muted-foreground/70 normal-case ml-auto">
          {rows.length} {rows.length === 1 ? "comment" : "comments"}
        </span>
      </header>
      <div
        ref={listRef}
        className="max-h-52 min-h-[6rem] overflow-y-auto px-3 pb-2 space-y-1.5"
        data-testid="live-battle-comments-list"
      >
        {rows.length === 0 ? (
          <p className="text-xs text-muted-foreground text-center py-4">
            {isLive ? "Be the first to say something." : "Chat opens when the battle goes live."}
          </p>
        ) : (
          rows.map((r) => (
            <div key={r.id} className="flex items-start gap-2" data-testid="live-battle-comment">
              {r.profile_photo_url ? (
                <img src={r.profile_photo_url} alt="" className="w-6 h-6 rounded-full object-cover shrink-0" />
              ) : (
                <div className="w-6 h-6 rounded-full bg-muted shrink-0" aria-hidden />
              )}
              <div className="min-w-0 text-sm leading-snug">
                <span className="font-semibold text-foreground/90 mr-1.5">
                  @{r.username ?? r.user_id.slice(0, 6)}
                </span>
                <span className="text-foreground/80 break-words">{r.body}</span>
              </div>
            </div>
          ))
        )}
      </div>
      <form
        className="flex items-center gap-2 border-t border-border/60 px-3 py-2"
        onSubmit={(e) => { e.preventDefault(); submit(); }}
      >
        <Input
          value={text}
          onChange={(e) => setText(e.target.value.slice(0, MAX))}
          placeholder={isLive ? "Say something…" : "Chat is closed"}
          disabled={!isLive || sending || !user}
          maxLength={MAX}
          data-testid="live-battle-comment-input"
          aria-label="Live battle chat message"
        />
        <Button
          type="submit"
          size="icon"
          disabled={!isLive || sending || !user || !text.trim()}
          aria-label="Send comment"
          data-testid="live-battle-comment-send"
        >
          <Send className="w-4 h-4" />
        </Button>
      </form>
    </section>
  );
}
