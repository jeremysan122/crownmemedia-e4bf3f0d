import { NavLink, useLocation, useNavigate } from "react-router-dom";
import { Home, Plus, User, Clapperboard, Trophy, MapPin, Swords, Bell } from "lucide-react";
import { useEffect, useState } from "react";
import { useAuth } from "@/context/AuthContext";
import { useUnreadByType } from "@/hooks/useUnreadByType";
import CreateSheet from "@/components/create/CreateSheet";

// Items used for *navigation* persistence + rendering. The `+` button is
// intentionally NOT a nav link — it opens an Instagram-style create sheet.
const items = [
  { to: "/feed", label: "Feed", icon: Home },
  { to: "/scrolls", label: "Scrolls", icon: Clapperboard },
  { to: "/map", label: "Map", icon: MapPin },
  { to: "__create__", label: "Create", icon: Plus, primary: true as const },
  { to: "/battles", label: "Battles", icon: Swords },
  { to: "/leaderboard", label: "Ranks", icon: Trophy },
  { to: "/notifications", label: "Alerts", icon: Bell, badge: "notif" as const },
  { to: "/me", label: "Profile", icon: User },
];

export const LAST_TAB_KEY = "crownme.lastBottomTab.v1";

// Routes we don't want to "restore" on next visit because they're immersive
// (Scrolls hides the bottom-nav and replaces history awkwardly when re-entered
// from the Splash redirect). Map is fine because it's a normal tabbed page.
const NON_RESTORABLE = new Set<string>(["/scrolls", "/shorts"]);

const isRealRoute = (path: string) => items.some((i) => i.to === path);

/** Persist the last bottom-nav tab the user is on so we can restore it next visit. */
export function rememberBottomTab(path: string) {
  if (!isRealRoute(path)) return;
  if (NON_RESTORABLE.has(path)) return;
  try { localStorage.setItem(LAST_TAB_KEY, path); } catch { /* noop */ }
}

/** Read the last remembered tab (or null if none / invalid). */
export function getRememberedBottomTab(): string | null {
  try {
    const v = localStorage.getItem(LAST_TAB_KEY);
    if (!v) return null;
    if (NON_RESTORABLE.has(v)) return null;
    return isRealRoute(v) ? v : null;
  } catch { return null; }
}

export default function BottomNav() {
  const loc = useLocation();
  const nav = useNavigate();
  const { profile } = useAuth();
  const unread = useUnreadByType();
  // Notifications badge = all unread notifications except DMs (DMs have their
  // own icon in the top header). Realtime updates arrive via the shared
  // useUnreadByType singleton, with a focus/visibility refresh fallback so
  // the count stays accurate even if the websocket drops.
  const notifCount = Math.max(0, unread.total - unread.dm);
  const notifBadge = notifCount > 99 ? "99+" : String(notifCount);
  const [createOpen, setCreateOpen] = useState(false);
  const hide = ["/", "/auth", "/age-gate", "/verify-age", "/onboarding"].includes(loc.pathname);
  const profilePath = profile?.username ? `/${profile.username}` : "/me";

  // Persist the active tab whenever the route matches one of the bottom-nav items.
  useEffect(() => {
    if (!hide) rememberBottomTab(loc.pathname);
  }, [loc.pathname, hide]);

  if (hide) return null;
  return (
    <>
      <nav
        aria-label="Primary"
        data-testid="bottom-nav"
        className="lg:hidden fixed bottom-0 inset-x-0 z-40 glass border-t border-border/50 pb-[env(safe-area-inset-bottom,0)]"
      >
        <div className="mx-auto w-full max-w-xl flex items-end justify-between gap-0 px-1 pt-2 pb-2 overflow-hidden">
          {items.map(({ to, label, icon: Icon, primary }) => {
            // Special-case the `+` button — opens the create sheet instead of routing.
            if (primary) {
              return (
                <button
                  key={to}
                  type="button"
                  onClick={() => setCreateOpen(true)}
                  aria-label="Create"
                  data-testid="bottom-nav-create"
                  className="flex flex-col items-center justify-center bg-gradient-gold text-primary-foreground -mt-6 size-14 max-w-14 mx-auto rounded-xl gold-shadow active:scale-95 transition-transform"
                >
                  <Icon size={26} strokeWidth={2.5} />
                </button>
              );
            }
            const href = to === "/me" ? profilePath : to;
            const showBadge = (item as any).badge === "notif" && notifCount > 0;
            return (
              <NavLink
                key={to}
                to={href}
                replace={loc.pathname === href}
                data-testid={`bottom-nav-${to === "/me" ? "profile" : to.slice(1) || "root"}`}
                className={({ isActive }) =>
                  `relative flex flex-col items-center gap-1 px-0.5 py-1.5 rounded-xl transition-all flex-1 min-w-0 ${
                    isActive || (to === "/me" && loc.pathname.startsWith("/u/"))
                      ? "text-primary"
                      : "text-muted-foreground hover:text-foreground"
                  }`
                }
                aria-label={showBadge ? `${label}, ${notifCount} unread` : label}
              >
                <div className="relative">
                  <Icon size={19} strokeWidth={2} />
                  {showBadge && (
                    <span
                      data-testid="bottom-nav-notif-badge"
                      className="absolute -top-1.5 -right-2 min-w-[16px] h-4 px-1 rounded-full bg-destructive text-destructive-foreground text-[9px] font-bold leading-4 text-center tabular-nums"
                    >
                      {notifBadge}
                    </span>
                  )}
                </div>
                <span className="text-[9px] leading-tight font-medium tracking-wide whitespace-nowrap truncate max-w-full">
                  {label}
                </span>
              </NavLink>
            );
          })}
        </div>
      </nav>

      <CreateSheet open={createOpen} onOpenChange={setCreateOpen} />
    </>
  );
}
