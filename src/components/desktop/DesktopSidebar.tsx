import { NavLink, useLocation } from "react-router-dom";
import { Home, Swords, Map, Plus, User, Trophy, Store, MessageCircle, Bell, Settings as SettingsIcon, Clapperboard } from "lucide-react";

const items = [
  { to: "/feed", label: "Feed", icon: Home },
  { to: "/shorts", label: "Shorts", icon: Clapperboard },
  { to: "/battles", label: "Battles", icon: Swords },
  { to: "/map", label: "Crown Map", icon: Map },
  { to: "/leaderboard", label: "Leaderboards", icon: Trophy },
  { to: "/store", label: "Royal Store", icon: Store },
  { to: "/messages", label: "Messages", icon: MessageCircle },
  { to: "/notifications", label: "Notifications", icon: Bell },
  { to: "/me", label: "Profile", icon: User },
  { to: "/settings", label: "Settings", icon: SettingsIcon },
];

interface DesktopSidebarProps {
  onCompose?: () => void;
}

export default function DesktopSidebar({ onCompose }: DesktopSidebarProps) {
  const loc = useLocation();
  const handleCompose = onCompose ?? (() => { window.location.href = "/upload"; });
  return (
    <aside className="hidden lg:flex sticky top-[68px] h-[calc(100vh-84px)] w-[260px] shrink-0 flex-col gap-1 pr-2 pt-9">
      <nav className="flex-1 flex flex-col gap-1">
        {items.map(({ to, label, icon: Icon }) => {
          const active = loc.pathname === to || (to === "/me" && loc.pathname.startsWith("/u/"));
          return (
            <NavLink
              key={to}
              to={to}
              className={`group flex items-center gap-3 px-4 py-2.5 rounded-xl transition-all border ${
                active
                  ? "bg-gradient-to-r from-primary/15 to-transparent border-primary/40 text-primary shadow-[0_0_24px_-8px_hsl(43_95%_60%/0.6)]"
                  : "border-transparent text-muted-foreground hover:text-foreground hover:bg-secondary/30 hover:border-secondary/40 hover:shadow-[0_0_24px_-12px_hsl(270_80%_55%/0.7)]"
              }`}
            >
              <Icon size={18} strokeWidth={active ? 2.4 : 2} />
              <span className={`text-sm font-medium tracking-wide ${active ? "font-semibold" : ""}`}>{label}</span>
            </NavLink>
          );
        })}
      </nav>

      <button
        onClick={handleCompose}
        className="mt-3 w-full h-12 rounded-xl bg-gradient-gold text-primary-foreground font-bold tracking-wider gold-shadow flex items-center justify-center gap-2 hover:opacity-95 transition"
      >
        <Plus size={18} strokeWidth={2.6} /> Crown a Post
      </button>
    </aside>
  );
}
