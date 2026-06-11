import { useEffect, useMemo, useState } from "react";
import { Loader2, Search, UserPlus, Users, Sparkles, BadgeCheck, X } from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import {
  fetchFollowingRecipients,
  fetchFollowerRecipients,
  fetchRecentInteractionRecipients,
  searchRecipients,
  type GiftRecipientCandidate,
  type GiftRecipientSource,
} from "@/lib/giftRecipients";

type Tab = "following" | "followers" | "recent" | "search";

const TABS: { id: Tab; label: string; icon: typeof Users }[] = [
  { id: "following", label: "Following", icon: UserPlus },
  { id: "followers", label: "Followers", icon: Users },
  { id: "recent", label: "Recent", icon: Sparkles },
  { id: "search", label: "Search", icon: Search },
];

export default function GiftRecipientPicker({
  onPick,
  onCancel,
}: {
  onPick: (recipient: GiftRecipientCandidate) => void;
  onCancel?: () => void;
}) {
  const { user } = useAuth();
  const [tab, setTab] = useState<Tab>("following");
  const [rows, setRows] = useState<GiftRecipientCandidate[]>([]);
  const [loading, setLoading] = useState(false);
  const [query, setQuery] = useState("");
  const [searchResults, setSearchResults] = useState<GiftRecipientCandidate[]>([]);

  const viewerId = user?.id;

  useEffect(() => {
    if (!viewerId || tab === "search") return;
    let cancelled = false;
    setLoading(true);
    const loader =
      tab === "following" ? fetchFollowingRecipients :
      tab === "followers" ? fetchFollowerRecipients :
      fetchRecentInteractionRecipients;
    loader(viewerId)
      .then((r) => { if (!cancelled) setRows(r); })
      .catch(() => { if (!cancelled) setRows([]); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [tab, viewerId]);

  // Debounced search
  useEffect(() => {
    if (tab !== "search" || !viewerId) return;
    const q = query.trim();
    if (q.length < 2) { setSearchResults([]); return; }
    let cancelled = false;
    setLoading(true);
    const t = window.setTimeout(() => {
      searchRecipients(viewerId, q)
        .then((r) => { if (!cancelled) setSearchResults(r); })
        .catch(() => { if (!cancelled) setSearchResults([]); })
        .finally(() => { if (!cancelled) setLoading(false); });
    }, 250);
    return () => { cancelled = true; window.clearTimeout(t); };
  }, [query, tab, viewerId]);

  const visible = tab === "search" ? searchResults : rows;

  const emptyCopy = useMemo(() => {
    if (tab === "search") return query.trim().length < 2 ? "Type at least 2 characters." : "No one matches that search.";
    if (tab === "following") return "You're not following anyone yet.";
    if (tab === "followers") return "No followers yet.";
    return "No recent interactions yet.";
  }, [tab, query]);

  return (
    <div className="p-4 space-y-3">
      <div className="flex items-center justify-between">
        <div>
          <p className="font-display text-lg text-gold">Send a Royal Gift</p>
          <p className="text-xs text-muted-foreground">Choose who to send to.</p>
        </div>
        {onCancel && (
          <button type="button" onClick={onCancel} aria-label="Close" className="size-8 rounded-full bg-background/60 hover:bg-background/80 flex items-center justify-center text-muted-foreground hover:text-foreground">
            <X size={16} />
          </button>
        )}
      </div>

      <div className="flex gap-1 p-1 rounded-full bg-background/60 border border-border/60">
        {TABS.map((t) => {
          const Icon = t.icon;
          const active = tab === t.id;
          return (
            <button
              key={t.id}
              type="button"
              onClick={() => setTab(t.id)}
              className={`flex-1 flex items-center justify-center gap-1.5 h-9 rounded-full text-xs font-semibold transition ${
                active ? "bg-gradient-gold text-primary-foreground" : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <Icon size={13} />
              <span className="hidden sm:inline">{t.label}</span>
            </button>
          );
        })}
      </div>

      {tab === "search" && (
        <div className="relative">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <input
            autoFocus
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search by @username or name…"
            className="w-full h-10 pl-9 pr-3 rounded-full bg-background/60 border border-border/60 text-sm focus:outline-none focus:border-primary/60"
          />
        </div>
      )}

      <div className="max-h-[48vh] overflow-y-auto scrollbar-none space-y-1.5">
        {loading ? (
          <div className="py-10 flex items-center justify-center text-sm text-muted-foreground">
            <Loader2 size={16} className="animate-spin mr-2" /> Loading…
          </div>
        ) : visible.length === 0 ? (
          <p className="py-10 text-center text-xs text-muted-foreground">{emptyCopy}</p>
        ) : (
          visible.map((r) => (
            <button
              key={`${r.source}-${r.id}`}
              type="button"
              onClick={() => onPick(r)}
              className="w-full flex items-center gap-3 p-2 rounded-xl bg-card/70 border border-border/60 hover:border-primary/50 text-left transition active:scale-[0.99]"
            >
              <div className="size-11 rounded-full overflow-hidden bg-muted shrink-0">
                {r.avatarUrl ? (
                  <img src={r.avatarUrl} alt="" className="w-full h-full object-cover" loading="lazy" />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-muted-foreground text-sm font-semibold">
                    {r.username.charAt(0).toUpperCase()}
                  </div>
                )}
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5 min-w-0">
                  <p className="font-semibold text-sm truncate">{r.displayName}</p>
                  {r.verified && <BadgeCheck size={13} className="text-primary shrink-0" fill="currentColor" />}
                </div>
                <p className="text-xs text-muted-foreground truncate">@{r.username}</p>
              </div>
              <span className="text-[10px] uppercase tracking-wider text-muted-foreground capitalize shrink-0">
                {r.source === "followers" ? "Follower" : r.source === "following" ? "Following" : r.source === "recent" ? "Recent" : ""}
              </span>
            </button>
          ))
        )}
      </div>
    </div>
  );
}

export type { GiftRecipientCandidate, GiftRecipientSource };
