import { useEffect, useMemo, useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { VisuallyHidden } from "@radix-ui/react-visually-hidden";
import { Loader2, MessageCircle, Search, UserPlus } from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import {
  fetchFollowingRecipients,
  searchRecipients,
  type GiftRecipientCandidate,
} from "@/lib/giftRecipients";

export type GiftDmRecipient = {
  userId: string;
  username: string;
  displayName?: string;
  avatarUrl?: string | null;
  verified?: boolean;
};

type ThreadRow = {
  partnerId: string;
  partner: GiftRecipientCandidate;
  lastAt: string;
};

/**
 * Picks a recipient to gift via DM. Surfaces existing DM threads first,
 * falls back to followed users, and supports username search.
 */
export default function GiftDmPicker({
  open,
  onOpenChange,
  onPick,
  giftName,
  giftCost,
  giftIcon,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onPick: (r: GiftDmRecipient) => void;
  giftName: string;
  giftCost: number;
  giftIcon?: string;
}) {
  const { user } = useAuth();
  const [threads, setThreads] = useState<ThreadRow[]>([]);
  const [following, setFollowing] = useState<GiftRecipientCandidate[]>([]);
  const [query, setQuery] = useState("");
  const [searchResults, setSearchResults] = useState<GiftRecipientCandidate[]>([]);
  const [loading, setLoading] = useState(false);
  const [searching, setSearching] = useState(false);

  useEffect(() => {
    if (!open || !user) return;
    try { (window as any).analytics?.track?.("dm_gift_picker_opened", { gift_name: giftName }); } catch {}
    let cancelled = false;
    setLoading(true);

    (async () => {
      const PROFILE = "id, username, first_name, last_name, profile_photo_url, verified, is_banned, is_suspended";
      const [{ data: dms }, follows] = await Promise.all([
        supabase
          .from("messages")
          .select(`sender_id, receiver_id, created_at,
            sender:profiles!messages_sender_id_fkey(${PROFILE}),
            receiver:profiles!messages_receiver_id_fkey(${PROFILE})`)
          .or(`sender_id.eq.${user.id},receiver_id.eq.${user.id}`)
          .order("created_at", { ascending: false })
          .limit(80),
        fetchFollowingRecipients(user.id),
      ]);

      if (cancelled) return;

      const seen = new Map<string, ThreadRow>();
      ((dms as any[]) || []).forEach((row) => {
        const isMineSender = row.sender_id === user.id;
        const partnerId: string = isMineSender ? row.receiver_id : row.sender_id;
        if (partnerId === user.id) return;
        const profileRow = isMineSender ? row.receiver : row.sender;
        if (!profileRow || profileRow.is_banned || profileRow.is_suspended || !profileRow.username) return;
        if (seen.has(partnerId)) return;
        const display = [profileRow.first_name, profileRow.last_name].filter(Boolean).join(" ").trim() || profileRow.username;
        seen.set(partnerId, {
          partnerId,
          lastAt: row.created_at,
          partner: {
            id: profileRow.id,
            username: profileRow.username,
            displayName: display,
            avatarUrl: profileRow.profile_photo_url,
            verified: !!profileRow.verified,
            source: "recent",
          },
        });
      });

      setThreads(Array.from(seen.values()));
      setFollowing(follows);
      setLoading(false);
    })();

    return () => { cancelled = true; };
  }, [open, user?.id]);

  // Debounced search
  useEffect(() => {
    if (!user || !open) return;
    const q = query.trim();
    if (q.length < 2) { setSearchResults([]); return; }
    setSearching(true);
    const id = setTimeout(async () => {
      const rows = await searchRecipients(user.id, q);
      setSearchResults(rows);
      setSearching(false);
    }, 220);
    return () => clearTimeout(id);
  }, [query, user?.id, open]);

  const list = useMemo<GiftRecipientCandidate[]>(() => {
    if (query.trim().length >= 2) return searchResults;
    const partners = threads.map((t) => t.partner);
    const partnerIds = new Set(partners.map((p) => p.id));
    const extra = following.filter((f) => !partnerIds.has(f.id));
    return [...partners, ...extra];
  }, [threads, following, searchResults, query]);

  const hasQuery = query.trim().length >= 2;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md bg-gradient-card border-border/70 p-0 overflow-hidden rounded-2xl">
        <VisuallyHidden>
          <DialogTitle>Send gift via direct message</DialogTitle>
          <DialogDescription>Pick a contact from your inbox or followers to send this gift to.</DialogDescription>
        </VisuallyHidden>

        <div className="p-4 border-b border-border/60 space-y-3">
          <div className="flex items-center gap-2">
            {giftIcon && <span className="text-2xl" aria-hidden>{giftIcon}</span>}
            <div className="min-w-0">
              <p className="font-display text-lg text-gold truncate">Send {giftName} via DM</p>
              <p className="text-xs text-muted-foreground">Costs ₪{giftCost.toLocaleString()} · they'll get a chat + notification</p>
            </div>
          </div>
          <label className="relative block">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <input
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search by @username or name…"
              className="w-full h-10 pl-9 pr-3 rounded-full bg-input/70 border border-border focus:border-primary/60 focus:outline-none text-sm"
            />
          </label>
        </div>

        <div className="max-h-[55vh] overflow-y-auto p-2">
          {(loading || searching) && list.length === 0 ? (
            <div className="py-10 flex items-center justify-center text-sm text-muted-foreground">
              <Loader2 size={14} className="animate-spin mr-2" /> Loading…
            </div>
          ) : list.length === 0 ? (
            <div className="py-10 text-center space-y-2">
              <MessageCircle size={28} className="mx-auto text-muted-foreground opacity-70" />
              <p className="text-sm font-semibold">No one to message yet</p>
              <p className="text-xs text-muted-foreground px-6">
                {hasQuery ? "No users matched that search." : "Start a conversation or follow creators to send gifts via DM."}
              </p>
            </div>
          ) : (
            <>
              {!hasQuery && threads.length > 0 && (
                <p className="px-3 pt-2 pb-1 text-[10px] uppercase tracking-wider text-muted-foreground">Recent chats</p>
              )}
              {list.map((p, i) => {
                const isFollowing = !hasQuery && i >= threads.length;
                return (
                  <div key={p.id}>
                    {isFollowing && i === threads.length && (
                      <p className="px-3 pt-3 pb-1 text-[10px] uppercase tracking-wider text-muted-foreground flex items-center gap-1">
                        <UserPlus size={10} /> People you follow
                      </p>
                    )}
                    <button
                      type="button"
                      onClick={() => onPick({
                        userId: p.id,
                        username: p.username,
                        displayName: p.displayName,
                        avatarUrl: p.avatarUrl,
                        verified: p.verified,
                      })}
                      className="w-full flex items-center gap-3 p-2 rounded-xl hover:bg-card/70 border border-transparent hover:border-border/60 text-left transition active:scale-[0.99]"
                    >
                      <div className="size-11 rounded-full bg-muted overflow-hidden shrink-0">
                        {p.avatarUrl ? (
                          <img src={p.avatarUrl} alt="" className="w-full h-full object-cover" loading="lazy" />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center text-sm font-bold text-muted-foreground">
                            {p.username[0]?.toUpperCase()}
                          </div>
                        )}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-semibold truncate">{p.displayName || p.username}</p>
                        <p className="text-xs text-muted-foreground truncate">@{p.username}</p>
                      </div>
                      <span className="text-[10px] font-bold uppercase tracking-wider text-primary opacity-80">Send →</span>
                    </button>
                  </div>
                );
              })}
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
