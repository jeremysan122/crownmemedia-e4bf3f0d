import { useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Bell, MessageCircle, Search, Plus } from "lucide-react";
import BrandLogo from "@/components/BrandLogo";
import { useAuth } from "@/context/AuthContext";
import { useWallet } from "@/hooks/useWallet";
import { formatScore } from "@/lib/crown";
import GlobalSearchDialog from "@/components/GlobalSearchDialog";
import CreateSheet from "@/components/create/CreateSheet";
import { useUnreadByType } from "@/hooks/useUnreadByType";
import { useThreadUnread } from "@/hooks/useThreadUnread";
import { useMutedThreads } from "@/hooks/useMutedThreads";

export default function DesktopHeader() {
  const nav = useNavigate();
  const { profile } = useAuth();
  const { wallet } = useWallet();
  const [searchOpen, setSearchOpen] = useState(false);
  const profilePath = profile?.username ? `/u/${profile.username}` : "/me";
  const [createOpen, setCreateOpen] = useState(false);
  const unread = useUnreadByType();
  const dmThreads = useThreadUnread();
  const mutedSet = useMutedThreads();
  const dmCount = useMemo(
    () => Object.entries(dmThreads).reduce((a, [oid, n]) => a + (mutedSet.has(oid) ? 0 : (n || 0)), 0),
    [dmThreads, mutedSet],
  );
  const notifCount = Math.max(0, unread.total - unread.dm);

  return (
    <header className="hidden lg:block sticky top-0 z-40 glass border-b border-border/50">
      <div className="w-full h-[68px] px-6 flex items-center gap-6">
        <Link to="/feed" className="flex items-center shrink-0" aria-label="CrownMe home">
          <BrandLogo size={64} priority />
        </Link>

        <div className="flex-1 min-w-0">
          <button
            onClick={() => setSearchOpen(true)}
            className="relative w-full h-10 pl-10 pr-4 rounded-full bg-input/70 border border-border hover:border-primary/60 transition text-sm text-left text-muted-foreground/70"
          >
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            Search royals, cities, crowns…
          </button>
        </div>

        <div className="flex items-center gap-1.5">
          <button
            onClick={() => nav("/store")}
            className="flex items-center gap-1.5 h-10 px-3 rounded-full bg-secondary/40 border border-secondary/60 hover:border-primary/60 transition text-sm"
            aria-label="Wallet"
          >
            <span className="text-gold font-bold">₪</span>
            <span className="font-bold tabular-nums">{formatScore(wallet.shekelBalance)}</span>
          </button>
          <Link
            to="/messages"
            className="relative size-10 rounded-full hover:bg-secondary/30 flex items-center justify-center text-muted-foreground hover:text-primary transition"
            aria-label={`Messages${dmCount ? `, ${dmCount} unread` : ""}`}
          >
            <MessageCircle size={18} />
            {dmCount > 0 && (
              <span className="absolute top-1 right-1 min-w-[16px] h-4 px-1 rounded-full bg-destructive text-destructive-foreground text-[10px] font-bold leading-4 text-center tabular-nums">
                {dmCount > 99 ? "99+" : dmCount}
              </span>
            )}
          </Link>
          <Link
            to="/notifications"
            className="relative size-10 rounded-full hover:bg-secondary/30 flex items-center justify-center text-muted-foreground hover:text-primary transition"
            aria-label={`Notifications${notifCount ? `, ${notifCount} unread` : ""}`}
          >
            <Bell size={18} />
            {notifCount > 0 && (
              <span className="absolute top-1 right-1 min-w-[16px] h-4 px-1 rounded-full bg-destructive text-destructive-foreground text-[10px] font-bold leading-4 text-center tabular-nums">
                {notifCount > 99 ? "99+" : notifCount}
              </span>
            )}
          </Link>
          <button
            onClick={() => setCreateOpen(true)}
            className="ml-1 h-10 px-4 rounded-full bg-gradient-gold text-primary-foreground font-bold text-sm tracking-wider gold-shadow flex items-center gap-1.5 hover:opacity-95 transition"
          >
            <Plus size={16} strokeWidth={2.6} /> Create
          </button>
          <Link to={profilePath} className="ml-1 size-10 rounded-full overflow-hidden ring-1 ring-border hover:ring-primary transition bg-muted shrink-0">
            {profile?.profile_photo_url ? (
              <img loading="lazy" src={profile.profile_photo_url} alt={profile.username} className="w-full h-full object-cover" />
            ) : (
              <div className="w-full h-full flex items-center justify-center text-xs font-bold text-muted-foreground">
                {profile?.username?.[0]?.toUpperCase() ?? "?"}
              </div>
            )}
          </Link>
        </div>
      </div>
      <GlobalSearchDialog open={searchOpen} onOpenChange={setSearchOpen} />
      <CreateSheet open={createOpen} onOpenChange={setCreateOpen} />
    </header>
  );
}
