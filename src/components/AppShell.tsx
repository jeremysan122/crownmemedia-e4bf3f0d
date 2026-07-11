import { ReactNode, useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Bell, MessageCircle, Search } from "lucide-react";
import GlobalSearchDialog from "./GlobalSearchDialog";
import BottomNav from "./BottomNav";
import AppFooter from "./AppFooter";
import { CrownIcon } from "./CrownIcon";
import BrandLogo from "./BrandLogo";
import DesktopHeader from "./desktop/DesktopHeader";
import DesktopSidebar from "./desktop/DesktopSidebar";
import CreateSheet from "./create/CreateSheet";
import { useWallet } from "@/hooks/useWallet";
import { useBattleAlerts } from "@/hooks/useBattleAlerts";
import { useUnreadByType } from "@/hooks/useUnreadByType";
import { useThreadUnread } from "@/hooks/useThreadUnread";
import { useMutedThreads } from "@/hooks/useMutedThreads";
import { SHEKEL, formatShekels } from "@/lib/gifts";

interface AppShellProps {
  children: ReactNode;
  title?: string;
  showHeader?: boolean;
  rightSlot?: ReactNode;
  /** Optional right-rail content for desktop (xl+). */
  rightRail?: ReactNode;
}

export default function AppShell({ children, title, showHeader = true, rightSlot, rightRail }: AppShellProps) {
  const { wallet } = useWallet();
  const nav = useNavigate();
  const [searchOpen, setSearchOpen] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  useBattleAlerts();
  const unread = useUnreadByType();
  const dmThreads = useThreadUnread();
  const mutedSet = useMutedThreads();
  // Sum unread DMs from the messages table, excluding muted threads.
  // Source-of-truth is `messages` (not the notifications fallback) so the
  // badge stays in sync with the inbox even when notification rows lag.
  const dmCount = useMemo(
    () => Object.entries(dmThreads).reduce(
      (a, [oid, n]) => a + (mutedSet.has(oid) ? 0 : (n || 0)),
      0,
    ),
    [dmThreads, mutedSet],
  );
  // Notifications icon excludes DMs (DMs have their own icon).
  const notifCount = Math.max(0, unread.total - unread.dm);

  // Mobile header hides when the user scrolls down and returns when they
  // scroll back up (or reach the top). Prevents the logo bar from
  // reappearing mid-scroll and covering feed content.
  const [headerHidden, setHeaderHidden] = useState(false);
  const lastY = useRef(0);
  useEffect(() => {
    const onScroll = () => {
      const y = window.scrollY;
      const dy = y - lastY.current;
      if (y < 8) setHeaderHidden(false);
      else if (dy > 6) setHeaderHidden(true);
      else if (dy < -6) setHeaderHidden(false);
      lastY.current = y;
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <div className="min-h-screen flex flex-col">
      {/* Desktop header (lg+) */}
      <DesktopHeader />

      <div className="w-full lg:px-6 lg:flex lg:gap-6 flex-1">
        <DesktopSidebar onCompose={() => setCreateOpen(true)} />

        {/* Main content column — children mount exactly once to avoid duplicate dialogs/menus. */}
        <div className="flex-1 min-w-0 lg:py-5 w-full flex flex-col">
          {showHeader && (
            <header className="lg:hidden sticky top-0 z-40 bg-background/95 backdrop-blur-md supports-[backdrop-filter]:bg-background/85 border-b border-border/40 w-full px-3 py-1.5 grid grid-cols-3 items-center gap-2">
              <div className="flex items-center justify-start">
                <button
                  onClick={() => nav("/store")}
                  className="flex items-center gap-1 h-8 px-2.5 rounded-full bg-secondary/40 border border-secondary/60 hover:border-primary/60 transition text-xs"
                  aria-label="Wallet"
                >
                  <span className="text-gold font-bold">{SHEKEL}</span>
                  <span className="font-bold tabular-nums">{formatShekels(wallet.shekelBalance)}</span>
                </button>
              </div>
              <div className="flex items-center justify-center min-w-0">
                <Link to="/feed" className="flex items-center" aria-label="CrownMe home">
                  <BrandLogo size={56} priority />
                </Link>
              </div>
              <div className="flex items-center justify-end gap-0.5 shrink-0">
                {rightSlot}
                <button onClick={() => setSearchOpen(true)} className="p-2 text-muted-foreground hover:text-primary transition-colors" aria-label="Search">
                  <Search size={20} />
                </button>
                <Link to="/messages" className="relative p-2 text-muted-foreground hover:text-primary transition-colors" aria-label={`Messages${dmCount ? `, ${dmCount} unread` : ""}`}>
                  <MessageCircle size={20} />
                  {dmCount > 0 && <span className="absolute -top-0.5 -right-0.5 min-w-[16px] h-4 px-1 rounded-full bg-destructive text-destructive-foreground text-[10px] font-bold leading-4 text-center tabular-nums">{dmCount > 99 ? "99+" : dmCount}</span>}
                </Link>
                <Link to="/notifications" className="relative p-2 text-muted-foreground hover:text-primary transition-colors" aria-label={`Notifications${notifCount ? `, ${notifCount} unread` : ""}`}>
                  <Bell size={20} />
                  {notifCount > 0 && <span className="absolute -top-0.5 -right-0.5 min-w-[16px] h-4 px-1 rounded-full bg-destructive text-destructive-foreground text-[10px] font-bold leading-4 text-center tabular-nums">{notifCount > 99 ? "99+" : notifCount}</span>}
                </Link>
              </div>
            </header>
          )}

          <main className="px-0 flex-1 w-full flex flex-col pb-24 lg:pb-12">
            {title && title !== "CrownMe" && rightSlot && (
              <div className="hidden lg:flex items-center justify-end mb-4 px-1">
                <div className="flex items-center gap-1">{rightSlot}</div>
              </div>
            )}
            <div className="flex-1">{children}</div>
            <AppFooter />
          </main>
        </div>

        {/* Right rail (xl+) */}
        {rightRail}
      </div>

      <BottomNav />

      <GlobalSearchDialog open={searchOpen} onOpenChange={setSearchOpen} />
      <CreateSheet open={createOpen} onOpenChange={setCreateOpen} />

      {/* keep CrownIcon import used to avoid tree-shake regressions for legacy refs */}
      <span className="hidden"><CrownIcon size={1} /></span>
    </div>
  );
}
