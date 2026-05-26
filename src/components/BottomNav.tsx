import { NavLink, useLocation } from "react-router-dom";
import { Home, Swords, Plus, User, Clapperboard } from "lucide-react";
import { useEffect } from "react";

const items = [
  { to: "/feed", label: "Feed", icon: Home },
  { to: "/shorts", label: "Shorts", icon: Clapperboard },
  { to: "/upload", label: "Upload", icon: Plus, primary: true },
  { to: "/battles", label: "Battles", icon: Swords },
  { to: "/me", label: "Profile", icon: User },
];

export const LAST_TAB_KEY = "crownme.lastBottomTab.v1";

/** Persist the last bottom-nav tab the user is on so we can restore it next visit. */
export function rememberBottomTab(path: string) {
  if (!items.some((i) => i.to === path)) return;
  try { localStorage.setItem(LAST_TAB_KEY, path); } catch { /* noop */ }
}

/** Read the last remembered tab (or null if none / invalid). */
export function getRememberedBottomTab(): string | null {
  try {
    const v = localStorage.getItem(LAST_TAB_KEY);
    return v && items.some((i) => i.to === v) ? v : null;
  } catch { return null; }
}

export default function BottomNav() {
  const loc = useLocation();
  const hide = ["/", "/auth", "/age-gate", "/verify-age", "/onboarding"].includes(loc.pathname);

  // Persist the active tab whenever the route matches one of the bottom-nav items.
  useEffect(() => {
    if (!hide) rememberBottomTab(loc.pathname);
  }, [loc.pathname, hide]);

  if (hide) return null;
  return (
    <nav
      aria-label="Primary"
      data-testid="bottom-nav"
      className="lg:hidden fixed bottom-0 inset-x-0 z-40 glass border-t border-border/50 pb-[env(safe-area-inset-bottom,0)]"
    >
      <div className="mx-auto w-full max-w-md sm:max-w-lg flex items-end justify-between gap-0.5 px-2 pt-2 pb-2">
        {items.map(({ to, label, icon: Icon, primary }) => (
          <NavLink
            key={to}
            to={to}
            data-testid={`bottom-nav-${to.slice(1) || "root"}`}
            className={({ isActive }) =>
              `flex flex-col items-center gap-1 px-1 py-1.5 rounded-xl transition-all flex-1 min-w-0 ${
                primary
                  ? "bg-gradient-gold text-primary-foreground -mt-6 size-14 max-w-14 mx-auto justify-center gold-shadow !flex-initial"
                  : isActive
                  ? "text-primary"
                  : "text-muted-foreground hover:text-foreground"
              }`
            }
          >
            <Icon size={primary ? 26 : 20} strokeWidth={primary ? 2.5 : 2} />
            {!primary && (
              <span className="text-[10px] leading-tight font-medium tracking-wide whitespace-nowrap truncate max-w-full">
                {label}
              </span>
            )}
          </NavLink>
        ))}
      </div>
    </nav>
  );
}
